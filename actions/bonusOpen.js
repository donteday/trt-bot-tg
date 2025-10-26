const { Markup } = require("telegraf");
const dayjs = require("dayjs");
const db = require("../db");
const { tarotDeck } = require("../deck/deck");
const { generateBonusImage } = require("../utils/images");
const fs = require("fs");

async function bonusOpenAction(ctx) {
    const userId = ctx.from.id;
    await ctx.answerCbQuery().catch(() => { });

    const user = await db.getUser(userId);
    const today = dayjs().format("YYYY-MM-DD");

    // Если уже играл сегодня — выходим
    if (user?.lastBonusDate && dayjs(user.lastBonusDate).isSame(dayjs(), "day")) {
        return ctx.reply("🎴 Бонусная игра уже использована сегодня! Приходи завтра 💫");
    }

    // Случайно выбираем 4 карты
    const majorArcana = tarotDeck.filter(card => card.suit === "Major");
    const selected = [];
    for (let i = 0; i < 4; i++) {
        const randomCard = majorArcana[Math.floor(Math.random() * majorArcana.length)];
        selected.push(randomCard);
    }

    // Группируем по имени (считаем совпадения)
    const names = selected.map((c) => c.name);
    const unique = new Set(names);
    const duplicates = 4 - unique.size;

    // Вычисляем награду
    let reward = 0; // базовый приз
    if (duplicates === 1) reward = 2;
    if (duplicates === 2) reward = 5;
    if (duplicates >= 3) reward = 10;

    // Начисляем пользователю
    await db.addQuestionsAfterPayment(userId, reward);


    // Генерируем картинку 4 открытых карт
    const imagePaths = selected.map((card) => card.id);
    const bonusImage = await generateBonusImage(imagePaths, userId);
    let resultText = "";

    if (duplicates === 0) {
        resultText =
            `🃏 Вы открыли карты: ${names.join(", ")}\n\n` +
            `😅 Сегодня судьба решила немного пошутить — совпадений нет.\n` +
            `Попробуй снова завтра, может повезёт больше 💫`;
    } else {
        resultText =
            `🃏 Вы открыли карты: ${names.join(", ")}\n` +
            `✨ Совпадений: ${duplicates}\n` +
            `💎 Начислено: +${reward} вопросов!\n\n` +
            `Приходи завтра за новой попыткой 🔮`;
    }

    try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});

        await ctx.editMessageMedia(
            {
                type: "photo",
                media: { source: bonusImage },
                caption: resultText,
            },
            {
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback("🎴 Попробовать завтра", "ignore")],
                ]),
            }
        );
    } catch (err) {
        if (err.description?.includes("canceled by new editMessageMedia")) {
            console.warn("⚠️ Telegram отменил прошлый editMessageMedia, отправляем новое сообщение");
        } else {
            console.error("❌ Ошибка при редактировании бонусного изображения:", err);
        }

        // fallback — просто отправляем новую фотку
        await ctx.replyWithPhoto({ source: bonusImage }, {
            caption: resultText,
            reply_markup: {
                inline_keyboard: [[{ text: "🎴 Попробовать завтра", callback_data: "ignore" }]],
            },
        });
    } finally {
        fs.unlinkSync(bonusImage);
        console.log("Бонуска 🎁 +", reward, userId);
        await db.updateBonusDate(userId, today);
    }
}

module.exports = { bonusOpenAction };
