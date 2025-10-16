
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
const dayjs = require('dayjs');
const https = require("https");
const cron = require('node-cron');
const { sendDailyCards } = require('./sendDailyCards.js');
const express = require("express");
const bodyParser = require("body-parser");
const sendChangeStyleMessage = require("./commands/style.js");
const { styleConfig } = require("./configs/configs.js");
const { dailyCardHandlers, buildDailyCardPrompt, getCardName } = require("./commands/daily.js");

const bot = new Telegraf(TELEGRAM_TOKEN);

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

bot.telegram.setMyCommands([
  { command: 'daily', description: '☘️ Карта дня' },
  { command: 'mycollection', description: '📚 Моя коллекция' },
  { command: 'style', description: '🎭 Стиль ответов' },
  { command: 'balance', description: '💰 Мой баланс' },
  { command: 'price', description: '💎 Узнать цены' }
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
    2: { amount: 10, price: 149 },
    3: { amount: 25, price: 299 },
    4: { amount: 50, price: 499 }
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

bot.action(/^daily_more_(.+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const cardId = ctx.match[1];
  const user = await getUser(userId);
  const card = tarotDeck.find(c => c.id === cardId);
  const today = dayjs().format('YYYY-MM-DD');
  const existing = db.getDailyCard(userId, today);

  if (user.questionsLeft <= 0) {
    await ctx.reply('🚫 Необходимо пополнить баланс.');
    return sendNoQuestionsMessage(ctx);
  }

  if (!user.birthday) {
    // Запрашиваем дату рождения
    await ctx.reply('📅 Введите дату рождения в формате ДД.ММ.ГГГГ');
    userStates.set(userId, { action: 'daily_birthday', cardId });

    return;
  }
  await ctx.deleteMessage().catch(() => { });
  if (!existing || !existing.interpretation || existing.date !== today) {
    await db.useQuestion(userId);
    await ctx.replyWithPhoto(
      { source: `./img/${cardId}.jpg` },
      { caption: `🃏 Ваша карта дня: ${getCardName(cardId)}` }
    );
    const waitingMsg = await ctx.reply("🔮 Ожидаю расшифровку...");
    askOpenAIDailyCard(ctx, card.name, user.birthday, today, waitingMsg);

  } else {
    await ctx.replyWithPhoto(
      { source: `./img/${cardId}.jpg` },
      { caption: `🃏 Ваша карта дня: ${getCardName(cardId)}` }
    );
    await ctx.reply(`${existing.interpretation}`);
  }

});

bot.action('daily_disable', async (ctx) => {
  const userId = ctx.from.id;
  db.toggleDailyNotifications(userId);
  await ctx.reply('🚫 Вы отключили рассылку карт дня.');
});

async function sendNoQuestionsMessage(ctx) {
  return ctx.reply(
    "🌟 Закончились запросы, выбери пакет, чтобы продолжить 🌟",
    Markup.inlineKeyboard([
      [Markup.button.callback("💎 50 запросов — 499₽", "buy_questions_4")],
      [Markup.button.callback("🌌 25 запросов — 299₽", "buy_questions_3")],
      [Markup.button.callback("🔮 10 запросов — 149₽", "buy_questions_2")],
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
      [Markup.button.callback("💎 50 запросов — 499₽", "buy_questions_4")],
      [Markup.button.callback("🌌 25 запросов — 299₽", "buy_questions_3")],
      [Markup.button.callback("🔮 10 запросов — 149₽", "buy_questions_2")],
      [Markup.button.callback("✨ 3 запроса — 49₽", "buy_questions_1")],
      [Markup.button.callback("🎁 Получить бесплатно", "get_free_questions")]
    ])
  );
  return;
});
bot.command("style", async (ctx) => {
  await sendChangeStyleMessage(ctx);
});
bot.command("daily", async (ctx) => {
  await dailyCardHandlers(ctx);
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
Ты — опытный таролог с мягким голосом и глубокой эмпатией.
Отвечай как человек, не как книга. 
Говори простыми словами, как будто рядом сидит человек, которому больно или тревожно.
Важно: духовная глубина + человечность + лёгкие метафоры.`,

    2: `💫 **МОТИВАЦИОННЫЙ СТИЛЬ**
Ты — духовный коуч с энергией поддержки.
Отвечай с верой, драйвом и ясными шагами, будто подбадриваешь подругу перед новым этапом.
Важно: вдохновение + конкретика + уверенность, что всё получится.`,

    3: `😈 **ЖЕСТКИЙ СТИЛЬ**
Ты — прямолинейный друг, который говорит правду в лоб, но с харизмой и юмором.
Можешь использовать лёгкий мат и сарказм, как будто рассказываешь подруге всю правду про её бывшего.
Важно: честность + эмоции + острота, но без злобы.`,

    4: `👯 **СТИЛЬ ЛУЧШЕЙ ПОДРУГИ**
Ты — та самая подруга, с которой можно всё обсудить за бокалом вина.
Пиши тепло, с лёгким юмором и сочувствием, вставляй разговорные фразы (“блин”, “ну вот”, “серьёзно?”).
Важно: лёгкость + поддержка + личный вайб общения.`
  };

  const styleInstruction = stylePrompts[styleId] || stylePrompts[1];

  return `
Ты — таролог, работающий в выбранном стиле. Отвечай эмоционально, человечно и естественно. 
Говори с пользователем напрямую, будто он сидит рядом. Избегай канцеляризмов, сухости и фраз вроде “карта указывает”.

**СТИЛЬ ОТВЕТА:**
${styleInstruction}

**КОНТЕКСТ:** пользователь уже писал ранее — не начинай с приветствия.

Вопрос: ${question}
Карты: 
${list}

СОЗДАЙ ответ, который:
✨ начинается с короткой эмоциональной фразы или образа 
📖 раскрывает каждую карту живо и по-человечески — через чувства, не лекцию
🔄 соединяет карты в историю 
💡 даёт 1–2 практических совета, как действовать или что осознать
Каждый абзац начинай с эмодзи 

Пиши максимум 3000 символов. Используй эмодзи умеренно, только по смыслу. Не используй ** в оформлении.
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

    "🍀 Карта дня /daily \n" +
    "💎 Ваша коллекция карт /mycollection \n" +
    "🎭 Cтиль ответа бота /style"
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

function askOpenAIDailyCard(ctx, card, birthday, today, waitingMsg) {
  const userId = ctx.from.id;

  const prompt = buildDailyCardPrompt(card, birthday, today);
  let currentText = "🔮\n\n";
  let lastUpdate = Date.now();
  userStreams.set(userId, true); // отмечаем активный стрим

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
            ).catch(() => { });
          }
        },
        async (finalText) => {
          try {
            // Финальное обновление текста в Telegram
            await ctx.telegram.editMessageText(
              waitingMsg.chat.id,
              waitingMsg.message_id,
              undefined,
              finalText
            ).catch(() => { });

            // --- ✅ Сохраняем интерпретацию в базу ---
            const today = dayjs().format('YYYY-MM-DD');
            db.saveDailyInterpretation(userId, today, finalText);

          } catch (err) {
            console.error("Ошибка при сохранении интерпретации:", err);
          } finally {
            userStreams.delete(userId);
          }
        }
      );
    } catch (err) {
      console.error(err);
      userStreams.delete(userId);
      await ctx.telegram.editMessageText(
        waitingMsg.chat.id,
        waitingMsg.message_id,
        undefined,
        "Упс, что-то пошло не так при обращении к ИИ. Попробуй ещё раз 🙏"
      ).catch(() => { });
    }
  })();
}
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const question = (ctx.message?.text || "").trim();
  console.log("User send message| Id: ", userId, "| Name: ", ctx.from.username);

  // Предотвращаем параллельные стримы для одного пользователя
  if (userStreams.has(userId)) {
    return ctx.reply("⏳ Подождите, текущий ответ ещё не готов...");
  }

  const userState = userStates.get(userId);

  if (userState?.action === 'daily_birthday') {
    const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;

    if (!dateRegex.test(question)) {
      return ctx.reply('❌ Введите дату в формате ДД.ММ.ГГГГ (например, 12.07.1995)');
    }

    db.setUserBirthdate(userId, question);
    await ctx.reply(`✅ Дата рождения сохранена: ${question}`);

    const user = db.getUser(userId);
    if (user.questionsLeft <= 0) {
      return sendNoQuestionsMessage(ctx);
    }

    await db.useQuestion(userId);
    const today = dayjs().format('YYYY-MM-DD');
    const cardId = userState.cardId;
    userStates.delete(userId);
    const card = tarotDeck.find(c => c.id === cardId);
    await ctx.replyWithPhoto(
      { source: `./img/${cardId}.jpg` },
      { caption: `🃏 Ваша карта дня: ${getCardName(cardId)}` }

    );
    const waitingMsg = await ctx.reply("🔮 Ожидаю расшифровку...");

    askOpenAIDailyCard(ctx, card.name, question, today, waitingMsg);
    return;
  }

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
              ).catch(() => { });
            }
          },
          async (finalText) => {
            await ctx.telegram.editMessageText(waitingMsg.chat.id, waitingMsg.message_id, undefined, finalText)
              .catch(() => { });
            userStreams.delete(userId); // снимаем блокировку после завершения
          }
        );
      } catch (err) {
        console.error(err);
        userStreams.delete(userId);
        await ctx.telegram.editMessageText(waitingMsg.chat.id, waitingMsg.message_id, undefined,
          "Упс, что-то пошло не так при обращении к ИИ. Попробуй ещё раз 🙏"
        ).catch(() => { });
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