const { Markup } = require("telegraf");
const db = require('../db.js');
const { styleConfig } = require("../configs/configs.js");

async function sendChangeStyleMessage(ctx) {
    const userId = ctx.from.id;
    const userStyle = await db.getUserResponseStyle(userId);
    try {
        return await ctx.reply(
            `🎭 Выбери стиль ответа таролога:\nОт мистики до твоей лучше подруги с бокальчиком вина 🍷\n\n Выбрано: ${styleConfig[userStyle]}`,
            Markup.inlineKeyboard([
                [Markup.button.callback("🔮 Стандартный", "style_1")],
                [Markup.button.callback("💫 Мотивационный", "style_2")],
                [Markup.button.callback("😈 Жесткий троль (18+)", "style_3")],
                [Markup.button.callback("👯 Лучшая подруга", "style_4")],
                [Markup.button.callback("🃏 Уэйт", "style_5")]
            ])
        );
    } catch (error) {
        console.log(error);
    }

}

module.exports = sendChangeStyleMessage;