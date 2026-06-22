const fs = require('fs').promises
const path = require('path')
const sqlite3 = require('sqlite3').verbose()

async function ensureDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

async function readBackup(backupFile) {
  try {
    const raw = await fs.readFile(backupFile, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    return []
  }
}

async function writeBackup(backupFile, rows) {
  const tempFile = `${backupFile}.tmp`
  await fs.writeFile(tempFile, JSON.stringify(rows, null, 2), 'utf8')
  await fs.rename(tempFile, backupFile)
}

function openDatabase(dbFile) {
  return new sqlite3.Database(dbFile)
}

function createTables(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE,
          password_hash TEXT,
          is_admin INTEGER DEFAULT 0,
          created_at TEXT
        )`,
        (err) => {
          if (err) return reject(err)
          db.run(
            `CREATE TABLE IF NOT EXISTS expenses (
              id TEXT PRIMARY KEY,
              user_id TEXT,
              date TEXT,
              desc TEXT,
              category TEXT,
              amount REAL,
              created_at TEXT,
              FOREIGN KEY(user_id) REFERENCES users(id)
            )`,
            (err2) => (err2 ? reject(err2) : resolve())
          )
        }
      )
    })
  })
}

function allRows(db, userId = null) {
  return new Promise((resolve, reject) => {
    const sql = userId
      ? 'SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, created_at DESC'
      : 'SELECT * FROM expenses ORDER BY date DESC, created_at DESC'
    const params = userId ? [userId] : []
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err)
      resolve(rows)
    })
  })
}

async function initStorage(dbFile, backupFile) {
  await ensureDirectory(dbFile)
  await ensureDirectory(backupFile)

  const db = openDatabase(dbFile)
  await createTables(db)

  const rows = await allRows(db, '')
  const backupRows = await readBackup(backupFile)

  if (rows.length === 0 && backupRows.length > 0) {
    const stmt = db.prepare('INSERT OR REPLACE INTO expenses (id, user_id, date, desc, category, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const item of backupRows) {
      stmt.run(item.id, item.user_id, item.date, item.desc, item.category, item.amount, item.created_at)
    }
    stmt.finalize()
    await writeBackup(backupFile, backupRows)
  } else if (backupRows.length === 0 && rows.length > 0) {
    await writeBackup(backupFile, rows)
  } else {
    await writeBackup(backupFile, rows.length ? rows : backupRows)
  }

  return {
    db,
    backupFile,
    getAll(userId, callback) {
      db.all('SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, created_at DESC', [userId], callback)
    },
    saveExpense(expense, callback) {
      const stmt = db.prepare('INSERT OR REPLACE INTO expenses (id, user_id, date, desc, category, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      stmt.run(expense.id, expense.user_id, expense.date, expense.desc, expense.category, expense.amount, expense.created_at, async (err) => {
        stmt.finalize()
        if (err) return callback(err)
        try {
          const rows = await allRows(db, expense.user_id)
          await writeBackup(backupFile, rows)
          callback(null, expense)
        } catch (writeErr) {
          callback(writeErr)
        }
      })
    },
    deleteExpense(id, userId, callback) {
      db.run('DELETE FROM expenses WHERE id = ? AND user_id = ?', [id, userId], async function (err) {
        if (err) return callback(err)
        try {
          const rows = await allRows(db, userId)
          await writeBackup(backupFile, rows)
          callback(null, { deleted: this.changes })
        } catch (writeErr) {
          callback(writeErr)
        }
      })
    },
    getUserByEmail(email, callback) {
      db.get('SELECT * FROM users WHERE email = ?', [email], callback)
    },
    saveUser(user, callback) {
      const stmt = db.prepare('INSERT INTO users (id, email, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)')
      stmt.run(user.id, user.email, user.password_hash, user.is_admin || 0, user.created_at, (err) => {
        stmt.finalize()
        callback(err, user)
      })
    },
    getAllUsers(callback) {
      db.all('SELECT id, email, is_admin, created_at FROM users ORDER BY created_at DESC', callback)
    },
    getAllExpenses(callback) {
      db.all('SELECT * FROM expenses ORDER BY date DESC, created_at DESC', callback)
    },
    setUserAdmin(userId, isAdmin, callback) {
      const stmt = db.prepare('UPDATE users SET is_admin = ? WHERE id = ?')
      stmt.run(isAdmin ? 1 : 0, userId, function (err) {
        stmt.finalize()
        callback(err)
      })
    },
    deleteExpenseAdmin(id, callback) {
      db.run('DELETE FROM expenses WHERE id = ?', [id], async function (err) {
        if (err) return callback(err)
        try {
          const rows = await allRows(db)
          await writeBackup(backupFile, rows)
          callback(null, { deleted: this.changes })
        } catch (writeErr) {
          callback(writeErr)
        }
      })
    }
  }
}

module.exports = { initStorage }
