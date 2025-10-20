// commands/start.js
const db = require("../db");

/**
 * Команда /start — создаёт пользователя и обрабатывает рефералку.
 */
async function startCommand(ctx) {
  const userId = ctx.from.id;
  const text = ctx.message?.text || "";

  try {
    // 1️⃣ Создаём пользователя, если нет
    const user = await db.getUser(userId);

    // 2️⃣ Проверяем рефералку
    if (text.includes("ref_") && !user.invited_by) {
      const referralCode = text.split("ref_")[1];
      const referrer = await db.getUserByReferralCode(referralCode).catch(() => null);

      if (referrer && referrer.userId !== userId) {
        await db.rewardReferrer(referralCode);
        await db.setInvitedBy(userId, referralCode);

        await ctx.telegram.sendMessage(
          referrer.userId,
          "🎉 Новый пользователь зарегистрировался по твоей ссылке! Ты получил +3 вопроса 🔮"
        );
      }
    }

    // 3️⃣ Приветствие
    await ctx.reply(
      `✨ Приветствую в мире AI-Таро! 🔮\n\n` +
        "Задай свой вопрос, и я вытащу 3 карты Таро 🔮\n" +
        "Например: «Что мне учесть при смене работы? Что у меня будет с ним (ней)»\n" +
        "Просто напиши — и карты расскажут всё!\n\n" +
        "🍀 Карта дня /daily\n" +
        "💎 Ваша коллекция карт /mycollection\n" +
        "🎭 Стиль ответа бота /style"
    );
  } catch (error) {
    console.error("Ошибка при /start:", error);
    await ctx.reply("❌ Произошла ошибка при запуске. Попробуйте позже.");
  }
}

module.exports = { startCommand };
