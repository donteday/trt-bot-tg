// sendDailyCards.js
const dayjs = require('dayjs');
const { Markup } = require('telegraf');
const db = require('./db.js');

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
                        { source: `./img/dailycard.png` },
                        {
                            caption: `🃏 Ваша карта дня — готова!\n\nХотите получить персональную интерпретацию по вашей дате рождения и узнать влияние на ваш знак зодиака ❓\n🎯 Расшифровать карту: -1 запрос \n\n❤️ Скоро телеграмм заблокируют, переходите к нам на сайт https://taroyal.ru/ \nБольше раскладов, можно обсудить вопрос, по промокоду TAROSHKA - 10 раскладов бесплатно`,
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('🔮 Открыть', `daily_more_${card.id}`)],
                                [Markup.button.callback('🔕 Отключить карту дня', 'daily_disable')]
                            ])
                        }
                    );
                }
            } catch (error) {
                if (error.response?.error_code === 403) {
                    db.setUserBlocked(userId, 1);
                    return;
                  }
                console.log(`❌ Ошибка при отправке пользователю ${userId}: ${error.message}`);
            }
        }));

        // Пауза между батчами
        if (i + BATCH_SIZE < users.length) {
            await new Promise(res => setTimeout(res, BATCH_DELAY));
        }
    }

}

module.exports = { sendDailyCards };
