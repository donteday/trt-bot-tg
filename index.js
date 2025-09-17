
const { getUser, useQuestion, useFate, getTotalUsers } = require("./db");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { Telegraf, Markup } = require("telegraf");
require('dotenv').config();
const yookassa = require('./yookassa');
const db = require('./db.js');
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const { tarotDeck } = require("./deck/deck.js");
const https = require("https");

const bot = new Telegraf(TELEGRAM_TOKEN);

const express = require("express");
const bodyParser = require("body-parser");
const { handleStart } = require("./commands/start.js");

const app = express();
app.use(bodyParser.json());

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

const options = {
  key: fs.readFileSync(path.join(__dirname, "/cert/certificate.key")),
  cert: fs.readFileSync(path.join(__dirname, "/cert/certificate.crt"))
};

https.createServer(options, app).listen(443, () => {
  console.log("🚀 HTTPS сервер слушает порт 443");
});

const SUIT_EMOJI = {
  Wands: "🔥",
  Cups: "💧",
  Swords: "🗡️",
  Pentacles: "🪙",
  Major: "✨",
};

// Команда для покупки вопросов
bot.action(/buy_questions_(\d+)/, async (ctx) => {
  const userId = ctx.from.id;
  const packageId = parseInt(ctx.match[1]);
  const packages = {
    1: { amount: 3, price: 49 },
    2: { amount: 10, price: 99 },
    3: { amount: 40, price: 299 },
    4: { amount: 100, price: 499 }
  };
  const selectedPackage = packages[packageId];

  try {
    // Получаем данные пользователя
    const user = await db.getUser(userId);

    // Проверяем, есть ли email у пользователя
    if (!user.email) {
      await ctx.reply(
        '📧 Для оформления покупки нам нужен ваш email адрес для отправки чека.\n\n' +
        'Пожалуйста, введите ваш email:'
      );
      userStates.set(userId, { action: 'buy_questions', amount: selectedPackage.amount });
      return;
    }

    // Создаем платеж с email
    const payment = await yookassa.createPayment(
      userId,
      selectedPackage.price,
      `Покупка ${selectedPackage.amount} токенов для оказания информационных услуг`,
      user.email,
      selectedPackage.amount
    );

    await ctx.reply(
      `💳 Для покупки ${selectedPackage.amount} вопросов (${selectedPackage.price} руб.) перейдите по ссылке для оплаты:\n\n` +
      `После успешной оплаты чек будет отправлен на email: ${user.email}\n\n` +
      `${payment.confirmation.confirmation_url}`,
      Markup.inlineKeyboard([
        Markup.button.url('💳 Оплатить', payment.confirmation.confirmation_url),
        Markup.button.callback('✏️ Изменить email', 'change_email_before_payment')
      ])
    );
  } catch (error) {
    if (error.response?.error_code === 403 && error.response?.description.includes('blocked')) {
      console.log('⚠️ Пользователь заблокировал бота during payment:', ctx.from.id);
      // Можно очистить его данные из БД, если нужно
      // await db.deleteUser(ctx.from.id);
      return; // Просто выходим, не пытаемся отвечать
    }
    try {
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже или напишите в поддержку.');
    } catch (replyError) {
      // Если не получилось отправить (пользователь заблокировал)
      console.log('Не удалось отправить сообщение об ошибке — пользователь заблокировал бота');
    }
  }
});

async function sendNoQuestionsMessage(ctx) {
  return ctx.reply(
    "🌟 Выбери пакет, чтобы продолжить 🌟",
    Markup.inlineKeyboard([
      [Markup.button.callback("💎 100 запросов — 499₽", "buy_questions_4")],
      [Markup.button.callback("🌌 40 запросов — 299₽", "buy_questions_3")],
      [Markup.button.callback("🔮 10 запросов — 99₽", "buy_questions_2")],
      [Markup.button.callback("✨ 3 запроса — 49₽", "buy_questions_1")]
    ])
  );
}

bot.action("get_free_questions", async (ctx) => {
  const userId = ctx.from.id;
  const code = await db.getOrCreateReferralCode(userId);

  const refLink = `https://t.me/${ctx.botInfo.username}?start=ref_${code}`;
  await ctx.reply(
    `🎁 Поделись этой ссылкой с друзьями:\n${refLink}\n\n` +
    `За каждого нового друга ты получишь +3 вопроса 🔮`,
    Markup.inlineKeyboard([
      // Кнопка «Поделиться», предзаполненный текст — только ссылка
      [Markup.button.switchInline("🔗 Поделиться", refLink)]
    ])
  );

  // Подтверждаем Telegram, чтобы кнопка не мерцала
  await ctx.answerCbQuery();
});

bot.command("add", async (ctx) => {
  await ctx.reply(
    "🚫 У тебя закончились бесплатные вопросы.\nВыбери пакет, чтобы продолжить 🌟",
    Markup.inlineKeyboard([
      [Markup.button.callback("💎 100 запросов — 499₽", "buy_questions_4")],
      [Markup.button.callback("🌌 40 запросов — 299₽", "buy_questions_3")],
      [Markup.button.callback("🔮 10 запросов — 99₽", "buy_questions_2")],
      [Markup.button.callback("✨ 3 запроса — 49₽", "buy_questions_1")],
      [Markup.button.callback("🎁 Получить бесплатно", "get_free_questions")] 
    ])
  );
  return;
});

// Состояния для сбора email
const userStates = new Map();


function drawCards(tarotDeck) {
  const selected = [];
  while (selected.length < 3) {
    const rand = tarotDeck[Math.floor(Math.random() * tarotDeck.length)];
    if (!selected.includes(rand)) selected.push(rand);
  }
  return selected;
}

function formatCardLine(card) {
  const suitEmoji =
    card.suit === "Major"
      ? SUIT_EMOJI.Major
      : SUIT_EMOJI[card.suit] || "🃏";

  const dir = card.reversed ? " (перевёрнутая)" : "";
  return `${suitEmoji} ${card.name}${dir}`;
}

function isValidQuestion(text) {
  if (!text) return false;
  if (text.length < 5) return false;
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return false;

  return true;
}

// Формирование промпта для ИИ
function buildPrompt(question, cards) {
  const list = cards
    .map(
      (c, i) =>
        `${i + 1}. ${c.name}`
    )
    .join("\n");

  return `
Ты — мудрый, эмапатичный таролог-проводник с глубокой интуицией. Твоя задача — не просто описать карты, а создать целостную историю, которая даст клиенту ясность и поддержку.

Вопрос: ${question}
Карты: ${list}

Создай интерпретацию, которая:
🌟 Начинается с общего послания расклада
📖 Объясняет каждую карту в контексте вопроса
🔄 Показывает диалог между картами — как они дополняют друг друга
💡 Даёт практические подсказки для действий
🌈 Завершается ободряющим выводом

**ВАЖНО:** Избегай шаблонных фраз и общих мест. Будь лаконичным (ответ не более 300-400 слов), проницательным. Говори правду, но с заботой, как мудрый друг. Используй немного эмодзи для передачи эмоций и структуры, но не переусердствуй.
`.trim();
}

async function generateMergedImage(cardsIds, userId) {
  const images = await Promise.all(
    cardsIds.map((id) => sharp(path.join(__dirname, "img", `${id}.jpg`)).resize(400, 700).toBuffer())
  );

  // создаём холст для склейки
  const width = 400 * images.length;
  const height = 700;

  const { data } = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 } // фон черный, можно поменять
    }
  })
    .composite(
      images.map((img, i) => ({ input: img, left: i * 400, top: 0 }))
    )
    .jpeg()
    .toBuffer({ resolveWithObject: true });

  // сохраняем файл
  const filename = `merged-${userId}-${Date.now()}.jpg`;
  const outputPath = path.join(__dirname, filename);

  fs.writeFileSync(outputPath, data);
  return outputPath;
}

// bot.start(handleStart);
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text || "";

  // 1) Сначала создаем пользователя, если нет
  const user = await db.getUser(userId);

  // 2) Проверяем рефералку
  if (text.includes("ref_") && !user.invited_by) { // только если еще не приглашён
    const referralCode = text.split("ref_")[1];

    const referrer = await db.getUserByReferralCode(referralCode).catch(() => null);
    if (referrer && referrer.userId !== userId) {
      await db.rewardReferrer(referralCode);
      await db.setInvitedBy(userId, referralCode);

      ctx.telegram.sendMessage(
        referrer.userId,
        `🎉 Новый пользователь зарегистрировался по твоей ссылке! Ты получил +3 вопроса 🔮`
      );
    }
  }

  ctx.reply(
    `✨ Приветствую в мире AI-Таро! 🔮\n\n` +
    "Задай свой вопрос, и я вытащу 3 карты Таро 🔮\n" +
    "Например: «Что мне учесть при смене работы? Что у меня будет с ним (ней)»\n\n" +
    `Просто напиши — и карты расскажут все!`
  );
});




bot.command("cards", async (ctx) => {
  const cards = drawCards(tarotDeck, 3);
  const header = "Твои карты:\n" + cards.map(formatCardLine).join("\n");
  await ctx.reply(header);
});

// команда: баланс
bot.command("balance", async (ctx) => {
  const user = await getUser(ctx.from.id);
  const fateStatus = user.fateUsed ? "❌ уже использована" : "✅ доступна";
  await ctx.reply(
    `📊 Баланс:\n` +
    `Осталось вопросов: ${user.questionsLeft}\n`
    // `Матрица судьбы: ${fateStatus}`
  );
});

async function askOpenAIStreaming(prompt, onChunk, onComplete) {

  let fullResponse = "";

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "Ты профессиональный таролог и психологичный консультант. Пиши по-русски, структурированно и бережно."
          },
          { role: "user", content: prompt },
        ],
        stream: true, // Включаем стриминг!
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}\n${text}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              await onChunk(content);
            }
          } catch (e) {
            // Игнорируем ошибки парсинга отдельных чанков
          }
        }
      }
    }

    await onComplete(fullResponse);
    return fullResponse;

  } catch (error) {
    console.error("Streaming error:", error);
    throw error;
  }
}
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const userState = userStates.get(userId);
  const question = (ctx.message?.text || "").trim();
  console.log(ctx.from.username, question);

  if (userState && userState.action === 'buy_questions') {
    const email = ctx.message.text.trim();

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      await ctx.reply('❌ Пожалуйста, введите корректный email адрес.');
      return;
    }

    try {
      // Сохраняем email
      await db.updateUserEmail(userId, email);
      userStates.delete(userId);
      await ctx.reply(`✅ Email сохранен!\n\n`);
      sendNoQuestionsMessage(ctx);
      return;
    } catch (error) {
      console.error('Payment error:', error);
      await ctx.reply('❌ Произошла ошибка при создании платежа. Попробуйте позже.');
    }
  }

  // Проверка вопроса
  if (!isValidQuestion(question)) {
    await ctx.reply("❌ Пожалуйста, задай вопрос (не менее 2 слов).");
    return;
  }
  if (!question) {
    await ctx.reply("Напиши осмысленный вопрос, чтобы я мог интерпретировать расклад 🙌");
    return;
  }

  const user = await getUser(userId);

  if (user.questionsLeft <= 0) {
    sendNoQuestionsMessage(ctx);
    return;
  }

  try {
    const ok = await useQuestion(userId);
    if (!ok) {
      await ctx.reply("🚫 У тебя нет доступных вопросов.");
      return;
    }

    // 1) тянем карты
    const cards = drawCards(tarotDeck);
    const cardsIds = cards.map(c => c.id);
    await ctx.reply("🃏 Твои карты:\n" + cards.map((c) => `${c.name} ${SUIT_EMOJI[c.suit]}`).join(", "));
    const mergedImage = await generateMergedImage(cardsIds, userId);

    try {
      await ctx.replyWithPhoto({ source: mergedImage });
    } finally {
      fs.unlinkSync(mergedImage);
    }

    // Создаем начальное сообщение для стриминга
    const waitingMsg = await ctx.reply("🔮 Ожидаю расшифровку...");
    let currentText = "🔮\n\n";
    let lastUpdate = Date.now();

    const prompt = buildPrompt(question, cards);

    // Функция для обработки стриминга
    const handleStream = async (chunk) => {
      currentText += chunk;

      // Обновляем сообщение не чаще чем раз в 500мс
      if (Date.now() - lastUpdate > 2000) {
        try {
          await ctx.telegram.editMessageText(
            waitingMsg.chat.id,
            waitingMsg.message_id,
            undefined,
            currentText + " 🔮" // Курсор для индикации печати
          );
          lastUpdate = Date.now();
        } catch (error) {
          // Игнорируем ошибки редактирования (например, если сообщение слишком длинное)
          console.log("Ошибка редактирования:", error.message);
        }
      }
    };

    // Функция для завершения стриминга
    const handleComplete = async (finalText) => {
      try {
        await ctx.telegram.editMessageText(
          waitingMsg.chat.id,
          waitingMsg.message_id,
          undefined,
          finalText
        );
      } catch (error) {
        console.log("Финальное обновление не удалось:", error.message);
      }
    };

    // Получаем ответ со стримингом
    const interpretation = await askOpenAIStreaming(prompt, handleStream, handleComplete);
    if (user.questionsLeft <= 0) {
      sendNoQuestionsMessage(ctx);
      return;
    }

  } catch (err) {
    console.error(err);
    await ctx.reply("Упс, что-то пошло не так при обращении к ИИ. Попробуй ещё раз чуть позже 🙏");
  }
});

/////////////////////////////////////
// 6) ЗАПУСК
/////////////////////////////////////
bot.launch().then(() => {
  console.log("✅ Tarot Bot запущен");
});

// Корректная остановка на хостингах (Heroku/Render/Vercel functions и т.п.)
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
