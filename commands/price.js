// commands/price.js
const { Markup } = require("telegraf");

/**
 * Команда /price — показывает варианты пакетов вопросов.
 */
async function priceCommand(ctx) {
  try {
    await ctx.reply(
      "Выбери пакет запросов 🌟",
      Markup.inlineKeyboard([
        [Markup.button.callback("💎 50 запросов — 499₽", "buy_questions_4")],
        [Markup.button.callback("🌌 25 запросов — 299₽", "buy_questions_3")],
        [Markup.button.callback("🔮 10 запросов — 149₽", "buy_questions_2")],
        [Markup.button.callback("✨ 3 запроса — 49₽", "buy_questions_1")],
        [Markup.button.callback("🎁 Получить бесплатно", "get_free_questions")],
      ])
    );
  } catch (error) {
    console.error("Ошибка при /price:", error);
    await ctx.reply("❌ Не удалось загрузить список пакетов. Попробуйте позже.");
  }
}

module.exports = { priceCommand };
