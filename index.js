
const { getUser, useQuestion, getUserData, updateUserWithBonus, updateUserCards } = require("./db");
const sharp = require("sharp");
const path = require("path");
const fs = require('fs');
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
const sendChangeStyleMessage = require("./commands/style.js");
const { styleConfig } = require("./configs/configs.js");
const { log } = require("console");

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

bot.telegram.setMyCommands([
  { command: 'price', description: '💎 Узнать цены' },
  { command: 'balance', description: '💰 Мой баланс' },
  { command: 'mycollection', description: '📚 Моя коллекция' },
  { command: 'style', description: '🎭 Стиль ответов' },
]);

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
    2: { amount: 10, price: 79 },
    3: { amount: 40, price: 239 },
    4: { amount: 100, price: 399 }
  };
  const selectedPackage = packages[packageId];

  try {
    // Получаем данные пользователя
    const user = await db.getUser(userId);
    console.log(user.email);
    
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

bot.action(/style_(\d+)/, async (ctx) => {
  const userId = ctx.from.id;
  const styleId = parseInt(ctx.match[1]);
  const selectedStyle = styleConfig[styleId];

  try {
    db.setUserResponseStyle(userId, styleId);
    await ctx.editMessageText(
      `✅ Выбран стиль: ${selectedStyle}\n\nТеперь все ответы будут в этом формате ✨`
    );
  } catch (error) {
    console.log('Error changing style:', error);
    await ctx.answerCbQuery('❌ Ошибка при смене стиля');
  }
});

async function sendNoQuestionsMessage(ctx) {
  return ctx.reply(
    "🌟 Закончились вопросы, выбери пакет, чтобы продолжить 🌟",
    Markup.inlineKeyboard([
      [Markup.button.callback("💎 100 запросов — 399₽ (-20%)", "buy_questions_4")],
      [Markup.button.callback("🌌 40 запросов — 239₽ (-20%)", "buy_questions_3")],
      [Markup.button.callback("🔮 10 запросов — 79₽ (-20%)", "buy_questions_2")],
      [Markup.button.callback("✨ 3 запроса — 49₽", "buy_questions_1")],
      [Markup.button.callback("🎁 Получить бесплатно", "get_free_questions")]
    ])
  );
}



bot.action("get_free_questions", async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(err => {
      if (err.response?.error_code === 400) return; // Игнорируем старые callback
      throw err;
    });

    // Теперь делаем долгие операции
    const userId = ctx.from.id;
    const code = await db.getOrCreateReferralCode(userId);

    const refLink = `https://t.me/${ctx.botInfo.username}?start=ref_${code}`;
    await ctx.reply(
      `🎁 Поделись этой ссылкой с друзьями:\n${refLink}\n\n` +
      `За каждого нового друга ты получишь +3 вопроса 🔮`
    );

  } catch (error) {
    console.error('Error in get_free_questions:', error);
  }
});

bot.command("price", async (ctx) => {
  await ctx.reply(
    "Выбери пакет запросов🌟",
    Markup.inlineKeyboard([
      [Markup.button.callback("💎 100 запросов — 399₽ (-20%)", "buy_questions_4")],
      [Markup.button.callback("🌌 40 запросов — 239₽ (-20%)", "buy_questions_3")],
      [Markup.button.callback("🔮 10 запросов — 79₽ (-20%)", "buy_questions_2")],
      [Markup.button.callback("✨ 3 запроса — 49₽", "buy_questions_1")],
      [Markup.button.callback("🎁 Получить бесплатно", "get_free_questions")]
    ])
  );
  return;
});
bot.command("style", async (ctx) => {
  await sendChangeStyleMessage(ctx);
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
function buildPrompt(question, cards, styleId = 1) {
  const list = cards
    .map((c, i) => `${i + 1}. ${c.name}`)
    .join("\n");

  // Конфигурация стилей
  const stylePrompts = {
    1: `🔮 **СТАНДАРТНЫЙ СТИЛЬ**
Создай классическую интерпретацию с духовными инсайтами. 
Используй мудрый, эмпатичный тон таролога-проводника.
Важно: глубина, эмпатия, духовные инсайты`,

    2: `💫 **МОТИВАЦИОННЫЙ СТИЛЬ**  
Создай вдохновляющую интерпретацию, которая зарядит на действия.
Используй энергичный, поддерживающий тон коуча.
Важно: мотивация, конкретные шаги, вера в себя`,

    3: `😈 **ЖЕСТКИЙ СТИЛЬ**
Создай прямолинейную интерпритацию с большим количеством юмора и матами.
Используй честный, юморной тон с подколами и мемами.
Важно: правда без сахара, конкретика, вызов к действию`,

    4: `👯 **СТИЛЬ ЛУЧШЕЙ ПОДРУГИ**
Создай теплую, доверительную интерпретацию, как будто вы на кухне за бутылкой вина.
Используй неформальный, поддерживающий тон с кучей юмора.
Важно: забота, юмор, практические советы "как для подруги"`
  };

  const styleInstruction = stylePrompts[styleId] || stylePrompts[1];

  return `
Ты — таролог, работающий в выбранном стиле. Адаптируйся под тон и подход.

**СТИЛЬ ОТВЕТА:**
${styleInstruction}

**КОНТЕКСТ:** Пользователь уже обратился к тебе ранее. Не приветствуй его снова, сразу переходи к сути.

Вопрос: ${question}
Карты: ${list}

Создай интерпретацию в выбранном стиле, которая:
🌟 Начинается сразу с общего послания расклада
📖 Объясняет каждую карту в контексте вопроса  
🔄 Показывает диалог между картами
💡 Даёт практические подсказки для действий
🌈 Завершается ободряющим выводом

**ВАЖНО:** Строго соблюдай выбранный стиль общения, но отвечай не шаблонно. Отвечай подробно не более 4000 символов. Используй эмодзи соответственно стилю, но не используй ** в оформлении.
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
const checkCollections = (userId, newCards) => {
  return new Promise((resolve, reject) => {
    getUserData(userId, (err, user) => {
      if (err || !user) return resolve(null);

      // Данные пользователя
      let cards = user.collected_cards ? JSON.parse(user.collected_cards) : [];
      let completedSuits = user.completed_suits ? JSON.parse(user.completed_suits) : [];

      let newBonuses = [];
      let gotNewCards = false;

      // Добавляем новые карты
      for (const card of newCards) {
        if (!cards.find(c => c.id === card.id)) {
          cards.push(card);
          gotNewCards = true;
        }
      }

      // Если нет новых карт - выходим
      if (!gotNewCards) return resolve(null);

      // Проверяем масти на завершение
      const suits = ['Major', 'Wands', 'Cups', 'Swords', 'Pentacles'];

      for (const suit of suits) {
        const allInSuit = tarotDeck.filter(c => c.suit === suit);
        const userInSuit = cards.filter(c => c.suit === suit);

        // Если масть собрана И еще не награждали
        if (userInSuit.length === allInSuit.length && !completedSuits.includes(suit)) {
          newBonuses.push(suit);
          completedSuits.push(suit);
        }
      }

      // Начисляем бонусы если есть новые завершенные масти
      if (newBonuses.length > 0) {
        let bonus = newBonuses.length * 20; // +20 за каждую масть

        // +50 если собраны ВСЕ масти
        if (completedSuits.length === 5) {
          bonus = 50;
        }

        updateUserWithBonus(
          userId,
          bonus,
          JSON.stringify(cards),
          JSON.stringify(completedSuits),
          (err) => {
            if (err) resolve(null);
            else resolve({
              bonuses: newBonuses,
              totalBonus: bonus,
              message: bonus === 50
                ? '🎉 ВАУ! Вы собрали ВСЕ масти! +50 запросов! 🏆'
                : `🎉 Собраны масти: ${newBonuses.map(s => getSuitName(s)).join(', ')}! +${bonus} запросов!`
            });
          }
        );
      } else {
        // Просто сохраняем новые карты
        updateUserCards(userId, JSON.stringify(cards), (err) => {
          resolve(null);
        });
      }
    });
  });
};

const getSuitName = (suit) => {
  const names = {
    'Major': 'Старшие Арканы',
    'Wands': 'Жезлы',
    'Cups': 'Кубки',
    'Swords': 'Мечи',
    'Pentacles': 'Пентакли'
  };
  return names[suit] || suit;
};

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
    "Например: «Что мне учесть при смене работы? Что у меня будет с ним (ней)»\n" +
    `Просто напиши — и карты расскажут все!\n\n` +

    "💎 Собирай коллекции карт и получай дополнительные запросы, подробнее /mycollection \n" +
    "🎭 Выбирай свой стиль ответа бота /style💎"
  );
});

bot.command('mycollection', (ctx) => {
  const userId = ctx.from.id;

  getUserData(userId, (err, user) => {

    if (err || !user) return ctx.reply('Ошибка загрузки коллекции');

    let message = 'Коллекционируйте карты, получите +20 запросов за каждую собранную масть и +50 за все собранные масти! 🃏\n\n📚 Ваша коллекция карт:\n\n';

    const cards = user.collected_cards ? JSON.parse(user.collected_cards) : [];
    const completedSuits = user.completed_suits ? JSON.parse(user.completed_suits) : [];

    const suits = ['Major', 'Wands', 'Cups', 'Swords', 'Pentacles'];

    suits.forEach(suit => {
      const total = tarotDeck.filter(c => c.suit === suit).length;
      const collected = cards.filter(c => c.suit === suit).length;
      const isCompleted = completedSuits.includes(suit);

      message += `${isCompleted ? '✅' : '📖'} ${getSuitName(suit)}: ${collected}/${total}\n`;
    });

    message += `\n🎯 Собрано мастей: ${completedSuits.length}/5`;
    message += `\n❓ Осталось запросов: ${user.questionsLeft || 0}`;

    ctx.reply(message);
  });
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
        temperature: 1,
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
const userStreams = new Map(); 


bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const question = (ctx.message?.text || "").trim();
  console.log("User send message| Id: ", userId, "| Name: ", ctx.from.username);

  // Предотвращаем параллельные стримы для одного пользователя
  if (userStreams.has(userId)) {
    return ctx.reply("⏳ Подождите, текущий ответ ещё не готов...");
  }

  const userState = userStates.get(userId);

  // Обработка email
  if (userState && userState.action === 'buy_questions') {
    const email = ctx.message.text.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return ctx.reply('❌ Пожалуйста, введите корректный email адрес.');
    }

    try {
      await db.updateUserEmail(userId, email); // предполагаем, что updateUserEmail теперь async
      userStates.delete(userId);
      await ctx.reply(`✅ Email сохранен!\n\n`);
      sendNoQuestionsMessage(ctx);
      return;
    } catch (error) {
      console.error('Payment error:', error);
      return ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }

  if (!question || !isValidQuestion(question)) {
    return ctx.reply("❌ Пожалуйста, задай корректный вопрос (не менее 2 слов).");
  }

  const user = await getUser(userId);

  if (user.questionsLeft <= 0) {
    return sendNoQuestionsMessage(ctx);
  }

  const ok = await useQuestion(userId);
  if (!ok) {
    return ctx.reply("🚫 У тебя нет доступных вопросов.");
  }

  try {
    // Карты и коллекции
    const cards = drawCards(tarotDeck);
    const cardsIds = cards.map(c => c.id);
    const collectionResult = await checkCollections(userId, cards);

    await ctx.reply("🃏 Твои карты:\n" + cards.map(c => `${c.name} ${SUIT_EMOJI[c.suit]}`).join(", "));
    if (collectionResult) await ctx.reply(collectionResult.message);

    const mergedImage = await generateMergedImage(cardsIds, userId);
    await ctx.replyWithPhoto({ source: mergedImage });
    await fs.unlinkSync(mergedImage);

    // Создаем сообщение для стриминга
    const waitingMsg = await ctx.reply("🔮 Ожидаю расшифровку...");
    userStreams.set(userId, true); // отмечаем активный стрим

    const userStyle = await db.getUserResponseStyle(userId);
    
    const prompt = buildPrompt(question, cards, userStyle);
    let currentText = "🔮\n\n";
    let lastUpdate = Date.now();

    // Асинхронная функция для стриминга
    (async () => {
      try {
        await askOpenAIStreaming(
          prompt,
          async (chunk) => {
            currentText += chunk;
            if (Date.now() - lastUpdate > 2000) {
              lastUpdate = Date.now();
              await ctx.telegram.editMessageText(
                waitingMsg.chat.id,
                waitingMsg.message_id,
                undefined,
                currentText + " 🔮"
              ).catch(()=>{});
            }
          },
          async (finalText) => {
            await ctx.telegram.editMessageText(waitingMsg.chat.id, waitingMsg.message_id, undefined, finalText)
              .catch(()=>{});
            userStreams.delete(userId); // снимаем блокировку после завершения
          }
        );
      } catch (err) {
        console.error(err);
        userStreams.delete(userId);
        await ctx.telegram.editMessageText(waitingMsg.chat.id, waitingMsg.message_id, undefined,
          "Упс, что-то пошло не так при обращении к ИИ. Попробуй ещё раз 🙏"
        ).catch(()=>{});
      }
    })();

  } catch (err) {
    console.error(err);
    await ctx.reply("Упс, что-то пошло не так. Попробуй ещё раз 🙏");
  }
});



bot.launch().then(() => {
  console.log("✅ Tarot Bot запущен");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));