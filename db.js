// db.js (better-sqlite3 версия, CommonJS)
const Database = require("better-sqlite3");
const db = new Database("tarot.db");

// Режим WAL — ускоряет параллельные записи
try {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
} catch (e) {
  console.warn("Не удалось установить pragma:", e);
}

/**
 * addColumnIfNotExists(table, column, type, defaultValue = null)
 * Возвращает Promise<boolean> — true если добавлена колонка, false если уже есть.
 */
function addColumnIfNotExists(table, column, type, defaultValue = null) {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.prepare(`PRAGMA table_info(${table})`).all();
      const exists = rows.some(r => r.name === column);
      if (exists) return resolve(false);

      let sql = `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`;
      if (defaultValue !== null) {
        // корректно экранируем строковые default'ы
        if (typeof defaultValue === "string") {
          const safe = defaultValue.replace(/'/g, "''");
          sql += ` DEFAULT '${safe}'`;
        } else {
          sql += ` DEFAULT ${defaultValue}`;
        }
      }
      db.prepare(sql).run();
      console.log(`✅ Added column ${column} to ${table}`);
      resolve(true);
    } catch (err) {
      reject(err);
    }
  });
}

// --- Создание таблиц (если нет) ---
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

// Авто-миграции — запускаем и логируем (используем Promise API)
(async () => {
  try {
    await addColumnIfNotExists("users", "referral_code", "TEXT");
    await addColumnIfNotExists("users", "referrals_count", "INTEGER", 0);
    await addColumnIfNotExists("users", "response_style", "INTEGER", 1);
    await addColumnIfNotExists("users", "invited_by", "TEXT");
    await addColumnIfNotExists("users", "collected_cards", "TEXT", "[]");
    await addColumnIfNotExists("users", "completed_suits", "TEXT", "[]");
  } catch (e) {
    console.error("Migration error:", e);
  }
})();

// ------------------ Функции (с теми же именами и сигнатурами) ------------------

// Получить данные пользователя (Promise)
function getUser(userId) {
  return new Promise((resolve, reject) => {
    try {
      let row = db.prepare("SELECT * FROM users WHERE userId = ?").get(userId);
      if (!row) {
        // Вставляем и читаем снова
        db.prepare("INSERT OR IGNORE INTO users (userId, questionsLeft, fateUsed) VALUES (?, 3, 0)").run(userId);
        row = db.prepare("SELECT * FROM users WHERE userId = ?").get(userId);
        if (!row) {
          // Не удалось прочитать — возвращаем дефолт объект (как раньше)
          return resolve({ userId, questionsLeft: 3, fateUsed: 0 });
        }
      }
      resolve(row);
    } catch (err) {
      reject(err);
    }
  });
}

// Обновить email пользователя (Promise<boolean>)
function updateUserEmail(userId, email) {
  return new Promise((resolve, reject) => {
    try {
      const info = db.prepare("UPDATE users SET email = ? WHERE userId = ?").run(email, userId);
      resolve(info.changes > 0);
    } catch (err) {
      reject(err);
    }
  });
}

// Сохранить информацию о платеже (Promise<lastInsertId>)
function savePayment(userId, paymentData) {
  return new Promise((resolve, reject) => {
    try {
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

      resolve(info.lastInsertRowid);
    } catch (err) {
      reject(err);
    }
  });
}

// Обновить статус платежа (Promise<boolean>)
function updatePaymentStatus(paymentId, status) {
  return new Promise((resolve, reject) => {
    try {
      const u1 = db.prepare("UPDATE users SET paymentStatus = ? WHERE yookassaPaymentId = ?").run(status, paymentId);
      const u2 = db.prepare("UPDATE payments SET status = ? WHERE paymentId = ?").run(status, paymentId);
      resolve((u1.changes + u2.changes) > 0);
    } catch (err) {
      reject(err);
    }
  });
}

// Добавить вопросы после успешной оплаты (Promise<boolean>)
function addQuestionsAfterPayment(userId, amount) {
  return new Promise((resolve, reject) => {
    try {
      const info = db.prepare("UPDATE users SET questionsLeft = questionsLeft + ? WHERE userId = ?").run(amount, userId);
      resolve(info.changes > 0);
    } catch (err) {
      reject(err);
    }
  });
}

// Списать 1 вопрос (Promise<boolean>)
function useQuestion(userId) {
  return new Promise((resolve, reject) => {
    try {
      const info = db.prepare("UPDATE users SET questionsLeft = questionsLeft - 1 WHERE userId = ? AND questionsLeft > 0").run(userId);
      resolve(info.changes > 0);
    } catch (err) {
      reject(err);
    }
  });
}

// Использовать матрицу судьбы (Promise<boolean>)
function useFate(userId) {
  return new Promise((resolve, reject) => {
    try {
      const info = db.prepare("UPDATE users SET fateUsed = 1 WHERE userId = ? AND fateUsed = 0").run(userId);
      resolve(info.changes > 0);
    } catch (err) {
      reject(err);
    }
  });
}

// Получить историю платежей пользователя (Promise<array>)
function getPaymentHistory(userId) {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.prepare("SELECT * FROM payments WHERE userId = ? ORDER BY created_at DESC").all(userId);
      resolve(rows);
    } catch (err) {
      reject(err);
    }
  });
}

// Получить общее количество пользователей (Promise<number>)
function getTotalUsers() {
  return new Promise((resolve, reject) => {
    try {
      const row = db.prepare("SELECT COUNT(*) as count FROM users").get();
      resolve(row.count);
    } catch (err) {
      reject(err);
    }
  });
}

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Получить или создать реферальный код (Promise<string>)
function getOrCreateReferralCode(userId) {
  return new Promise((resolve, reject) => {
    try {
      const row = db.prepare("SELECT referral_code FROM users WHERE userId = ?").get(userId);
      if (row && row.referral_code) return resolve(row.referral_code);

      const newCode = generateReferralCode();
      db.prepare("UPDATE users SET referral_code = ? WHERE userId = ?").run(newCode, userId);
      resolve(newCode);
    } catch (err) {
      reject(err);
    }
  });
}

// Поощрение рефереру (Promise<referrerId|false>)
function rewardReferrer(referralCode) {
  return new Promise((resolve, reject) => {
    try {
      if (!referralCode) return resolve(false);
      const row = db.prepare("SELECT userId FROM users WHERE referral_code = ?").get(referralCode);
      if (!row) return resolve(false);
      db.prepare("UPDATE users SET questionsLeft = questionsLeft + 3, referrals_count = referrals_count + 1 WHERE userId = ?").run(row.userId);
      resolve(row.userId);
    } catch (err) {
      reject(err);
    }
  });
}

// Сохраняем кто пригласил нового пользователя (Promise<boolean>)
function setInvitedBy(userId, referralCode) {
  return new Promise((resolve, reject) => {
    try {
      const info = db.prepare("UPDATE users SET invited_by = ? WHERE userId = ?").run(referralCode, userId);
      resolve(info.changes > 0);
    } catch (err) {
      reject(err);
    }
  });
}

// Получить пользователя по реф-коду (Promise<row|null>)
function getUserByReferralCode(referralCode) {
  return new Promise((resolve, reject) => {
    try {
      const row = db.prepare("SELECT * FROM users WHERE referral_code = ?").get(referralCode);
      resolve(row || null);
    } catch (err) {
      reject(err);
    }
  });
}

// --- Коллекции карт и бонусы ---
// getUserData(callback-style) — оставил callback для совместимости
const getUserData = (userId, callback) => {
  try {
    const row = db.prepare("SELECT * FROM users WHERE userId = ?").get(userId);
    callback(null, row);
  } catch (err) {
    callback(err);
  }
};

// updateUserWithBonus (callback-style) — как у тебя было
const updateUserWithBonus = (userId, bonus, collectedCards, completedSuits, callback) => {
  try {
    db.prepare(`
      UPDATE users 
      SET questionsLeft = questionsLeft + ?, collected_cards = ?, completed_suits = ? 
      WHERE userId = ?
    `).run(bonus, collectedCards, completedSuits, userId);
    callback(null);
  } catch (err) {
    callback(err);
  }
};

// updateUserCards (callback-style)
const updateUserCards = (userId, collectedCards, callback) => {
  try {
    db.prepare("UPDATE users SET collected_cards = ? WHERE userId = ?").run(collectedCards, userId);
    callback(null);
  } catch (err) {
    callback(err);
  }
};

// --- Стиль ответов ---
// Сохраняем так, чтобы не удалять остальные поля пользователя
async function setUserResponseStyle(userId, styleId) {
  return new Promise((resolve) => {
    try {
      const info = db.prepare("UPDATE users SET response_style = ? WHERE userId = ?").run(styleId, userId);
      if (info.changes === 0) {
        // Запись не обновлена — вставим (только userId и response_style)
        db.prepare("INSERT OR IGNORE INTO users (userId, response_style) VALUES (?, ?)").run(userId, styleId);
      }
      resolve(true);
    } catch (err) {
      console.error("Error setting response style:", err);
      resolve(false);
    }
  });
}

async function getUserResponseStyle(userId) {
  return new Promise((resolve) => {
    try {
      const row = db.prepare("SELECT response_style FROM users WHERE userId = ?").get(userId);
      resolve(row ? row.response_style : 1);
    } catch (err) {
      console.error("Error getting response style:", err);
      resolve(1);
    }
  });
}

// ------------------ Экспортируем все функции ------------------
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

  // Коллекции (callback-style)
  getUserData,
  updateUserWithBonus,
  updateUserCards,

  // Стиль ответов
  setUserResponseStyle,
  getUserResponseStyle
};
