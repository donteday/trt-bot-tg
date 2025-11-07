require("dotenv").config();
const sqlite3 = require("sqlite3").verbose();
const { Telegraf } = require("telegraf");
const fs = require("fs");

const bot = new Telegraf(process.env.TELEGRAM_TOKEN, { handlerTimeout: 0 });
bot.stop = () => {}; // отключаем polling

const db = new sqlite3.Database("tarot.db");

/**
 * 📢 Отправка широковещательных сообщений пользователям
 */
async function sendBroadcast(message) {
  console.log("🔄 Начинаем рассылку...");

  return new Promise((resolve, reject) => {
    // 🔹 выбираем только активных пользователей
    db.all("SELECT userId FROM users WHERE blocked = 0", async (err, rows) => {
      if (err) {
        console.error("❌ Ошибка базы данных:", err);
        reject(err);
        return;
      }

      console.log(`📊 Найдено активных пользователей: ${rows.length}`);

      let successCount = 0;
      let failCount = 0;
      let blockedCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const user = rows[i];

        try {
          await bot.telegram.sendMessage(user.userId, message);
          successCount++;

          // ограничение по скорости
          await new Promise((r) => setTimeout(r, 60));
        } catch (error) {
          const desc = error.response?.description || error.message;

          if (error.response?.error_code === 403) {
            console.log(`🚫 Пользователь ${user.userId} заблокировал бота`);
            blockedCount++;

            // ⚙️ помечаем как заблокированного
            db.prepare("UPDATE users SET blocked = 1 WHERE userId = ?").run(user.userId);
          } else {
            console.log(`❌ Ошибка для ${user.userId}: ${desc}`);
          }

          failCount++;
        }

        if ((i + 1) % 50 === 0) {
          console.log(`📈 Прогресс: ${i + 1}/${rows.length}`);
        }
      }

      console.log("\n🎉 Рассылка завершена!");
      console.log(`✅ Успешно: ${successCount}`);
      console.log(`🚫 Заблокировали: ${blockedCount}`);
      console.log(`❌ Ошибок: ${failCount}`);
      resolve({ successCount, blockedCount, failCount });
    });
  });
}

// =========================
// 🏁 Запуск из консоли
// =========================
let message = process.argv[2];

if (process.argv[2] === "--file") {
  if (!process.argv[3]) {
    console.error("❌ Укажите путь к файлу: node broadcast.js --file message.txt");
    process.exit(1);
  }
  message = fs.readFileSync(process.argv[3], "utf8");
} else if (!message) {
  console.log("❌ Укажите сообщение для рассылки:");
  console.log('   node broadcast.js "Ваше сообщение"');
  process.exit(1);
}

sendBroadcast(message)
  .then(() => {
    console.log("✅ Скрипт завершен");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Ошибка скрипта:", error);
    process.exit(1);
  });
