const { Markup } = require("telegraf");
const db = require("../db");
const { updateBonusDate } = require("../db");
const dayjs = require("dayjs");
const path = require("path");


async function bonusCommand(ctx) {
    const userId = ctx.from.id;
    const user = await db.getUser(userId);
    const today = dayjs().format("YYYY-MM-DD");

    const BONUS_BACK_IMAGE = path.join(__dirname, "../img/back.jpg");

    // если дата совпадает с сегодняшним днём — уже использовал
    if (user?.lastBonusDate && dayjs(user.lastBonusDate).isSame(dayjs(), "day")) {
        return ctx.reply("🎴 Бонусная игра уже использована сегодня! Приходи завтра 💫");
    }

    await ctx.replyWithPhoto(
        { source: BONUS_BACK_IMAGE },
        {
            caption: `🌙 Ежедневная игра судьбы!  
Старшие Арканы открывают вам шанс получить до 10 подарочных вопросов 💎  

Выберите момент, сосредоточьтесь и нажмите «Перевернуть карты» —  
пусть судьба сама решит, сколько мудрости подарить сегодня 🔮`,
            reply_markup: {
                inline_keyboard: [[{ text: "🃏 Перевернуть карты", callback_data: "bonus_open" }]],
            },
        }
    );
}


module.exports = { bonusCommand };
