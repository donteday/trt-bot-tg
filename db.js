// db.js (асинхронный wrapper для better-sqlite3)
const Database = require("better-sqlite3");
const db = new Database("tarot.db");

// WAL для параллельных чтений/записей
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ----------------- Вспомогательные функции -----------------

/**
 * runAsync — оборачивает синхронные операции better-sqlite3 в асинхронные через setImmediate
 */
function runAsync(fn) {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        resolve(fn());
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Добавление колонки, если не существует
function addColumnIfNotExists(table, column, type, defaultValue = null) {
  return runAsync(() => {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    const exists = rows.some(r => r.name === column);
    if (exists) return false;

    let sql = `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`;
    if (defaultValue !== null) {
      if (typeof defaultValue === "string") {
        const safe = defaultValue.replace(/'/g, "''");
        sql += ` DEFAULT '${safe}'`;
      } else {
        sql += ` DEFAULT ${defaultValue}`;
      }
    }
    db.prepare(sql).run();
    console.log(`✅ Added column ${column} to ${table}`);
    return true;
  });
}

// ----------------- Создание таблиц -----------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    userId INTEGER PRIMARY KEY,
    questionsLeft INTEGER DEFAULT 3,
    fateUsed INTEGER DEFAULT 0,
    email TEXT DEFAULT NULL,
    yookassaPaymentId TEXT DEFAULT NULL,
    paymentStatus TEXT DEFAULT 'pending',
    paymentAmount REAL DEFAULT 0,
    paymentDate DATETIME DEFAULT NULL
  );
`);

db.exec(`
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
  );
`);

// Авто-миграции
(async () => {
  await addColumnIfNotExists("users", "referral_code", "TEXT");
  await addColumnIfNotExists("users", "referrals_count", "INTEGER", 0);
  await addColumnIfNotExists("users", "response_style", "INTEGER", 1);
  await addColumnIfNotExists("users", "invited_by", "TEXT");
  await addColumnIfNotExists("users", "collected_cards", "TEXT", "[]");
  await addColumnIfNotExists("users", "completed_suits", "TEXT", "[]");
})();

// ----------------- Основные функции -----------------

function getUser(userId) {
  return runAsync(() => {
    let row = db.prepare("SELECT * FROM users WHERE userId = ?").get(userId);
    if (!row) {
      db.prepare("INSERT OR IGNORE INTO users (userId, questionsLeft, fateUsed) VALUES (?, 3, 0)").run(userId);
      row = db.prepare("SELECT * FROM users WHERE userId = ?").get(userId);
      if (!row) return { userId, questionsLeft: 3, fateUsed: 0 };
    }
    return row;
  });
}

function updateUserEmail(userId, email) {
  return runAsync(() => {
    const info = db.prepare("UPDATE users SET email = ? WHERE userId = ?").run(email, userId);
    return info.changes > 0;
  });
}

function savePayment(userId, paymentData) {
  return runAsync(() => {
    const { id, amount, status, description, email } = paymentData;

    db.prepare(`
      UPDATE users SET 
        yookassaPaymentId = ?, 
        paymentStatus = ?,
        paymentAmount = ?,
        paymentDate = datetime('now')
      WHERE userId = ?
    `).run(id, status, amount.value, userId);

    const info = db.prepare(`
      INSERT INTO payments (userId, paymentId, amount, status, description, customer_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, id, amount.value, status, description, email);

    return info.lastInsertRowid;
  });
}

function updatePaymentStatus(paymentId, status) {
  return runAsync(() => {
    const u1 = db.prepare("UPDATE users SET paymentStatus = ? WHERE yookassaPaymentId = ?").run(status, paymentId);
    const u2 = db.prepare("UPDATE payments SET status = ? WHERE paymentId = ?").run(status, paymentId);
    return (u1.changes + u2.changes) > 0;
  });
}

function addQuestionsAfterPayment(userId, amount) {
  return runAsync(() => {
    const info = db.prepare("UPDATE users SET questionsLeft = questionsLeft + ? WHERE userId = ?").run(amount, userId);
    return info.changes > 0;
  });
}

function useQuestion(userId) {
  return runAsync(() => {
    const info = db.prepare("UPDATE users SET questionsLeft = questionsLeft - 1 WHERE userId = ? AND questionsLeft > 0").run(userId);
    return info.changes > 0;
  });
}

function useFate(userId) {
  return runAsync(() => {
    const info = db.prepare("UPDATE users SET fateUsed = 1 WHERE userId = ? AND fateUsed = 0").run(userId);
    return info.changes > 0;
  });
}

function getPaymentHistory(userId) {
  return runAsync(() => db.prepare("SELECT * FROM payments WHERE userId = ? ORDER BY created_at DESC").all(userId));
}

function getTotalUsers() {
  return runAsync(() => {
    const row = db.prepare("SELECT COUNT(*) as count FROM users").get();
    return row.count;
  });
}

// ----------------- Реферальные функции -----------------
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getOrCreateReferralCode(userId) {
  return runAsync(() => {
    const row = db.prepare("SELECT referral_code FROM users WHERE userId = ?").get(userId);
    if (row && row.referral_code) return row.referral_code;

    const newCode = generateReferralCode();
    db.prepare("UPDATE users SET referral_code = ? WHERE userId = ?").run(newCode, userId);
    return newCode;
  });
}

function rewardReferrer(referralCode) {
  return runAsync(() => {
    if (!referralCode) return false;
    const row = db.prepare("SELECT userId FROM users WHERE referral_code = ?").get(referralCode);
    if (!row) return false;
    db.prepare("UPDATE users SET questionsLeft = questionsLeft + 3, referrals_count = referrals_count + 1 WHERE userId = ?").run(row.userId);
    return row.userId;
  });
}

function setInvitedBy(userId, referralCode) {
  return runAsync(() => {
    const info = db.prepare("UPDATE users SET invited_by = ? WHERE userId = ?").run(referralCode, userId);
    return info.changes > 0;
  });
}

function getUserByReferralCode(referralCode) {
  return runAsync(() => {
    const row = db.prepare("SELECT * FROM users WHERE referral_code = ?").get(referralCode);
    return row || null;
  });
}

// ----------------- Коллекции карт и бонусы -----------------
function getUserData(userId) {
  return runAsync(() => db.prepare("SELECT * FROM users WHERE userId = ?").get(userId));
}

function updateUserWithBonus(userId, bonus, collectedCards, completedSuits) {
  return runAsync(() => {
    db.prepare(`
      UPDATE users 
      SET questionsLeft = questionsLeft + ?, collected_cards = ?, completed_suits = ? 
      WHERE userId = ?
    `).run(bonus, collectedCards, completedSuits, userId);
    return true;
  });
}

function updateUserCards(userId, collectedCards) {
  return runAsync(() => {
    db.prepare("UPDATE users SET collected_cards = ? WHERE userId = ?").run(collectedCards, userId);
    return true;
  });
}

// ----------------- Стиль ответов -----------------
function setUserResponseStyle(userId, styleId) {
  return runAsync(() => {
    const info = db.prepare("UPDATE users SET response_style = ? WHERE userId = ?").run(styleId, userId);
    if (info.changes === 0) {
      db.prepare("INSERT OR IGNORE INTO users (userId, response_style) VALUES (?, ?)").run(userId, styleId);
    }
    return true;
  });
}

function getUserResponseStyle(userId) {
  return runAsync(() => {
    const row = db.prepare("SELECT response_style FROM users WHERE userId = ?").get(userId);
    return row ? row.response_style : 1;
  });
}

// ----------------- Экспорт -----------------
module.exports = {
  addColumnIfNotExists,

  getUser,
  useQuestion,
  useFate,
  updateUserEmail,
  savePayment,
  updatePaymentStatus,
  addQuestionsAfterPayment,
  getPaymentHistory,
  getTotalUsers,
  getOrCreateReferralCode,
  generateReferralCode,
  rewardReferrer,
  setInvitedBy,
  getUserByReferralCode,

  getUserData,
  updateUserWithBonus,
  updateUserCards,

  setUserResponseStyle,
  getUserResponseStyle
};
