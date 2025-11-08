// commands/start.js
const db = require("../db");
const { handleBotError } = require("../utils");
const fetch = require("node-fetch");

/**
 * Команда /start — создаёт пользователя и обрабатывает рефералку.
 */
async function startCommand(ctx) {
  const userId = ctx.from.id;
  const text = ctx.message?.text || "";

  try {
    // 1️⃣ Создаём пользователя, если нет
    const user = await db.getUser(userId);
    let referralCode = null;
    // 2️⃣ Проверяем рефералку
    if (text.includes("ref_") && !user.invited_by) {
      referralCode = text.split("ref_")[1];

      const referrer = await db.getUserByReferralCode(referralCode).catch(() => null);

      if (referrer && referrer.userId !== userId) {
        await db.rewardReferrer(referralCode);
        await db.setInvitedBy(userId, referralCode);

        await ctx.telegram.sendMessage(
          referrer.userId,
          "🎉 Новый пользователь зарегистрировался по твоей ссылке! Ты получил +3 вопроса 🔮"
        );
      } else await db.setInvitedBy(userId, referralCode);
    }
    
    if (referralCode === "site") {     
      const counterId = process.env.YANDEX_METRIKA_ID;

      try {
        await fetch(`https://mc.yandex.ru/watch/${counterId}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            "browser-info": "pv:1:ss:1:ar:1",
            "site-info": `bot_start_site`,
            "rn": Math.random(),
            "ut": "noindex",
            "_ym": "1",
          }),
        });
        console.log(`📈 Событие bot_start_site отправлено в Яндекс Метрику`);
      } catch (err) {
        console.error("⚠️ Ошибка отправки в Метрику:", err.message);
      }
    }
    // 3️⃣ Приветствие
    await ctx.reply(
      `✨ Приветствую в мире AI-Таро! 🔮\n\n` +
      "Задай свой вопрос, и я вытащу 3 карты Таро 🔮\n" +
      "Например: «Что мне учесть при смене работы? Что у меня будет с ним (ней)»\n" +
      "Просто напиши — и карты расскажут всё!\n\n" +
      "Что еще умеет бот:\n" +
      "💞 Совместимость /love\n" +
      "🌌 Матрица судьбы /matrix\n" +
      "🍀 Карта дня /daily\n" +
      "💎 Ваша коллекция карт /mycollection\n" +
      "🎭 Стиль ответа бота /style"
    );

    db.setUserBlocked(userId, 0);
  } catch (error) {
    console.error("Ошибка при /start:", error);
    handleBotError(error);
    await ctx.reply("❌ Произошла ошибка при запуске. Попробуйте позже.");
  }
}

module.exports = { startCommand };
