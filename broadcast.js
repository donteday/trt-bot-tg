require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { Telegraf } = require('telegraf');
const fs = require('fs');

// Инициализация бота
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Подключение к базе
const db = new sqlite3.Database('tarot.db');

async function sendBroadcast(message) {
  return new Promise((resolve, reject) => {
    console.log('🔄 Начинаем рассылку...');
    
    // Получаем всех пользователей
    db.all("SELECT userId FROM users", async (err, rows) => {
      if (err) {
        console.error('❌ Ошибка базы данных:', err);
        reject(err);
        return;
      }

      console.log(`📊 Найдено пользователей: ${rows.length}`);
      
      let successCount = 0;
      let failCount = 0;

      // Отправляем сообщения с задержкой
      for (let i = 0; i < rows.length; i++) {
        const user = rows[i];
        
        try {
          await bot.telegram.sendMessage(user.userId, message);
          console.log(`✅ Отправлено пользователю ${user.userId}`);
          successCount++;
          
          // Задержка чтобы не спамить (30 сообщений/сек лимит Telegram)
          await new Promise(resolve => setTimeout(resolve, 50));
          
        } catch (error) {
          if (error.response?.error_code === 403) {
            console.log(`🚫 Пользователь ${user.userId} заблокировал бота`);
          } else {
            console.log(`❌ Ошибка для ${user.userId}:`, error.response?.description);
          }
          failCount++;
        }

        // Прогресс каждые 50 пользователей
        if ((i + 1) % 50 === 0) {
          console.log(`📈 Прогресс: ${i + 1}/${rows.length}`);
        }
      }

      console.log('\n🎉 Рассылка завершена!');
      console.log(`✅ Успешно: ${successCount}`);
      console.log(`❌ Ошибок: ${failCount}`);
      
      resolve({ successCount, failCount });
    });
  });
}

// Запуск из командной строки

let message = process.argv[2];
if (process.argv[2] === '--file') {
  message = fs.readFileSync(process.argv[3], 'utf8');
  // отправляем message
} else

if (!message) {
  console.log('❌ Укажите сообщение для рассылки:');
  console.log('   node broadcast.js "Ваше сообщение"');
  process.exit(1);
}

// Запускаем рассылку
sendBroadcast(message)
  .then(() => {
    console.log('✅ Скрипт завершен');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Ошибка скрипта:', error);
    process.exit(1);
  });