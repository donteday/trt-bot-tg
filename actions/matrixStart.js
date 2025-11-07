const { userStates } = require("../state/userStates");
const db = require("../db");
const { sendNoQuestionsMessage } = require("../utils");

async function matrixStart(ctx) {
    await ctx.answerCbQuery().catch(() => { });

    const userId = ctx.from.id;
    const user = await db.getUser(userId);

    if (!user || user.questionsLeft < 3) {
        return sendNoQuestionsMessage(ctx);
    }

    userStates.set(ctx.from.id, { action: "matrix_date" });
    ctx.reply("🔢 Введи дату рождения (ДД.ММ.ГГГГ):");
}

module.exports = { matrixStart }