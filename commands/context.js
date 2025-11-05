const { getContext } = require('../db.js');
const { Markup } = require('telegraf');

/**
 * Обработчик команды /context
 * Показывает историю раскладов пользователя
 */
async function contextCommand(ctx) {
  const userId = ctx.from.id;
  
  try {
    const context = getContext(userId);
    
    if (context.length === 0) {
      await ctx.reply('📝 История ваших раскладов пуста.\n\nКаждый новый расклад будет сохраняться здесь для более персонализированных ответов.');
      return;
    }
    
    let message = '📚 *История ваших раскладов:*\n\n';
    
    context.forEach((item, index) => {
      message += `*${index + 1}. Вопрос:* ${item.userMessage}\n`;
      
      if (item.cards) {
        try {
          const cardNames = JSON.parse(item.cards).map(c => c.name).join(', ');
          message += `   🎴 *Карты:* ${cardNames}\n`;
        } catch (e) {
          console.error('Error parsing cards:', e);
        }
      }
      
      const date = new Date(item.created_at);
      message += `   📅 *Дата:* ${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}\n\n`;
    });
    
    message += `_Всего сохранено раскладов: ${context.length}_`;

    await ctx.reply(message, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🧹 Очистить историю', 'clear_context')]
        // [Markup.button.callback('📋 Как это используется?', 'context_help')]
      ])
    });
    
  } catch (error) {
    console.error('Error in context command:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке истории. Попробуйте позже.');
  }
}

module.exports = { contextCommand };