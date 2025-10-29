const fs = require('fs');
const db = require('../db.js');
const dayjs = require('dayjs');

const { Markup } = require("telegraf");
const { tarotDeck } = require("../deck/deck.js");
const SUIT_EMOJI = {
    Wands: "🔥",
    Cups: "💧",
    Swords: "🗡️",
    Pentacles: "🪙",
    Major: "✨",
};

async function dailyCardHandlers(ctx) {
    const today = dayjs().format('YYYY-MM-DD');
    const userId = ctx.from.id;
    const card = tarotDeck[Math.floor(Math.random() * tarotDeck.length)];
    const cardImage = `./img/${card.id}.jpg`;
    const existing = db.getDailyCard(userId, today);
    const user = await db.getUser(userId);
    const userNotifications = user?.daily_card_notifications !== 0;
    const toggleText = userNotifications
        ? "🔕 Отключить карту дня"
        : "🔔 Включить карту дня";


    if (existing) {
        if (!existing.interpretation) {
            try {
                await ctx.replyWithPhoto(
                    { source: `./img/${existing.cardId}.jpg` },
                    {
                        caption: `🃏 Ваша карта дня — ${getCardName(existing.cardId)}\n\nХотите персональную интерпретацию по вашей дате рождения?`,
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('🔮 Подробнее', `daily_more_${existing.cardId}`)],
                            [Markup.button.callback(toggleText, 'daily_disable')]
                        ])
                    }
                );
            } catch (error) {
                console.log(error);

            }
            return;
        }

        await ctx.replyWithPhoto(
            { source: `./img/${existing.cardId}.jpg` },
            { caption: `🃏 Ваша карта дня: ${getCardName(existing.cardId)}` }
        );
        await ctx.reply(`${existing.interpretation}`);
        return;
    }

    // Сохраняем карту (пока без интерпретации)
    db.saveDailyCard(userId, today, card.id);

    await ctx.replyWithPhoto(
        { source: cardImage },
        {
            caption: `🃏 Ваша карта дня — ${card.name} ${SUIT_EMOJI[card.suit]}\n\nХотите персональную интерпретацию по вашей дате рождения?`,
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔮 Подробнее (-1 вопрос)', `daily_more_${card.id}`)],
                [Markup.button.callback(toggleText, 'daily_disable')]
            ])
        }
    );
}


function getCardName(cardId) {
    const card = tarotDeck.find(c => c.id === cardId);
    return card ? card.name : " ";
}

function buildDailyCardPrompt(card, birthday, date) {
    return `
  ТЫ — ПРОФЕССИОНАЛЬНЫЙ АСТРОЛОГ-ТАРОЛОГ. Создай персонализированное напутствие на день.
  
  **СТРУКТУРА ОТВЕТА:**
  - КРАТКОЕ НАПУТСТВИЕ - 1-2 предложения, суть дня
  - ВЛИЯНИЕ КАРТЫ - как ${card} проявляется в твоей жизни сегодня
  - ЗОДИАКАЛЬНЫЙ АСПЕКТ - связь с твоим знаком зодиака 
  - ПРЕДУПРЕЖДЕНИЕ - чего избегать
  - добавь мягкое обобщающее послание или совет для дня.

  
  **ДАННЫЕ:**
  - ДАТА: ${date}
  - КАРТА ДНЯ: ${card} 
  - ЗНАК ЗОДИАКА определить по дате рождения
  - ДАТА РОЖДЕНИЯ в формате дд.мм.гггг: ${birthday}
  
  **ПРАВИЛА:**
  - Сочетай астрологическую интерпретацию даты рождения с энергией карты.
  - НИКАКИХ ПРИВЕТСТВИЙ - начинай сразу с напутствия
  - ТОН: поддерживающий, но объективный
  - ОБЪЕМ: 800-1500 символов, не более 2000
  - использовать эмодзи в тексте и начале пунктов
  - НИКАКИХ ** ДЛЯ ВЫДЕЛЕНИЯ - только текст
  - ИЗБЕГАЙ ШАБЛОННЫХ ФРАЗ
  
  Создай уникальное сообщение, которое даст конкретные ориентиры на день.
  `.trim();
}


module.exports = {
    dailyCardHandlers,
    buildDailyCardPrompt,
    getCardName
}
