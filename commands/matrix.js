// commands/matrix.js
const db = require("../db");
const { askOpenAIStreaming, userStreams } = require("../utils/streaming");
const { buildMatrixPrompt } = require("../utils/promptMatrix");
const { sendNoQuestionsMessage, splitIntoChunks } = require("../utils/helpers");
const { userStates } = require("../state/userStates");
const { Markup } = require("telegraf");

function matrixCommand(ctx) {
  const message = `
  🔮 **Матрица судьбы** — это персональный нумерологический и эзотерический разбор твоей даты рождения.  
  
  Ты получишь:
  • 🌞 описание твоих ключевых энергий и миссии  
  • 💫 сильные и слабые стороны  
  • 💞 личные и кармические уроки  
  • 💼 путь реализации и совет судьбы  
  
  Это **текстовый разбор**, а не изображение — подробное объяснение в сообщении от таролога.  
  💰 Стоимость — *3 запроса*.
    `.trim();

  return ctx.reply(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🚀 Получить матрицу", "matrix_start")],
    ]),
  });
}

async function matrixHandler(ctx) {
  const userId = ctx.from.id;
  const text = (ctx.message?.text || "").trim();
  const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
  if (!dateRegex.test(text)) {
    return ctx.reply("⚠️ Введите дату в формате ДД.ММ.ГГГГ, например 18.02.1995");
  }

  const user = await db.getUser(userId);

  // списываем 3 вопроса
  for (let i = 0; i < 3; i++) await db.useQuestion(userId);

  userStates.delete(userId);

  const prompt = buildMatrixPrompt(text);
  const waitingMsg = await ctx.reply("✨ Составляю Матрицу судьбы, это займёт несколько секунд... 🔮");
  console.log('Матрица судьбы 🌌', userId);


  let currentText = "";
  let lastUpdate = Date.now();
  userStreams.set(userId, true);
  (async () => {
    try {
      await askOpenAIStreaming(
        userId,
        prompt,
        async (chunk) => {
          currentText += chunk;
          if (Date.now() - lastUpdate > 3000) {
            lastUpdate = Date.now();
            const preview = currentText.slice(-1000);
            await ctx.telegram
              .editMessageText(
                waitingMsg.chat.id,
                waitingMsg.message_id,
                undefined,
                preview + " 🔮"
              )
              .catch(() => { });
          }
        },
        async (finalText) => {
          const chunks = splitIntoChunks(finalText, 3500);


          // Первая часть — в старое сообщение
          try {
            await ctx.telegram.editMessageText(
              waitingMsg.chat.id,
              waitingMsg.message_id,
              undefined,
              chunks[0]
            );
          } catch {
            await ctx.reply(chunks[0]).catch(() => { });
          }

          // Остальное — новыми сообщениями
          for (let i = 1; i < chunks.length; i++) {
            await ctx.reply(chunks[i]).catch(() => { });
          }

          userStreams.delete(userId);
        }
      );
    } catch (error) {
      console.error("Ошибка в matrix:", error);
      userStreams.delete(userId);
      await ctx.reply("❌ Не удалось завершить разбор. Попробуйте позже.");
    }
  })();

  return;
}

module.exports = { matrixCommand, matrixHandler };
