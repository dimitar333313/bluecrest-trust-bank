import 'dotenv/config'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataPath = path.join(__dirname, 'data.json')
const port = Number(process.env.PORT || 4000)
const jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')
const app = express()
const mailer = process.env.SMTP_HOST ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }) : null

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }))
app.use(express.json())
app.use(cookieParser())

function readData() {
  if (!fs.existsSync(dataPath)) return { users: [], otps: [], auditLogs: [], chatMessages: [] }
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
  return { ...data, chatMessages: data.chatMessages || [] }
}

function writeData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2))
}

async function sendMail({ to, subject, text }) {
  if (!mailer) return false
  await mailer.sendMail({ from: process.env.MAIL_FROM || 'Bluecrest Trust Bank <info@bluecresttrustbank.com>', to, subject, text })
  return true
}

function requireAdminKey(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY
  if (!adminKey || req.get('x-admin-key') !== adminKey) return res.status(401).json({ error: 'Admin authorization required' })
  next()
}

function requireCustomer(req, res, next) {
  const token = req.cookies.customer_session
  try {
    req.user = jwt.verify(token, jwtSecret)
    next()
  } catch {
    res.status(401).json({ error: 'Authentication required' })
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Bluecrest Trust Bank API' }))

app.post('/api/customers/register', async (req, res) => {
  const { name, email, username, password } = req.body
  if (!name || !email || !username || !password) return res.status(400).json({ error: 'Name, email, username, and password are required' })
  const data = readData()
  if (data.users.some((user) => user.username === username)) return res.status(409).json({ error: 'Username already exists' })
  const user = { id: crypto.randomUUID(), name, email, username, passwordHash: await bcrypt.hash(password, 12), balance: 0, status: 'Active', createdAt: new Date().toISOString() }
  data.users.push(user)
  data.auditLogs.unshift({ action: 'Customer registered', userId: user.id, at: new Date().toISOString() })
  writeData(data)
  await sendMail({ to: user.email, subject: 'Welcome to Bluecrest Trust Bank', text: `Welcome to Bluecrest Trust Bank. We are pleased to welcome you as a new customer. Your account has been successfully opened. You can now sign in to online banking to view your account information and manage your banking services.\n\nFor your security, we will never ask you to provide your password or one-time security code by email.` })
  res.status(201).json({ id: user.id, name: user.name, email: user.email, username: user.username })
})

app.post('/api/customers/login', async (req, res) => {
  const data = readData()
  const user = data.users.find((item) => item.username === req.body.username)
  if (!user || user.status !== 'Active' || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return res.status(401).json({ error: 'Invalid credentials' })
  const code = String(crypto.randomInt(100000, 1000000))
  data.otps = data.otps.filter((item) => item.userId !== user.id)
  data.otps.push({ userId: user.id, codeHash: await bcrypt.hash(code, 12), expiresAt: Date.now() + 5 * 60 * 1000 })
  data.auditLogs.unshift({ action: 'OTP requested', userId: user.id, at: new Date().toISOString() })
  writeData(data)
  const delivered = await sendMail({ to: user.email, subject: 'Your Bluecrest Trust Bank verification code', text: `Your one-time verification code is ${code}. It expires in 5 minutes. Never share this code with anyone.` })
  res.json({ requiresOtp: true, userId: user.id, delivery: user.email, delivered, developmentCode: process.env.NODE_ENV === 'production' ? undefined : code })
})

app.post('/api/customers/verify-otp', async (req, res) => {
  const data = readData()
  const user = data.users.find((item) => item.id === req.body.userId)
  const otp = data.otps.find((item) => item.userId === req.body.userId)
  const valid = Boolean(user && otp && Date.now() < otp.expiresAt && await bcrypt.compare(req.body.code || '', otp.codeHash))
  data.auditLogs.unshift({ action: valid ? 'OTP verified' : 'OTP failed', userId: req.body.userId, at: new Date().toISOString() })
  if (valid) data.otps = data.otps.filter((item) => item.userId !== user.id)
  writeData(data)
  if (!valid) return res.status(401).json({ error: 'Invalid or expired OTP' })
  res.cookie('customer_session', jwt.sign({ sub: user.id, role: 'customer' }, jwtSecret, { expiresIn: '8h' }), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  res.json({ ok: true })
})

app.get('/api/customers/me', requireCustomer, (req, res) => {
  const user = readData().users.find((item) => item.id === req.user.sub)
  if (!user || user.status !== 'Active') return res.status(403).json({ error: 'Account unavailable' })
  res.json({ id: user.id, name: user.name, email: user.email, username: user.username, balance: user.balance, status: user.status })
})

app.post('/api/customers/debit-alert', requireCustomer, async (req, res) => {
  const amount = Number(req.body.amount)
  const description = String(req.body.description || 'Demo transfer')
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'A valid debit amount is required' })
  const user = readData().users.find((item) => item.id === req.user.sub)
  if (!user || user.status !== 'Active') return res.status(403).json({ error: 'Account unavailable' })
  const delivered = await sendMail({ to: user.email, subject: 'Debit alert - Bluecrest Trust Bank', text: `A debit of $${amount.toFixed(2)} was recorded on your Bluecrest Trust Bank demo account for ${description}. Your available balance was updated in the demo dashboard.` })
  res.json({ ok: true, delivered })
})

app.post('/api/customer-chat/messages', requireCustomer, async (req, res) => {
  const message = String(req.body.message || '').trim()
  if (!message || message.length > 2000) return res.status(400).json({ error: 'Message must be between 1 and 2000 characters' })
  const data = readData()
  const user = data.users.find((item) => item.id === req.user.sub)
  if (!user || user.status !== 'Active') return res.status(403).json({ error: 'Account unavailable' })
  const record = { id: crypto.randomUUID(), userId: user.id, sender: 'customer', message, createdAt: new Date().toISOString() }
  data.chatMessages.push(record)
  data.auditLogs.unshift({ action: 'Customer support message sent', userId: user.id, at: record.createdAt })
  writeData(data)
  if (process.env.SUPPORT_EMAIL) await sendMail({ to: process.env.SUPPORT_EMAIL, subject: `Customer support message from ${user.name}`, text: `${user.name} (${user.email}) wrote:\n\n${message}` })
  res.status(201).json(record)
})

app.get('/api/customer-chat/messages', requireCustomer, (req, res) => {
  const messages = readData().chatMessages.filter((item) => item.userId === req.user.sub)
  res.json(messages)
})

app.get('/api/admin/chat-messages', requireAdminKey, (_req, res) => res.json(readData().chatMessages))

app.post('/api/admin/email', requireAdminKey, async (req, res) => {
  const to = String(req.body.to || '').trim()
  const subject = String(req.body.subject || '').trim()
  const text = String(req.body.text || '').trim()
  if (!to || !subject || !text) return res.status(400).json({ error: 'Recipient, subject, and message are required' })
  try {
    const delivered = await sendMail({ to, subject, text })
    res.json({ ok: true, delivered })
  } catch {
    res.status(502).json({ error: 'Email could not be sent' })
  }
})

const clientPath = path.join(__dirname, '..', 'dist')
app.use(express.static(clientPath))
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(clientPath, 'index.html')))

app.listen(port, () => console.log(`Bluecrest API listening on http://localhost:${port}`))
