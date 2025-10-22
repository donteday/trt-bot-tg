// utils/prompts/lovePrompts.js
function buildLovePromptShort(name1, date1, name2, date2) {
    return `
  Ты — астролог и психолог. 
  Сделай краткий анализ совместимости между ${name1} (${date1}) и ${name2} (${date2}).
  
  Раздели ответ на 4 блока:
  1. 🌞 Знаки зодиака и первая совместимость
  2. 💫 Эмоции и притяжение
  3. 💓 Потенциал отношений
  4. 💍 Совет от Вселенной
  
  Пиши по-русски, с теплом и живыми фразами. Не более 1000 символов.
  `.trim();
  }
  
  module.exports = { buildLovePromptShort };
  