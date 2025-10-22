// state/loveCache.js
const loveCache = new Map();

/**
 * Сохраняет последнюю пару пользователя
 * @param {number} userId
 * @param {string} name1
 * @param {string} date1
 * @param {string} name2
 * @param {string} date2
 */
function setLovePair(userId, name1, date1, name2, date2) {
  loveCache.set(userId, { name1, date1, name2, date2, time: Date.now() });
}

/**
 * Получает сохранённую пару, если она не старше 1 часа
 */
function getLovePair(userId) {
  const data = loveCache.get(userId);
  if (!data) return null;
  if (Date.now() - data.time > 60 * 60 * 1000) {
    loveCache.delete(userId);
    return null;
  }
  return data;
}

module.exports = { setLovePair, getLovePair };
