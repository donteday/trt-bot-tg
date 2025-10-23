// actions/loveFull.js
const db = require("../db");
const { userStreams } = require("../utils/streaming");
const { buildLovePromptFull } = require("../utils/lovePrompts");
const { askOpenAIStreaming } = require("../utils/streaming");
const { splitIntoChunks, sendNoQuestionsMessage } = require("../utils/helpers");
const { getLovePair } = require("../state/loveCache");
/**
 * Action — делает полный анализ совместимости (–3 вопроса)
 */
async function loveFullAction(ctx) {
  const userId = ctx.from.id;
  await ctx.answerCbQuery().catch(() => { });

  // Получаем данные последней пары
  const pair = getLovePair(userId);
  if (!pair) {
    return ctx.reply("⚠️ Не удалось найти последние данные. Запустите /love заново.");
  }
  const { name1, date1, name2, date2 } = pair;

  // Проверяем баланс
  const user = await db.getUser(userId);
  if (!user || user.questionsLeft < 3) {
    return sendNoQuestionsMessage(ctx);
  }

  // Списываем 3 вопроса
  for (let i = 0; i < 3; i++) await db.useQuestion(userId);

  // Генерируем промпт
  const prompt = buildLovePromptFull(name1, date1, name2, date2);

  let currentText = "💞\n\n";
  let lastUpdate = Date.now();
  userStreams.set(userId, true);
  const waitingMsg = await ctx.reply("🔮 Полный разбор совместимости...");
  console.log('Полная совместимость 💞', userId);
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
      console.error("Ошибка в loveFullAction:", error);
      userStreams.delete(userId);
      await ctx.reply("❌ Не удалось завершить разбор. Попробуйте позже.");
    }
  })();
}

module.exports = { loveFullAction };
