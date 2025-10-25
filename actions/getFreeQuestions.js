// actions/getFreeQuestions.js
/**
 * Действие "🎁 Получить бесплатно" — создаёт реферальную ссылку для пользователя.
 */
const db = require("../db");

async function getFreeQuestionsAction(ctx) {
  try {
    await ctx.answerCbQuery().catch((err) => {
      // Игнорируем старые callback-ошибки Telegram
      if (err.response?.error_code === 400) return;
      throw err;
    });

    const userId = ctx.from.id;
    const code = await db.getOrCreateReferralCode(userId);
    const refLink = `https://t.me/${ctx.botInfo.username}?start=ref_${code}`;

    await ctx.reply(
      `🎁 Поделись этой ссылкой с друзьями:\n${refLink}\n\n` +
        `За каждого нового друга ты получишь +3 вопроса 🔮
        🎁 Испытайте удачу в бонусной игре /bonus`
    );
  } catch (error) {
    console.error("Ошибка в get_free_questions:", error);
    await ctx.reply("❌ Не удалось получить ссылку. Попробуйте позже.");
  }
}

module.exports = { getFreeQuestionsAction };
