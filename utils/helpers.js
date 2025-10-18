const { Markup } = require("telegraf");

// ✅ Проверка корректности вопроса
function isValidQuestion(text) {
  if (!text) return false;
  if (text.length < 5) return false;
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return false;
  return true;
}

// 💬 Сообщение, когда закончились вопросы
async function sendNoQuestionsMessage(ctx) {
  return ctx.reply(
    "🌟 Закончились запросы, выбери пакет, чтобы продолжить 🌟",
    Markup.inlineKeyboard([
      [Markup.button.callback("💎 50 запросов — 499₽", "buy_questions_4")],
      [Markup.button.callback("🌌 25 запросов — 299₽", "buy_questions_3")],
      [Markup.button.callback("🔮 10 запросов — 149₽", "buy_questions_2")],
      [Markup.button.callback("✨ 3 запроса — 49₽", "buy_questions_1")],
      [Markup.button.callback("🎁 Получить бесплатно", "get_free_questions")],
    ])
  );
}

const SUIT_EMOJI = {
  Wands: "🔥",
  Cups: "💧",
  Swords: "🗡️",
  Pentacles: "🪙",
  Major: "✨",
};

module.exports = {
  isValidQuestion,
  sendNoQuestionsMessage,
  SUIT_EMOJI
};
