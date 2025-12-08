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
    
    // Разбиваем контекст на части по 7 записей в каждой
    const chunkSize = 7;
    const chunks = [];
    
    for (let i = 0; i < context.length; i += chunkSize) {
      chunks.push(context.slice(i, i + chunkSize));
    }
    
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      let message = `📚 *История ваших раскладов (часть ${chunkIndex + 1}/${chunks.length}):*\n\n`;
      const chunk = chunks[chunkIndex];
      
      chunk.forEach((item, index) => {
        const globalIndex = chunkIndex * chunkSize + index;
        message += `*${globalIndex + 1}. Вопрос:* ${truncateText(item.userMessage, 100)}\n`;
        
        if (item.cards) {
          try {
            const cards = JSON.parse(item.cards);
            if (Array.isArray(cards) && cards.length > 0) {
              const cardNames = cards.map(c => c.name).slice(0, 5).join(', ');
              message += `   🎴 *Карты:* ${cardNames}`;
              if (cards.length > 5) {
                message += ` и еще ${cards.length - 5}`;
              }
              message += '\n';
            }
          } catch (e) {
            console.error('Error parsing cards:', e);
          }
        }
        
        const date = new Date(item.created_at);
        message += `   📅 *Дата:* ${date.toLocaleDateString('ru-RU')} ${date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}\n\n`;
      });
      
      // Отправляем сообщение
      const sendOptions = {
        parse_mode: 'Markdown'
      };
      
      // Добавляем кнопки только к последнему сообщению
      if (chunkIndex === chunks.length - 1) {
        message += `_Всего сохранено раскладов: ${context.length}_`;
        sendOptions.reply_markup = Markup.inlineKeyboard([
          [Markup.button.callback('🧹 Очистить историю', 'clear_context')]
        ]).reply_markup;
      }
      
      await ctx.reply(message, sendOptions);
      
      // Небольшая задержка между сообщениями, чтобы не получить ограничение от Telegram
      if (chunkIndex < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
  } catch (error) {
    console.error('Error in context command:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке истории. Попробуйте позже.');
  }
}

/**
 * Обрезает текст до указанной длины, добавляя многоточие
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

module.exports = { contextCommand };