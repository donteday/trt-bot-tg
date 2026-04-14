const { clearContext } = require('../db.js');

/**
 * Обработчик кнопки "Очистить историю"
 */
async function clearContextAction(ctx) {
  const userId = ctx.from.id;
  
  try {
    // Сразу подтверждаем нажатие
    await ctx.answerCbQuery();
    
    clearContext(userId);
    
    // Редактируем оригинальное сообщение
    await ctx.editMessageText(
      '🧹 *История ваших раскладов очищена.*\n\nТеперь я буду работать только с новыми вопросами.',
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] } // Убираем кнопки
      }
    ).catch(e => {
      // Игнорируем "message is not modified" (двойное нажатие кнопки)
      if (e.description?.includes('not modified')) return;
      throw e;
    });

  } catch (error) {
    console.error('Error clearing context:', error);

    // Если не удалось отредактировать (сообщение устарело и т.д.)
    try {
      await ctx.reply('❌ Не удалось очистить историю. Попробуйте позже.');
    } catch (e) {
      // Игнорируем ошибки отправки
    }
  }
}

/**
 * Обработчик кнопки "Как это используется?"
 */
async function handleContextHelp(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const helpText = `
ℹ️ *Как используется ваша история раскладов?*

📖 **Персонализация** — я учитываю ваши предыдущие вопросы для более точных ответов
🔄 **Преемственность** — вижу развитие ситуаций во времени  
🎯 **Глубина анализа** — нахожу связи между разными раскладами
💫 **Контекст** — понимаю общую картину ваших запросов

*Пример:* Если вы спрашивали про отношения, а теперь про карьеру — я могу увидеть связи между этими сферами.

_История автоматически ограничивается 5 последними раскладами_
    `.trim();
    
    // Пытаемся отредактировать оригинальное сообщение
    try {
      await ctx.editMessageText(helpText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Назад к истории', 'back_to_context')]
        ])
      });
    } catch (editError) {
      // Если редактирование не удалось, отправляем новое сообщение
      await ctx.reply(helpText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Назад к истории', 'back_to_context')]
        ])
      });
    }
    
  } catch (error) {
    console.error('Error in context help:', error);
  }
}

/**
 * Обработчик кнопки "Назад к истории"
 */
async function handleBackToContext(ctx) {
  try {
    await ctx.answerCbQuery();
    
    // Здесь нужно переиспользовать логику из handleContextCommand
    // Для простоты можно отправить команду заново
    await ctx.deleteMessage().catch(() => {});
    await ctx.scene.enter('context-view');
    // Или вызвать команду: bot.telegram.sendMessage(ctx.chat.id, '/context');
    
  } catch (error) {
    console.error('Error going back to context:', error);
  }
}

module.exports = {
  clearContextAction,
  handleContextHelp,
  handleBackToContext
};