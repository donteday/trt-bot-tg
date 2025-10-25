const { Markup } = require("telegraf");
const dayjs = require("dayjs");
const db = require("../db");
const { tarotDeck } = require("../deck/deck");
const { generateBonusImage } = require("../utils/images");
const fs = require("fs");

async function bonusOpenAction(ctx) {
  const userId = ctx.from.id;
  await ctx.answerCbQuery().catch(() => {});

  const user = await db.getUser(userId);
  const today = dayjs().format("YYYY-MM-DD");

  // Если уже играл сегодня — выходим
  if (user?.lastBonusDate === today && user?.bonusOpened) {
    return ctx.reply("🎴 Бонусная игра уже использована сегодня!");
  }

  // Случайно выбираем 4 карты
  const shuffled = [...tarotDeck].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 4);

  // Группируем по имени (считаем совпадения)
  const names = selected.map((c) => c.name);
  const unique = new Set(names);
  const duplicates = 4 - unique.size;

  // Вычисляем награду
  let reward = 1; // базовый приз
  if (duplicates === 1) reward = 3;
  if (duplicates === 2) reward = 5;
  if (duplicates >= 3) reward = 20;

  // Начисляем пользователю
//   await db.run("UPDATE users SET questionsLeft = questionsLeft + ? WHERE userId = ?", [reward, userId]);
//   await db.run("UPDATE users SET bonusOpened = 1 WHERE userId = ?", [userId]);

  // Генерируем картинку 4 открытых карт
  const imagePaths = selected.map((card) => card.id);
  const bonusImage = await generateBonusImage(imagePaths, userId);
  const resultText = [
    `🃏 Вы открыли карты: ${names.join(", ")}`,
    `✨ Совпадений: ${duplicates}`,
    `💎 Начислено: +${reward} вопросов!`,
    `Приходи завтра за новой попыткой 💫`,
  ].join("\n");

try {
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
} catch (error) {
    console.log(error);
    
} finally {
    fs.unlinkSync(bonusImage);
    
}
}

module.exports = { bonusOpenAction };
