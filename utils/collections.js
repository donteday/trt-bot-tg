const { getUserData, updateUserWithBonus, updateUserCards } = require("../db");
const { tarotDeck } = require("../deck/deck.js");

// 🎴 Проверка и обновление коллекций пользователя
async function checkCollections(userId, newCards) {
  return new Promise((resolve) => {
    getUserData(userId, (err, user) => {
      if (err || !user) return resolve(null);

      let cards = user.collected_cards ? JSON.parse(user.collected_cards) : [];
      let completedSuits = user.completed_suits ? JSON.parse(user.completed_suits) : [];

      let newBonuses = [];
      let gotNewCards = false;

      // Добавляем новые карты
      for (const card of newCards) {
        if (!cards.find(c => c.id === card.id)) {
          cards.push(card);
          gotNewCards = true;
        }
      }

      if (!gotNewCards) return resolve(null);

      // Проверяем масти на завершение
      const suits = ['Major', 'Wands', 'Cups', 'Swords', 'Pentacles'];

      for (const suit of suits) {
        const allInSuit = tarotDeck.filter(c => c.suit === suit);
        const userInSuit = cards.filter(c => c.suit === suit);

        if (userInSuit.length === allInSuit.length && !completedSuits.includes(suit)) {
          newBonuses.push(suit);
          completedSuits.push(suit);
        }
      }

      // Начисляем бонусы
      if (newBonuses.length > 0) {
        let bonus = newBonuses.length * 20; // +20 за каждую масть
        if (completedSuits.length === 5) bonus = 50; // +50 за все масти

        updateUserWithBonus(
          userId,
          bonus,
          JSON.stringify(cards),
          JSON.stringify(completedSuits),
          (err) => {
            if (err) resolve(null);
            else resolve({
              bonuses: newBonuses,
              totalBonus: bonus,
              message:
                bonus === 50
                  ? '🎉 ВАУ! Вы собрали ВСЕ масти! +50 запросов! 🏆'
                  : `🎉 Собраны масти: ${newBonuses.map(s => getSuitName(s)).join(', ')}! +${bonus} запросов!`
            });
          }
        );
      } else {
        updateUserCards(userId, JSON.stringify(cards), () => resolve(null));
      }
    });
  });
}

// 🌟 Названия мастей (человеческие)
function getSuitName(suit) {
  const names = {
    Major: "Старшие Арканы",
    Wands: "Жезлы",
    Cups: "Кубки",
    Swords: "Мечи",
    Pentacles: "Пентакли",
  };
  return names[suit] || suit;
}

module.exports = { checkCollections, getSuitName };
