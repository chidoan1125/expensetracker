const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const { initStorage } = require('./storage')
const { hashPassword, checkPassword, createToken, verifyToken } = require('./auth')

const DB_FILE = path.join(__dirname, 'expenses.db')
const BACKUP_FILE = path.join(__dirname, 'expenses-backup.json')

const app = express()
app.use(cors())
app.use(bodyParser.json())
app.use(express.static(path.join(__dirname)))

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.split(' ')[1]
  try {
    const payload = verifyToken(token)
    req.user = payload
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

initStorage(DB_FILE, BACKUP_FILE)
  .then((storage) => {
    app.post('/api/register', async (req, res) => {
      const { email, password } = req.body
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' })
      }
      const existing = await new Promise((resolve, reject) => {
        storage.getUserByEmail(email, (err, user) => err ? reject(err) : resolve(user))
      })
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' })
      }
      const password_hash = await hashPassword(password)
      const user = { id: uuidv4(), email, password_hash, created_at: new Date().toISOString() }
      storage.saveUser(user, (err) => {
        if (err) return res.status(500).json({ error: err.message })
        const token = createToken(user)
        res.json({ token, user: { id: user.id, email: user.email } })
      })
    })

    app.post('/api/login', async (req, res) => {
      const { email, password } = req.body
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' })
      }
      const user = await new Promise((resolve, reject) => {
        storage.getUserByEmail(email, (err, user) => err ? reject(err) : resolve(user))
      })
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }
      const valid = await checkPassword(password, user.password_hash)
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }
      const token = createToken(user)
      res.json({ token, user: { id: user.id, email: user.email } })
    })

    app.get('/api/expenses', authMiddleware, (req, res) => {
      storage.getAll(req.user.userId, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message })
        res.json(rows)
      })
    })

    app.post('/api/expenses', authMiddleware, (req, res) => {
      const { id, date, desc, category, amount } = req.body
      const _id = id || uuidv4()
      const created_at = new Date().toISOString()
      const expense = { id: _id, user_id: req.user.userId, date, desc, category, amount, created_at }
      storage.saveExpense(expense, (err) => {
        if (err) return res.status(500).json({ error: err.message })
        res.json(expense)
      })
    })

    app.delete('/api/expenses/:id', authMiddleware, (req, res) => {
      storage.deleteExpense(req.params.id, req.user.userId, (err, result) => {
        if (err) return res.status(500).json({ error: err.message })
        res.json(result)
      })
    })

    app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
      storage.getAllUsers((err, users) => {
        if (err) return res.status(500).json({ error: err.message })
        res.json(users)
      })
    })

    app.get('/api/admin/expenses', authMiddleware, adminMiddleware, (req, res) => {
      storage.getAllExpenses((err, expenses) => {
        if (err) return res.status(500).json({ error: err.message })
        res.json(expenses)
      })
    })

    app.post('/api/admin/users/:id/admin', authMiddleware, adminMiddleware, (req, res) => {
      const { isAdmin } = req.body
      storage.setUserAdmin(req.params.id, isAdmin, (err) => {
        if (err) return res.status(500).json({ error: err.message })
        res.json({ success: true })
      })
    })

    app.delete('/api/admin/expenses/:id', authMiddleware, adminMiddleware, (req, res) => {
      storage.deleteExpenseAdmin(req.params.id, (err, result) => {
        if (err) return res.status(500).json({ error: err.message })
        res.json(result)
      })
    })

    app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
      if (req.params.id === req.user.userId) {
        return res.status(400).json({ error: 'Cannot delete yourself' })
      }
      const stmt = storage.db.prepare('DELETE FROM users WHERE id = ?')
      stmt.run(req.params.id, function (err) {
        stmt.finalize()
        if (err) return res.status(500).json({ error: err.message })
        res.json({ deleted: this.changes })
      })
    })

    const PORT = process.env.PORT || 3000
    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`))
  })
  .catch((err) => {
    console.error('Failed to initialize storage:', err)
    process.exit(1)
  })
