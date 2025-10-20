// actions/daily.js
const dayjs = require("dayjs");
const db = require("../db");
const { getUser } = require("../db");
const { tarotDeck } = require("../deck/deck");
const { getCardName } = require("../commands/daily");
const { buildDailyCardPrompt } = require("../commands/daily");
const { askOpenAIStreaming, userStreams } = require("../utils/streaming");
const { userStates } = require("../state/userStates");

/**
 * Действие "daily_more_X" — показать полную расшифровку карты дня.
 */
async function dailyMoreAction(ctx) {
    const userId = ctx.from.id;
    const cardId = ctx.match[1];
    const card = tarotDeck.find((c) => c.id === cardId);
    const today = dayjs().format("YYYY-MM-DD");
    const user = await getUser(userId);

    if (!user) {
        return ctx.reply("❌ Не удалось загрузить данные пользователя.");
    }

    // если нет вопросов — предлагаем пополнить
    if (user.questionsLeft <= 0) {
        await ctx.reply("🚫 Необходимо пополнить баланс.");
        return sendNoQuestionsMessage(ctx);
    }

    // если не указана дата рождения — запрашиваем
    if (!user.birthday) {
        await ctx.reply("📅 Введите дату рождения в формате ДД.ММ.ГГГГ");
        userStates.set(userId, { action: "daily_birthday", cardId });
        return;
    }

    await ctx.deleteMessage().catch(() => { });

    const existing = await db.getDailyCard(userId, today);
    if (!existing || !existing.interpretation || existing.date !== today) {
        await db.useQuestion(userId);

        await ctx.replyWithPhoto(
            { source: `./img/${cardId}.jpg` },
            { caption: `🃏 Ваша карта дня: ${getCardName(cardId)}` }
        );

        const waitingMsg = await ctx.reply("🔮");

        const prompt = buildDailyCardPrompt(card.name, user.birthday, today);
        console.log(prompt);
        
        let currentText = "🔮\n\n";
        let lastUpdate = Date.now();
        userStreams.set(userId, true);

        (async () => {
            try {
                await askOpenAIStreaming(
                    userId,
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
                        await ctx.telegram.editMessageText(
                            waitingMsg.chat.id,
                            waitingMsg.message_id,
                            undefined,
                            finalText
                        ).catch(() => { });
                        await db.saveDailyInterpretation(userId, today, finalText);
                        userStreams.delete(userId);
                    }
                );
            } catch (err) {
                console.error("Ошибка dailyMoreAction:", err);
                userStreams.delete(userId);
                await ctx.telegram.editMessageText(
                    waitingMsg.chat.id,
                    waitingMsg.message_id,
                    undefined,
                    "Упс, что-то пошло не так при обращении к ИИ. Попробуй ещё раз 🙏"
                ).catch(() => { });
            }
        })();
    } else {
        await ctx.replyWithPhoto(
            { source: `./img/${cardId}.jpg` },
            { caption: `🃏 Ваша карта дня: ${getCardName(cardId)}` }
        );
        await ctx.reply(existing.interpretation);
    }
}

/**
 * Действие "daily_disable" — отключает рассылку карт дня.
 */
async function dailyDisableAction(ctx) {
    const userId = ctx.from.id;
    await db.toggleDailyNotifications(userId);
    await ctx.reply("🚫 Вы отключили рассылку карт дня.");
}

module.exports = {
    dailyMoreAction,
    dailyDisableAction,
};
