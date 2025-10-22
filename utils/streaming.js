const { Readable } = require("node:stream");
const fetch = require("node-fetch");

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = "https://api.deepseek.com/v1/chat/completions";

// 🧠 карта активных стримов по userId
const userStreams = new Map();

/**
 * Потоковый запрос к DeepSeek API
 * @param {number|string} userId - ID пользователя
 * @param {string} prompt - Вопрос
 * @param {function} onChunk - Колбэк при каждом фрагменте
 * @param {function} onComplete - Колбэк по завершении
 */
async function askOpenAIStreaming(userId, prompt, onChunk, onComplete) {
  if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY не установлен");
  if (!prompt || typeof prompt !== "string")
    throw new Error("Неверный формат prompt");

  // если у пользователя уже идёт стрим — отменяем его
  if (userStreams.has(userId)) {
  const streamData = userStreams.get(userId);
  if (streamData?.abortController) {
    console.log(`⚠️ Прерываю поток пользователя ${userId}`);
    streamData.abortController.abort();
  }
}

  const abortController = new AbortController();
  userStreams.set(userId, { abortController });

  let fullResponse = "";
  let streamCompleted = false;
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
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
        max_tokens: 2000,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}\n${text}`);
    }

    const reader = Readable.toWeb(response.body).getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              await onChunk(content);
            }
          } catch {}
        }
      }
    }

    await onComplete(fullResponse);
  } catch (error) {
    if (abortController.signal.aborted) {
      console.log(`🚫 Поток ${userId} остановлен пользователем`);
    } else {
      console.error("❌ Streaming error:", error);
    }
    throw error;
  } finally {
    if (!streamCompleted) {
      // 🔧 fallback: гарантированно вызвать onComplete
      try {
        await onComplete(fullResponse);
      } catch {}
    }
    userStreams.delete(userId);
  }

  return fullResponse;
}

module.exports = { askOpenAIStreaming, userStreams };
