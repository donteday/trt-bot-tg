// actions/changeStyle.js
const { styleConfig } = require("../configs/configs");
const db = require("../db");

/**
 * Действие "style_X" — смена стиля ответов пользователя
 */
async function changeStyleAction(ctx) {
  const userId = ctx.from.id;
  const styleId = parseInt(ctx.match[1], 10);
  const selectedStyle = styleConfig[styleId];

  if (!selectedStyle) {
    return ctx.answerCbQuery("❌ Неизвестный стиль");
  }
  await ctx.answerCbQuery().catch(()=>{});
  try {
    await db.setUserResponseStyle(userId, styleId);
    await ctx.editMessageText(
      `✅ Выбран стиль: ${selectedStyle}\n\nТеперь все ответы будут в этом формате ✨`
    );
  } catch (error) {
    console.error("Ошибка при смене стиля:", error);
    await ctx.answerCbQuery("❌ Ошибка при смене стиля");
  }
}

module.exports = { changeStyleAction };
