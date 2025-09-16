const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("tarot.db");

// Создание таблицы пользователей
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      userId INTEGER PRIMARY KEY,
      questionsLeft INTEGER DEFAULT 3,
      fateUsed INTEGER DEFAULT 0,
      email TEXT DEFAULT NULL,
      yookassaPaymentId TEXT DEFAULT NULL,
      paymentStatus TEXT DEFAULT 'pending',
      paymentAmount REAL DEFAULT 0,
      paymentDate DATETIME DEFAULT NULL
    )
  `);
  
  // Таблица для хранения истории платежей
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      paymentId TEXT,
      amount REAL,
      status TEXT,
      description TEXT,
      customer_email TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users (userId)
    )
  `);
});

// Получить данные пользователя
function getUser(userId) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE userId = ?", [userId], (err, row) => {
      if (err) return reject(err);
      if (!row) {
        db.run("INSERT INTO users (userId, questionsLeft, fateUsed) VALUES (?, 3, 0)", [userId], function (err2) {
          if (err2) return reject(err2);
          resolve({ userId, questionsLeft: 3, fateUsed: 0 });
        });
      } else {
        resolve(row);
      }
    });
  });
}

// Обновить email пользователя
function updateUserEmail(userId, email) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET email = ? WHERE userId = ?",
      [email, userId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

// Сохранить информацию о платеже
function savePayment(userId, paymentData) {
  return new Promise((resolve, reject) => {
    const { id, amount, status, description, email } = paymentData;
    
    // Обновляем пользователя
    db.run(
      `UPDATE users SET 
       yookassaPaymentId = ?, 
       paymentStatus = ?,
       paymentAmount = ?,
       paymentDate = datetime('now')
       WHERE userId = ?`,
      [id, status, amount.value, userId],
      function (err) {
        if (err) return reject(err);
        
        // Сохраняем в историю платежей с email
        db.run(
          `INSERT INTO payments (userId, paymentId, amount, status, description, customer_email) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [userId, id, amount.value, status, description, email],
          function (err2) {
            if (err2) return reject(err2);
            resolve(this.lastID);
          }
        );
      }
    );
  });
}

// Обновить статус платежа
function updatePaymentStatus(paymentId, status) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET paymentStatus = ? WHERE yookassaPaymentId = ?",
      [status, paymentId],
      function (err) {
        if (err) return reject(err);
        
        // Также обновляем в истории платежей
        db.run(
          "UPDATE payments SET status = ? WHERE paymentId = ?",
          [status, paymentId],
          function (err2) {
            if (err2) return reject(err2);
            resolve(this.changes > 0);
          }
        );
      }
    );
  });
}

// Добавить вопросы после успешной оплаты
function addQuestionsAfterPayment(userId, amount) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET questionsLeft = questionsLeft + ? WHERE userId = ?",
      [amount, userId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
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
        resolve(this.changes > 0);
      }
    );
  });
}

// Использовать матрицу судьбы
function useFate(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET fateUsed = 1 WHERE userId = ? AND fateUsed = 0",
      [userId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

// Получить историю платежей пользователя
function getPaymentHistory(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM payments WHERE userId = ? ORDER BY created_at DESC",
      [userId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function getTotalUsers() {
  return new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (err) return reject(err);
      resolve(row.count);
    });
  });
}

module.exports = { 
  getUser, 
  useQuestion, 
  useFate, 
  updateUserEmail,
  savePayment,
  updatePaymentStatus,
  addQuestionsAfterPayment,
  getPaymentHistory,
  getTotalUsers
};