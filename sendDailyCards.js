// sendDailyCards.js
const dayjs = require('dayjs');
const { Markup } = require('telegraf');
const db = require('./db.js');


// helper: безопасно отправить фото + длинный текст отдельным сообщением
async function sendCardWithText(bot, userId, card, text) {
    // caption максимум ~1024
    const shortCaption = `🃏 Ваша карта дня — ${card.name}`;
    await bot.telegram.sendPhoto(
        userId,
        { source: `./img/${card.id}.jpg` },
        { caption: shortCaption }
    );

    if (text && text.trim()) {
        // длинный текст отдельным сообщением
        await bot.telegram.sendMessage(userId, `🔮 ${text}`);
    }
}

// Основная функция рассылки
async function sendDailyCards(bot, tarotDeck, options = {}) {
    const BATCH_SIZE = options.batchSize ?? 25;     // сколько отправляем параллельно
    const BATCH_DELAY = options.batchDelay ?? 2000; // пауза между батчами (мс)
    const today = dayjs().format('YYYY-MM-DD');


    const users = db.getAllUserIds(true); // только те, у кого включено daily_card_notifications
    
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async ({ userId }) => {
            try {
                const existing = db.getDailyCard(userId, today);
                
                if (!existing || existing.date !== today) {
                    const card = tarotDeck[Math.floor(Math.random() * tarotDeck.length)];
                    db.saveDailyCard(userId, today, card.id);

                    await bot.telegram.sendPhoto(
                        userId,
                        { source: `./img/${card.id}.jpg` },
                        {
                            caption: `🃏 Ваша карта дня — ${card.name}\n\nХотите персональную интерпретацию по вашей дате рождения?`,
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('🔮 Подробнее (-1 вопрос)', `daily_more_${card.id}`)],
                                [Markup.button.callback('🔕 Отключить карту дня', 'daily_disable')]
                            ])
                        }
                    );
                }
            } catch (e) {
                console.log(`❌ Ошибка при отправке пользователю ${userId}: ${e.message}`);
            }
        }));

        // Пауза между батчами
        if (i + BATCH_SIZE < users.length) {
            await new Promise(res => setTimeout(res, BATCH_DELAY));
        }
    }

}

module.exports = { sendDailyCards };
