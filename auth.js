const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'expense-secret-key'
const TOKEN_EXPIRY = '7d'

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

async function checkPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

function createToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, isAdmin: !!user.is_admin }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY })
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

module.exports = { hashPassword, checkPassword, createToken, verifyToken }
