// commands/balance.js
const { getUser } = require("../db");

/**
 * Обработка команды /balance
 * Показывает, сколько вопросов осталось у пользователя.
 */
async function balanceCommand(ctx) {
  try {
    const user = await getUser(ctx.from.id);
    const fateStatus = user.fateUsed ? "❌ уже использована" : "✅ доступна";

    await ctx.reply(
      `📊 Баланс:\n` +
      `Осталось вопросов: ${user.questionsLeft}\n`
    );
  } catch (error) {
    console.error("Ошибка при /balance:", error);
    await ctx.reply("❌ Не удалось загрузить баланс. Попробуйте позже.");
  }
}

module.exports = { balanceCommand };
