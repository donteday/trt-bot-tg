// commands/collection.js
const { getUserData } = require("../db");
const { tarotDeck } = require("../deck/deck");
const { getSuitName } = require("../utils/collections");

/**
 * Команда /mycollection — показывает собранные карты пользователя.
 */
async function collectionCommand(ctx) {
  const userId = ctx.from.id;

  try {
    getUserData(userId, (err, user) => {
      if (err || !user) {
        return ctx.reply("❌ Ошибка загрузки коллекции. Попробуйте позже.");
      }

      let message =
        "Коллекционируйте карты, получите +20 запросов за каждую собранную масть и +50 за все масти! 🃏\n\n📚 Ваша коллекция карт:\n\n";

      const cards = user.collected_cards ? JSON.parse(user.collected_cards) : [];
      const completedSuits = user.completed_suits
        ? JSON.parse(user.completed_suits)
        : [];

      const suits = ["Major", "Wands", "Cups", "Swords", "Pentacles"];

      suits.forEach((suit) => {
        const total = tarotDeck.filter((c) => c.suit === suit).length;
        const collected = cards.filter((c) => c.suit === suit).length;
        const isCompleted = completedSuits.includes(suit);

        message += `${isCompleted ? "✅" : "📖"} ${getSuitName(suit)}: ${collected}/${total}\n`;
      });

      message += `\n🎯 Собрано мастей: ${completedSuits.length}/5`;
      message += `\n❓ Осталось запросов: ${user.questionsLeft || 0}`;

      ctx.reply(message);
    });
  } catch (error) {
    console.error("Ошибка при /mycollection:", error);
    await ctx.reply("❌ Не удалось загрузить коллекцию. Попробуйте позже.");
  }
}

module.exports = { collectionCommand };
