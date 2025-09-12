
const { getUser, useQuestion, addQuestions, useFate } = require("./db");
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

const app = express();
app.use(bodyParser.json());

// Юкасса будет слать сюда уведомления


app.post("/yookassa-webhook", async (req, res) => {
  const event = req.body;

  console.log("📩 Webhook:", JSON.stringify(event, null, 2));

  if (event.event === "payment.succeeded") {
    const { id, metadata } = event.object;
    const userId = metadata?.userId;
    const amount = metadata?.amount;

    if (userId && amount) {
      await db.addQuestionsAfterPayment(userId, amount);
      console.log(`✅ Пользователю ${userId} начислено ${amount/10} вопросов (платёж ${id})`);
    }
  }

  res.sendStatus(200);
});

const options = {
  key: fs.readFileSync("/cert/certificate.key"),
  cert: fs.readFileSync("/cert/certificate.crt")
};

// создаём HTTPS-сервер
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
  const amount = parseInt(ctx.match[1]);
  const price = amount * 10; // 100 рублей за вопрос

  try {
    // Получаем данные пользователя
    const user = await db.getUser(userId);

    // Проверяем, есть ли email у пользователя
    if (!user.email) {
      await ctx.reply(
        '📧 Для оформления покупки нам нужен ваш email адрес для отправки чека.\n\n' +
        'Пожалуйста, введите ваш email:'
      );
      userStates.set(userId, { action: 'buy_questions', amount: amount });
      return;
    }

    // Создаем платеж с email
    const payment = await yookassa.createPayment(
      userId,
      price,
      `Покупка ${amount} токенов для оказания информационных услуг`,
      user.email
    );

    await ctx.reply(
      `💳 Для покупки ${amount} вопросов (${price} руб.) перейдите по ссылке для оплаты:\n\n` +
      `После успешной оплаты чек будет отправлен на email: ${user.email}\n\n` +
      `${payment.confirmation.confirmation_url}`,
      Markup.inlineKeyboard([
        Markup.button.url('💳 Оплатить', payment.confirmation.confirmation_url),
        Markup.button.callback('🔄 Проверить статус', `check_payment_${payment.id}`),
        Markup.button.callback('✏️ Изменить email', 'change_email_before_payment')
      ])
    );
  } catch (error) {
    console.error('Payment error:', error);
    await ctx.reply('❌ Произошла ошибка при создании платежа. Попробуйте позже.');
  }
});

bot.command("add", async (ctx) => {
  await ctx.reply(
    "🚫 У тебя закончились бесплатные вопросы.\nВыбери пакет, чтобы продолжить 🌟",
    Markup.inlineKeyboard([
      [Markup.button.callback("✨ 3 запроса — 30₽", "buy_questions_3")],
      [Markup.button.callback("🔮 10 запросов — 100₽", "buy_questions_10")],
      [Markup.button.callback("🌌 40 запросов — 400₽", "buy_questions_40")],
      [Markup.button.callback("💎 100 запросов — 1000₽", "bbuy_questions_100")]
    ])
  );
  return;
});

// Проверка статуса платежа
bot.action(/check_payment_(.+)/, async (ctx) => {
  const paymentId = ctx.match[1];

  try {
    const status = await yookassa.checkPaymentStatus(paymentId);

    if (status === 'succeeded') {
      await ctx.editMessageText('✅ Платеж успешно завершен! Вопросы добавлены к вашему счету.');
    } else if (status === 'pending') {
      await ctx.editMessageText('⏳ Платеж еще обрабатывается. Попробуйте проверить позже.');
    } else {
      await ctx.editMessageText('❌ Платеж не прошел. Попробуйте оплатить снова.');
    }
  } catch (error) {
    await ctx.editMessageText('❌ Ошибка при проверке статуса платежа.');
  }
});

// Состояния для сбора email
const userStates = new Map();

// Вебхук для обработки уведомлений от ЮКассы


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

  // 1. Длина не менее 10 символов
  if (text.length < 5) return false;

  // 2. Минимум два слова (разделяем по пробелам)
  const words = text.trim().split(/\s+/);
  if (words.length < 1) return false;

  // 3. Должен заканчиваться на вопросительный знак
  if (!text.trim().endsWith("?")) return false;

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
Ты — проводник в мире Таро. Интерпретируй этот расклад с мудростью и заботой:

Вопрос: ${question}
Карты: ${list}

Создай интерпретацию, которая:
1. 🌟 Начинается с общего послания расклада
2. 📖 Кратко объясняет каждую карту в контексте вопроса
3. 🔄 Показывает диалог между картами — как они дополняют друг друга
4. 💡 Даёт практические подсказки для действий
5. 🌈 Завершается ободряющим выводом

Пиши поддерживающе но правду, лаконично и кратко, с лёгкостью.
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

/////////////////////////////////////
// 5) ОБРАБОТЧИКИ КОМАНД
/////////////////////////////////////

bot.start((ctx) =>
  ctx.reply(
    "Привет! Задай свой вопрос, и я вытащу 3 карты Таро 🔮\n" +
    "Например: «Что мне учесть при смене работы? Что у меня будет с ним (ней)»\n\n"

  )
);
bot.action("buy_3", async (ctx) => {
  await addQuestions(ctx.from.id, 3);
  await ctx.answerCbQuery("✨ Добавлено 3 вопроса!");
  await ctx.reply("Теперь у тебя +3 вопроса 🔮");
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

// команда: добавить вопросы (для теста)
bot.command("addquestions", async (ctx) => {
  await addQuestions(ctx.from.id, 5);
  const user = await getUser(ctx.from.id);
  await ctx.reply(`➕ Добавлено 5 вопросов. Теперь у тебя ${user.questionsLeft}.`);
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

      const amount = userState.amount;
      const price = amount * 100;

      // Создаем платеж с email
      const payment = await yookassa.createPayment(
        userId,
        price,
        `Покупка ${amount} вопросов для Таро`,
        email
      );

      await ctx.reply(
        `✅ Email сохранен!\n\n` +
        `💳 Для покупки ${amount} вопросов (${price} руб.) перейдите по ссылке для оплаты:\n\n` +
        `После успешной оплаты чек будет отправлен на email: ${email}\n\n` +
        `${payment.confirmation.confirmation_url}`,
        Markup.inlineKeyboard([
          Markup.button.url('💳 Оплатить', payment.confirmation.confirmation_url),
          Markup.button.callback('🔄 Проверить статус', `check_payment_${payment.id}`)
        ])
      );
    } catch (error) {
      console.error('Payment error:', error);
      await ctx.reply('❌ Произошла ошибка при создании платежа. Попробуйте позже.');
    }
  }

  // Проверка вопроса
  if (!isValidQuestion(question)) {
    await ctx.reply("❌ Пожалуйста, задай осмысленный вопрос (не менее 2 слов и в конце знак вопроса).");
    return;
  }
  if (!question) {
    await ctx.reply("Напиши осмысленный вопрос, чтобы я мог интерпретировать расклад 🙌");
    return;
  }

  const user = await getUser(userId);

  if (user.questionsLeft <= 0) {
    await ctx.reply(
      "🚫 У тебя закончились бесплатные вопросы.\nВыбери пакет, чтобы продолжить 🌟",
      Markup.inlineKeyboard([
        [Markup.button.callback("✨ 3 запроса — 49₽", "buy_3")],
        [Markup.button.callback("🔮 10 запросов — 99₽", "buy_3")],
        [Markup.button.callback("🌌 40 запросов — 299₽", "buy_3")],
        [Markup.button.callback("💎 100 запросов — 499₽", "buy_3")]
      ])
    );
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
