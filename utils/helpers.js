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

function formatCardLine(card) {
  const suitEmoji =
    card.suit === "Major"
      ? SUIT_EMOJI.Major
      : SUIT_EMOJI[card.suit] || "🃏";

  const dir = card.reversed ? " (перевёрнутая)" : "";
  return `${suitEmoji} ${card.name}${dir}`;
}

/**
 * Разбивает длинный текст на части, чтобы не превышать лимит Telegram (4096 символов)
 * @param {string} text - исходный текст
 * @param {number} [maxLen=3500] - максимальная длина каждого куска
 * @returns {string[]} массив частей
 */
function splitIntoChunks(text, maxLen = 3500) {
  if (typeof text !== "string") return [];
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // стараемся порезать по границе абзаца или строки
    let cutAt = remaining.lastIndexOf("\n", maxLen);
    if (cutAt === -1) cutAt = maxLen;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }

  if (remaining.trim()) chunks.push(remaining);
  return chunks;
}


module.exports = {
  isValidQuestion,
  sendNoQuestionsMessage,
  SUIT_EMOJI,
  splitIntoChunks
};
