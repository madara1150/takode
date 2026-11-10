// A throwaway account server for trying the login screen on this computer.
// It keeps everything in memory (gone when it stops) and follows the API in
// src/shared/auth.ts, so your real server can be built against the same contract.
// Run: npm run mock-server   then use http://localhost:8787 as the server in Takode.
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

const port = Number(process.env.PORT || 8787)
const users = new Map() // email -> { id, name, email, salt, hash }
const sessions = new Map() // token -> email
const redeemed = new Map() // email -> Set of codes
const progress = new Map() // email -> { stats, unlocks, redeemed, updatedAt }
// Sample coupons. A real server would keep these in its database, with limits and expiry dates.
const COUPONS = {
  WELCOME500: { xp: 500_000, message: 'Welcome to Takode!' },
  RGBPARTY: { unlocks: ['ring:rgb', 'effect:rgbFrame', 'accent:rgb'], message: 'RGB unlocked early 🎉' },
  DEEPSEA: { xp: 2_000_000, unlocks: ['theme:abyss'] }
}

const hash = (password, salt) => scryptSync(password, salt, 32)
const account = (u) => ({ id: u.id, name: u.name, email: u.email })
const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}
const readBody = (req) =>
  new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'))
      } catch {
        resolve({})
      }
    })
  })
const signIn = (u) => {
  const token = randomBytes(32).toString('hex')
  sessions.set(token, u.email)
  return { token, account: account(u) }
}
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '')

createServer(async (req, res) => {
  const email = (s) => String(s || '').trim().toLowerCase()
  if (req.method === 'POST' && req.url === '/auth/register') {
    const b = await readBody(req)
    if (!b.name || !email(b.email) || String(b.password || '').length < 8) return send(res, 400, { error: 'Name, email and an 8+ character password are needed.' })
    if (users.has(email(b.email))) return send(res, 409, { error: 'Email already registered' })
    const salt = randomBytes(16)
    const u = { id: randomUUID(), name: String(b.name).trim(), email: email(b.email), salt, hash: hash(String(b.password), salt) }
    users.set(u.email, u)
    return send(res, 201, signIn(u))
  }
  if (req.method === 'POST' && req.url === '/auth/login') {
    const b = await readBody(req)
    const u = users.get(email(b.email))
    if (!u || !timingSafeEqual(u.hash, hash(String(b.password || ''), u.salt))) return send(res, 401, { error: 'Wrong email or password' })
    return send(res, 200, signIn(u))
  }
  if (req.method === 'GET' && req.url === '/auth/me') {
    const u = users.get(sessions.get(bearer(req)))
    return u ? send(res, 200, { account: account(u) }) : send(res, 401, { error: 'Signed out' })
  }
  if (req.method === 'POST' && req.url === '/redeem') {
    const u = users.get(sessions.get(bearer(req)))
    if (!u) return send(res, 401, { error: 'Signed out' })
    const code = String((await readBody(req)).code || '')
    const coupon = COUPONS[code]
    if (!coupon) return send(res, 404, { error: 'Unknown code' })
    const used = (redeemed.get(u.email) ?? new Set())
    if (used.has(code)) return send(res, 409, { error: 'Already used' })
    used.add(code)
    redeemed.set(u.email, used)
    return send(res, 200, coupon)
  }
  if (req.url === '/me/progress' && (req.method === 'GET' || req.method === 'PUT')) {
    const u = users.get(sessions.get(bearer(req)))
    if (!u) return send(res, 401, { error: 'Signed out' })
    if (process.env.NO_PROGRESS) return send(res, 404, { error: 'Not supported' })
    if (req.method === 'GET') return send(res, 200, progress.get(u.email) ?? { stats: null, unlocks: [], redeemed: [], updatedAt: 0 })
    // A real server should not trust the XP a client sends without checks (rate limits, history…).
    progress.set(u.email, await readBody(req))
    return send(res, 204)
  }
  if (req.method === 'POST' && req.url === '/auth/logout') {
    sessions.delete(bearer(req))
    return send(res, 204)
  }
  send(res, 404, { error: 'Not found' })
}).listen(port, '127.0.0.1', () => console.log(`Mock account server on http://localhost:${port} (data is kept in memory only)`))
