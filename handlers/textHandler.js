// handlers/textHandler.js
const fs = require("fs");
const dayjs = require("dayjs");
const db = require("../db");
const { tarotDeck } = require("../deck/deck");
const { userStates } = require("../state/userStates");
const {
  drawCards,
  generateMergedImage,
  buildPromptTarot,
  askOpenAIStreaming,
  userStreams,
  checkCollections,
  isValidQuestion,
  sendNoQuestionsMessage,
  SUIT_EMOJI,
} = require("../utils");
const { getCardName, buildDailyCardPrompt } = require("../commands/daily");
const { handleLoveSteps } = require("../commands/love");

/**
 * Основная обработка текстовых сообщений пользователя.
 * Здесь:
 * - определяются состояния (ввод email / даты рождения)
 * - выполняются расклады
 * - происходит стриминг ответа от DeepSeek
 */
module.exports = function registerTextHandler(bot) {
  bot.on("text", async (ctx) => {
    const userId = ctx.from.id;
    const question = (ctx.message?.text || "").trim();
    console.log("📩 Пользователь:", userId, "|", ctx.from.username || "");

    // Предотвращаем параллельные стримы
    if (userStreams.has(userId)) {
      return ctx.reply("⏳ Подождите, текущий ответ ещё не готов...");
    }

    const userState = userStates.get(userId);
    if (userState?.action?.startsWith("love_")) {
        return handleLoveSteps(ctx);
      }
    // 📅 Обработка ввода даты рождения
    if (userState?.action === "daily_birthday") {
      const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
      if (!dateRegex.test(question)) {
        return ctx.reply("❌ Введите дату в формате ДД.ММ.ГГГГ (например, 12.07.1995)");
      }

      await db.setUserBirthdate(userId, question);
      await ctx.reply(`✅ Дата рождения сохранена: ${question}`);

      const user = await db.getUser(userId);
      if (user.questionsLeft <= 0) return sendNoQuestionsMessage(ctx);

      await db.useQuestion(userId);
      const today = dayjs().format("YYYY-MM-DD");
      const cardId = userState.cardId;
      userStates.delete(userId);
      const card = tarotDeck.find((c) => c.id === cardId);

      await ctx.replyWithPhoto(
        { source: `./img/${cardId}.jpg` },
        { caption: `🃏 Ваша карта дня: ${getCardName(cardId)}` }
      );

      const waitingMsg = await ctx.reply("🔮");
      return askDailyInterpretation(ctx, card.name, question, today, waitingMsg);
    }

    // 💌 Обработка email при покупке
    if (userState?.action === "buy_questions") {
      const email = question;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return ctx.reply("❌ Пожалуйста, введите корректный email адрес.");
      }

      try {
        await db.updateUserEmail(userId, email);
        userStates.delete(userId);
        await ctx.reply(`✅ Email сохранён!\n`);
        return;
      } catch (error) {
        console.error("Ошибка при сохранении email:", error);
        return ctx.reply("❌ Произошла ошибка. Попробуйте позже.");
      }
    }

    // 🧩 Проверка вопроса
    if (!question || !isValidQuestion(question)) {
      return ctx.reply("❌ Пожалуйста, задай корректный вопрос (не менее 2 слов).");
    }

    // 💎 Проверка баланса
    const user = await db.getUser(userId);
    if (user.questionsLeft <= 0) return sendNoQuestionsMessage(ctx);
    const ok = await db.useQuestion(userId);
    if (!ok) return ctx.reply("🚫 У тебя нет доступных вопросов.");

    // 🎴 Основная логика расклада
    try {
      const cards = drawCards(tarotDeck);
      const cardsIds = cards.map((c) => c.id);
      const collectionResult = await checkCollections(userId, cards);

      await ctx.reply(
        "🃏 Твои карты:\n" + cards.map((c) => `${c.name} ${SUIT_EMOJI[c.suit]}`).join(", ")
      );
      if (collectionResult) await ctx.reply(collectionResult.message);

      const mergedImage = await generateMergedImage(cardsIds, userId);
      await ctx.replyWithPhoto({ source: mergedImage });
      fs.unlinkSync(mergedImage);

      const waitingMsg = await ctx.reply("🔮");
      userStreams.set(userId, true);

      const userStyle = await db.getUserResponseStyle(userId);
      const prompt = buildPromptTarot(question, cards, userStyle);
      console.log(prompt);
      
      let currentText = "🔮\n\n";
      let lastUpdate = Date.now();

      // 🌀 Стриминг DeepSeek
      (async () => {
        try {
          await askOpenAIStreaming(
            userId,
            prompt,
            async (chunk) => {
              currentText += chunk;
              if (Date.now() - lastUpdate > 2000) {
                lastUpdate = Date.now();
                await ctx.telegram
                  .editMessageText(waitingMsg.chat.id, waitingMsg.message_id, undefined, currentText + " 🔮")
                  .catch(() => {});
              }
            },
            async (finalText) => {
              await ctx.telegram
                .editMessageText(waitingMsg.chat.id, waitingMsg.message_id, undefined, finalText)
                .catch(() => {});
              userStreams.delete(userId);
            }
          );
        } catch (err) {
          console.error("Ошибка стриминга:", err);
          userStreams.delete(userId);
          await ctx.telegram
            .editMessageText(
              waitingMsg.chat.id,
              waitingMsg.message_id,
              undefined,
              "Упс, что-то пошло не так при обращении к ИИ. Попробуй ещё раз 🙏"
            )
            .catch(() => {});
        }
      })();
    } catch (err) {
      console.error("Ошибка основного цикла:", err);
      await ctx.reply("Упс, что-то пошло не так. Попробуй ещё раз 🙏");
    }
  });
};

/**
 * Асинхронная функция для получения интерпретации карты дня.
 */
async function askDailyInterpretation(ctx, card, birthday, today, waitingMsg) {
  const userId = ctx.from.id;
  const prompt = buildDailyCardPrompt(card, birthday, today);
  let currentText = "🔮\n\n";
  let lastUpdate = Date.now();
  userStreams.set(userId, true);

  try {
    await askOpenAIStreaming(
      userId,
      prompt,
      async (chunk) => {
        currentText += chunk;
        if (Date.now() - lastUpdate > 2000) {
          lastUpdate = Date.now();
          await ctx.telegram
            .editMessageText(waitingMsg.chat.id, waitingMsg.message_id, undefined, currentText + " 🔮")
            .catch(() => {});
        }
      },
      async (finalText) => {
        await ctx.telegram
          .editMessageText(waitingMsg.chat.id, waitingMsg.message_id, undefined, finalText)
          .catch(() => {});
        await db.saveDailyInterpretation(userId, today, finalText);
        userStreams.delete(userId);
      }
    );
  } catch (error) {
    console.error("Ошибка askDailyInterpretation:", error);
    userStreams.delete(userId);
  }
}
