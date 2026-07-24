const { Readable } = require("node:stream");
const fetch = require("node-fetch");

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = "https://api.deepseek.com/v1/chat/completions";

const userStreams = new Map();

async function askOpenAIStreaming(userId, prompt, onChunk, onComplete) {
  if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY не установлен");
  if (!prompt || typeof prompt !== "string") throw new Error("Неверный формат prompt");

  // Прерываем старый поток, если есть
  if (userStreams.has(userId)) {
    const streamData = userStreams.get(userId);
    if (streamData?.abortController) {
      console.log(`⚠️ Прерываю поток пользователя ${userId}`);
      streamData.abortController.abort();
    }
  }

  const abortController = new AbortController();
  userStreams.set(userId, { abortController });

  // Таймаут 60 сек на подключение к DeepSeek
  const fetchTimeoutId = setTimeout(() => {
    abortController.abort(new Error("DeepSeek fetch timeout after 60s"));
  }, 60000);

  let fullResponse = "";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [
          {
            role: "system",
            content:
              "Ты профессиональный таролог, делаешь расклады глубоко, мудро и вдохновляюще. Пиши по-русски, структурированно и бережно.",
          },
          { role: "user", content: prompt },
        ],
        stream: true,
        temperature: 1,
        max_tokens: 8000,
      }),
      signal: abortController.signal,
    });

    clearTimeout(fetchTimeoutId);

    if (!response.ok || response.headers.get("content-type")?.includes("text/html")) {
      const text = await response.text();
      throw new Error(`⚠️ DeepSeek вернул HTML (Cloudflare error):\n${text.slice(0, 300)}...`);
    }

    const decoder = new TextDecoder("utf-8");

    // Node.js stream
    const stream = response.body;
    let lineBuffer = ""; // буфер для неполных SSE-строк между чанками

    stream.on("error", (err) => {
      console.error(`❌ Поток пользователя ${userId} завершился с ошибкой:`, err);
    });

    stream.on("data", (chunk) => {
      lineBuffer += decoder.decode(chunk, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop(); // последняя строка может быть неполной — откладываем

      for (const line of lines) {
        if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              onChunk(content); // не await — stream не ждёт async, вызываем синхронно
            }
            const finishReason = data.choices?.[0]?.finish_reason;
            if (finishReason === "length") {
              const notice = "\n\n⚠️ _Ответ был обрезан из-за ограничения длины. Попробуйте задать более конкретный вопрос._";
              fullResponse += notice;
              onChunk(notice);
            }
          } catch (e) {
            // игнорируем JSON ошибки (неполные строки уже отложены в буфер)
          }
        }
      }
    });

    await new Promise((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("close", resolve);
      stream.on("error", reject);
      abortController.signal.addEventListener("abort", () => {
        reject(new Error("AbortError"));
      });
    });

    await onComplete(fullResponse);
  } catch (error) {
    clearTimeout(fetchTimeoutId);
    if (error.message === "AbortError" || error.message?.includes("timeout")) {
      console.log(`🚫 Поток ${userId} остановлен или истёк таймаут`);
    } else if (error.code === "ECONNRESET") {
      console.log(`⚠️ Поток ${userId} был сброшен соединением (ECONNRESET)`);
    } else {
      console.error("❌ Streaming error:", error);
    }
    throw error;
  } finally {
    userStreams.delete(userId);
  }

  return fullResponse;
}

module.exports = { askOpenAIStreaming, userStreams };
