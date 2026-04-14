// ========================================
//  🌟 AI Tarot Bot — Главный модуль
// ========================================

// 📦 1. Настройки и зависимости
require("dotenv").config();
const { HttpsProxyAgent } = require('https-proxy-agent');
const agent = new HttpsProxyAgent(process.env.PROXY_URL);
const path = require("path");
const fs = require("fs");
const https = require("https");
const express = require("express");
const bodyParser = require("body-parser");
const cron = require("node-cron");
const { Telegraf } = require("telegraf");

// 🧠 2. Внутренние модули
const db = require("./db");
const yookassa = require("./yookassa");
const { tarotDeck } = require("./deck/deck");
const { sendDailyCards } = require("./sendDailyCards");
const {
  SUIT_EMOJI,
} = require("./utils");
const { userStreams } = require("./utils/streaming");

// 🧩 3. Команды
const { startCommand } = require("./commands/start");
const { balanceCommand } = require("./commands/balance");
const { priceCommand } = require("./commands/price");
const { collectionCommand } = require("./commands/collection");
const sendChangeStyleMessage = require("./commands/style");
const { dailyCardHandlers } = require("./commands/daily");

// ⚙️ 4. Actions (inline callback-и)
const { buyQuestionsAction } = require("./actions/buyQuestions");
const { getFreeQuestionsAction } = require("./actions/getFreeQuestions");
const { changeStyleAction } = require("./actions/changeStyle");
const { dailyMoreAction, dailyDisableAction } = require("./actions/daily");
const { loveCommand } = require("./commands/love");
const { loveFullAction } = require("./actions/loveFull");
const { bonusCommand } = require("./commands/bonus");
const { bonusOpenAction } = require("./actions/bonusOpen");
const { contextCommand } = require("./commands/context");
const { clearContextAction } = require("./actions/contextActions");
const { matrixCommand } = require("./commands/matrix");
const { matrixStart } = require("./actions/matrixStart");

// ========================================
//  🚀 Инициализация
// ========================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new Telegraf(TELEGRAM_TOKEN, { telegram: { agent } });
const app = express();

app.use(bodyParser.json());

// ========================================
//  🕒 Cron-задачи
// ========================================

cron.schedule('0 9 * * *', async () => {
  // 09:00 каждый день
  await sendDailyCards(bot, tarotDeck, { batchSize: 25, batchDelay: 2000 });
});
// (async () => {
//   console.log('📢 Тест рассылки карт дня начат');
//   await sendDailyCards(bot, tarotDeck, { batchSize: 5, batchDelay: 1000 });
//   console.log('✅ Рассылка завершена');
// })();

bot.catch((err, ctx) => {
  console.error(`❌ Ошибка в апдейте для ${ctx.updateType}`, err);

  // Если бот пытается писать пользователю, который его заблокировал
  if (err.response && err.response.error_code === 403) {
    console.log(`🚫 Пользователь ${ctx.from?.id} заблокировал бота`);
    return;
  }

  // Другие ошибки
  console.log("⚠️ Необработанная ошибка:", err.description || err.message);
});

// Глобальный обработчик непойманных ошибок
process.on('unhandledRejection', (error) => {
  if (error.response?.error_code === 403 && error.response?.description.includes('blocked')) {
    console.log('⚠️ Пользователь заблокировал бота (глобальный обработчик)');
    return; // Игнорируем ошибку блокировки
  }
  console.error('⚠️ Непойманная ошибка:', error);
});

process.on('uncaughtException', (error) => {
  if (error.response?.error_code === 403 && error.response?.description.includes('blocked')) {
    console.log('⚠️ Пользователь заблокировал бота (глобальный обработчик)');
    return;
  }
  console.error('⚠️ Критическая ошибка:', error);
});

// ========================================
//  💳 Webhook для Юкассы
// ========================================

app.post("/yookassa-webhook", async (req, res) => {
  const event = req.body;

  if (event.event === "payment.succeeded") {
    const { id, metadata } = event.object;
    const userId = metadata?.userId;
    const amount = metadata?.amount;
    const tokensAmount = metadata?.tokensAmount;

    if (userId && amount) {
      await db.addQuestionsAfterPayment(userId, tokensAmount);
      await bot.telegram.sendMessage(
        userId,
        `✅ Оплата прошла!\nВам начислено ${tokensAmount} вопросов 🌟`
      );
      console.log('\x1b[32m%s\x1b[0m', `✅ Пользователю ${userId} начислено ${tokensAmount} вопросов + ${amount}₽`);
    }
  }

  res.sendStatus(200);
});

// ========================================
//  🌐 Express сервер (HTTPS/локалка)
// ========================================

if (process.env.NODE_ENV !== "develop") {
  const options = {
    key: fs.readFileSync(path.join(__dirname, "/cert/certificate.key")),
    cert: fs.readFileSync(path.join(__dirname, "/cert/certificate.crt")),
  };

  https.createServer(options, app).listen(443, () => {
    console.log("🚀 HTTPS сервер слушает порт 443");
  });
} else {
  // Локально просто обычный Express
  app.listen(3000, () => {
    console.log("🧪 Dev-сервер запущен на http://localhost:3000");
  });
}

// ========================================
//  🧩 Команды Telegram
// ========================================

bot.telegram.setMyCommands([
  { command: 'daily', description: '☘️ Карта дня' },
  { command: 'love', description: '💞 Совместимость' },
  { command: 'matrix', description: '🌌 Матрица судьбы' },
  { command: 'mycollection', description: '📚 Моя коллекция' },
  { command: 'style', description: '🎭 Стиль ответов' },
  { command: 'bonus', description: '🎁 Бонус' },
  { command: 'context', description: '📖 История' },
  { command: 'balance', description: '💰 Мой баланс' },
  { command: 'price', description: '💎 Узнать цены' }
]);

bot.start(startCommand);

bot.action(/buy_questions_(\d+)/, buyQuestionsAction);
bot.action("get_free_questions", getFreeQuestionsAction);
bot.action(/style_(\d+)/, changeStyleAction);
bot.action(/^daily_more_(.+)$/, dailyMoreAction);
bot.action('daily_disable', dailyDisableAction);
bot.action("love_full", loveFullAction);
bot.action("bonus_open", bonusOpenAction);
bot.action("clear_context", clearContextAction);
bot.action("matrix_start", matrixStart);

bot.command("price", priceCommand);
bot.command("style", sendChangeStyleMessage);
bot.command("daily", dailyCardHandlers);
bot.command('mycollection', collectionCommand);
bot.command("balance", balanceCommand);
bot.command("love", loveCommand);
bot.command("bonus", bonusCommand);
bot.command("context", contextCommand);
bot.command("matrix", matrixCommand);


// ========================================
//  💬 Обработка текстовых сообщений
// ========================================

require("./handlers/textHandler")(bot);

bot.launch().then(() => {
  console.log("✅ Tarot Bot запущен");
});

async function gracefulShutdown(signal) {
  console.log(`🔄 Получен ${signal}, останавливаю приём новых апдейтов...`);
  bot.stop(signal);

  const MAX_WAIT = 120_000; // 2 минуты — максимальное время стрима
  const start = Date.now();

  while (userStreams.size > 0 && Date.now() - start < MAX_WAIT) {
    console.log(`⏳ Активных стримов: ${userStreams.size}, жду завершения...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (userStreams.size > 0) {
    console.log(`⚠️ Принудительно завершаю ${userStreams.size} незакрытых стримов`);
  }

  console.log("✅ Бот завершил работу");
  process.exit(0);
}

process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));