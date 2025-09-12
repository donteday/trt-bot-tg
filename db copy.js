const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("tarot.db");

// Создание таблицы пользователей
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      userId INTEGER PRIMARY KEY,
      questionsLeft INTEGER DEFAULT 5,  -- изначально 5 вопросов
      fateUsed INTEGER DEFAULT 0        -- матрица судьбы (0 = доступна, 1 = уже использована)
    )
  `);
});

// Получить данные пользователя
function getUser(userId) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE userId = ?", [userId], (err, row) => {
      if (err) return reject(err);
      if (!row) {
        // если нет, создаём нового пользователя
        db.run("INSERT INTO users (userId, questionsLeft, fateUsed) VALUES (?, 5, 0)", [userId], function (err2) {
          if (err2) return reject(err2);
          resolve({ userId, questionsLeft: 5, fateUsed: 0 });
        });
      } else {
        resolve(row);
      }
    });
  });
}

// Списать 1 вопрос
function useQuestion(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET questionsLeft = questionsLeft - 1 WHERE userId = ? AND questionsLeft > 0",
      [userId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0); // true если уменьшилось
      }
    );
  });
}

// Добавить вопросы (например, +5)
function addQuestions(userId, amount = 5) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET questionsLeft = questionsLeft + ? WHERE userId = ?",
      [amount, userId],
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

// Использовать матрицу судьбы (один раз)
function useFate(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET fateUsed = 1 WHERE userId = ? AND fateUsed = 0",
      [userId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0); // true если обновилось
      }
    );
  });
}

module.exports = { getUser, useQuestion, addQuestions, useFate };