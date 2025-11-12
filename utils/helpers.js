const { Markup } = require("telegraf");
const fetch = require("node-fetch");
process.on("unhandledRejection", (reason) => {
  console.error("⚠️ Неотловленный Promise:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("💥 Непойманная ошибка:", err);
});

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
  const message = `
✨ У тебя закончились вопросы — но впереди самое интересное!  

🔮 Пополни баланс и снова получай доступ ко всем функциям:
• Матрица судьбы — глубинный нумерологический разбор  
• Карта дня — твоя энергия на сегодня  
• Совместимость по дате рождения  
• Личные расклады и советы таро  

✨ Выбери пакет, который подойдёт тебе:
  `.trim();

  return ctx.reply(
    message,
    Markup.inlineKeyboard([
      [Markup.button.callback("💎 50 запросов — 499₽", "buy_questions_4")],
      [Markup.button.callback("🌌 25 запросов — 299₽", "buy_questions_3")],
      [Markup.button.callback("🔮 10 запросов — 149₽", "buy_questions_2")],
      [Markup.button.callback("✨ 3 запроса — 75₽", "buy_questions_1")],
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

async function handleBotError(ctx, error, source = "") {
  const userId = ctx?.from?.id;
  const tag = source ? `[${source}]` : "";

  // Логируем
  console.error(`❌ Ошибка ${tag}:`, error.description || error.message || error);

  // 1️⃣ Блокировка — пользователь заблокировал бота
  if (error.response?.error_code === 403) {
    console.log(`🚫 Пользователь ${userId} заблокировал бота`);
    // if (userId) {
    //   try {
    //     await db.run("UPDATE users SET isBlocked = 1 WHERE userId = ?", [userId]);
    //   } catch (dbErr) {
    //     console.error("⚠️ Ошибка при пометке isBlocked:", dbErr.message);
    //   }
    // }
    return; // просто выходим
  }

  // 2️⃣ Сообщение слишком длинное
  if (
    error.response?.error_code === 400 &&
    error.response?.description?.includes("message is too long")
  ) {
    console.log(`⚠️ Сообщение слишком длинное (userId: ${userId})`);
    try {
      await ctx.reply("⚠️ Сообщение оказалось слишком длинным, попробуйте позже.");
    } catch {}
    return;
  }

  // 3️⃣ Ошибка при редактировании старого сообщения (например, удалено)
  if (
    error.response?.error_code === 400 &&
    error.response?.description?.includes("message to edit not found")
  ) {
    console.log(`⚠️ Сообщение для редактирования не найдено (userId: ${userId})`);
    return;
  }

  // 4️⃣ Поток прерван (AbortError, Stream close)
  if (error.name === "AbortError" || error.code === "ABORT_ERR") {
    console.log(`🚫 Поток ${userId} прерван (AbortError)`);
    return;
  }
  if (error.cause?.code === "ERR_STREAM_PREMATURE_CLOSE") {
    console.log(`⚠️ Поток ${userId} закрылся преждевременно`);
    return;
  }

  // 5️⃣ Неизвестная ошибка — уведомим пользователя и лог
  console.error("⚠️ Необработанная ошибка:", error);
}

async function sendMetrikaHit(userId, eventName = 'bot_start', yclid) {
  const counterId = process.env.YANDEX_METRIKA_ID;
  
  // формируем "виртуальный" URL под конкретное событие
  const pageUrl = `http://taroshka-bot.tilda.ws/${eventName}_${userId}${yclid ? `?yclid=${yclid}` : ''}`;

  const params = {
    'page-url': pageUrl,
    'browser-info': 'ar:1;ti:TelegramBot;',
    'rn': Math.random(),
  };

  const url = `https://mc.yandex.ru/watch/${counterId}?${new URLSearchParams(params)}`;

  try {
    const res = await fetch(url);
    console.log(`📈 Метрика: событие "${eventName}" отправлено (user=${userId}, yclid=${yclid || 'нет'}, статус=${res.status})`);
  } catch (err) {
    console.error('Ошибка Метрики:', err);
  }
}

module.exports = {
  isValidQuestion,
  sendNoQuestionsMessage,
  SUIT_EMOJI,
  splitIntoChunks,
  handleBotError,
  sendMetrikaHit
};
