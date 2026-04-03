/**
 * GitHub OAuth authentication.
 * Handles OAuth flow, JWT session tokens, and user management.
 */

import { Request, Response, NextFunction, Router } from 'express'
import https from 'https'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import type { CookieOptions } from 'express'
import fs from 'fs'
import path from 'path'

// ============================================================================
// Configuration
// ============================================================================

const GITHUB_CLIENT_ID = () => process.env.GITHUB_CLIENT_ID || ''
const GITHUB_CLIENT_SECRET = () => process.env.GITHUB_CLIENT_SECRET || ''
const JWT_SECRET = () => process.env.JWT_SECRET || getOrCreateJwtSecret()
const SESSION_DURATION = '7d'
const COOKIE_NAME = 'clawmax_session'
const STATE_COOKIE_NAME = 'oauth_state'
const RETURN_TO_COOKIE_NAME = 'oauth_return_to'

let _jwtSecret: string | null = null

function getOrCreateJwtSecret(): string {
  if (_jwtSecret) return _jwtSecret
  // Generate a stable secret from the dashboard token if available
  const fs = require('fs')
  const path = require('path')
  const tokenFile = path.join(__dirname, '..', '.dashboard-token')
  try {
    const token = fs.readFileSync(tokenFile, 'utf-8').trim()
    _jwtSecret = crypto.createHash('sha256').update(token + '_jwt').digest('hex')
  } catch {
    _jwtSecret = crypto.randomBytes(32).toString('hex')
  }
  return _jwtSecret
}

// ============================================================================
// Types
// ============================================================================

export interface GitHubUser {
  id: number
  login: string
  name: string | null
  avatar_url: string
  email: string | null
}

interface SessionPayload {
  userId: string
  login: string
  name: string | null
  avatar: string
  email?: string | null
  authType?: 'github' | 'otp'
}

// ============================================================================
// Allowed users (workspace owner)
// ============================================================================

/** Get the list of allowed GitHub logins. If empty, any GitHub user is allowed. */
function getAllowedLogins(): string[] {
  const raw = process.env.GITHUB_ALLOWED_USERS || ''
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
}

// ============================================================================
// HTTPS helpers
// ============================================================================

function httpsPost(hostname: string, path: string, body: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'ClawMax-Dashboard',
        ...headers,
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function httpsGet(hostname: string, path: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ClawMax-Dashboard',
        ...headers,
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.end()
  })
}

// ============================================================================
// OAuth flow
// ============================================================================

async function exchangeCodeForToken(code: string): Promise<string> {
  const body = JSON.stringify({
    client_id: GITHUB_CLIENT_ID(),
    client_secret: GITHUB_CLIENT_SECRET(),
    code,
  })
  const result = await httpsPost('github.com', '/login/oauth/access_token', body, {})
  const parsed = JSON.parse(result)
  if (parsed.error) {
    throw new Error(`GitHub OAuth error: ${parsed.error_description || parsed.error}`)
  }
  return parsed.access_token
}

async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const result = await httpsGet('api.github.com', '/user', {
    'Authorization': `Bearer ${accessToken}`,
  })
  return JSON.parse(result)
}

function createSessionToken(user: GitHubUser): string {
  const payload: SessionPayload = {
    userId: String(user.id),
    login: user.login,
    name: user.name,
    avatar: user.avatar_url,
    email: user.email,
    authType: 'github',
  }
  return jwt.sign(payload, JWT_SECRET(), { expiresIn: SESSION_DURATION })
}

type OtpRecord = {
  email: string
  codeHash: string
  expiresAt: number
  createdAt: number
  consumedAt?: number
  attemptCount: number
  requestIp?: string
}

type OtpStore = {
  version: 1
  records: OtpRecord[]
}

const OTP_STORE_PATH = path.join(__dirname, '..', 'data', 'auth', 'otp-store.json')
const OTP_REQUEST_WINDOW_MS = 60 * 1000
const OTP_EXPIRY_MS = parseInt(process.env.OTP_EXPIRY_MINUTES || '15', 10) * 60 * 1000
const OTP_MAX_ATTEMPTS = 5

function getOtpAllowedEmails(): string[] {
  return (process.env.OTP_ALLOWED_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

function isOtpConfigured(): boolean {
  return getOtpAllowedEmails().length > 0 && (!!process.env.RESEND_API_KEY || process.env.OTP_DEV_MODE === 'log')
}

function authMode(): string {
  return (process.env.DASHBOARD_AUTH_MODE || '').trim().toLowerCase()
}

function isBypassAuth(): boolean {
  return process.env.BYPASS_OAUTH === 'true'
    || process.env.DASHBOARD_AUTH_DISABLED === 'true'
    || authMode() === 'bypass'
}

function allowGitHubAuth(): boolean {
  const mode = authMode()
  if (mode === 'email_otp') return false
  return isGitHubAuthConfigured()
}

function allowOtpAuth(): boolean {
  const mode = authMode()
  if (mode === 'github_oauth') return false
  return isOtpConfigured()
}

function ensureOtpStore(): void {
  fs.mkdirSync(path.dirname(OTP_STORE_PATH), { recursive: true })
  if (!fs.existsSync(OTP_STORE_PATH)) {
    const initial: OtpStore = { version: 1, records: [] }
    fs.writeFileSync(OTP_STORE_PATH, JSON.stringify(initial, null, 2), 'utf-8')
  }
}

function loadOtpStore(): OtpStore {
  ensureOtpStore()
  try {
    const parsed = JSON.parse(fs.readFileSync(OTP_STORE_PATH, 'utf-8'))
    if (parsed?.version === 1 && Array.isArray(parsed.records)) {
      return parsed
    }
  } catch {}
  return { version: 1, records: [] }
}

function saveOtpStore(store: OtpStore): void {
  ensureOtpStore()
  fs.writeFileSync(OTP_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8')
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function hashOtp(email: string, code: string): string {
  return crypto
    .createHash('sha256')
    .update(`${JWT_SECRET()}:${normalizeEmail(email)}:${code}`)
    .digest('hex')
}

function createOtpCode(): string {
  const value = crypto.randomInt(0, 1000000)
  return String(value).padStart(6, '0')
}

function createOtpSessionToken(email: string, rememberDevice: boolean): string {
  const payload: SessionPayload = {
    userId: `otp:${email}`,
    login: email,
    name: email,
    avatar: '',
    email,
    authType: 'otp',
  }
  return jwt.sign(payload, JWT_SECRET(), { expiresIn: rememberDevice ? '30d' : '1d' })
}

async function sendOtpEmail(email: string, code: string): Promise<void> {
  if (process.env.OTP_DEV_MODE === 'log') {
    console.log(`[Auth][OTP] Code for ${email}: ${code}`)
    return
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  const from = process.env.OTP_FROM_EMAIL || 'max@clawmax.ai'
  const body = JSON.stringify({
    from,
    to: [email],
    subject: process.env.OTP_EMAIL_SUBJECT || 'Your ClawMax login code',
    text: `Your ClawMax login code is ${code}. It expires in ${Math.round(OTP_EXPIRY_MS / 60000)} minutes.\n\nIf you did not request this code, you can ignore this email.`,
  })

  const result = await httpsPost('api.resend.com', '/emails', body, {
    'Authorization': `Bearer ${apiKey}`,
  })

  const parsed = JSON.parse(result)
  if (parsed?.error) {
    throw new Error(parsed.error.message || 'Failed to send OTP email')
  }
}

function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET()) as SessionPayload
  } catch {
    return null
  }
}

function isSecureRequest(req: Request): boolean {
  if (process.env.NODE_ENV === 'production') return true
  const forwardedProto = req.headers['x-forwarded-proto']
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',')[0].trim() === 'https'
  }
  return req.secure
}

function getStateCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    maxAge: 10 * 60 * 1000,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/api/auth',
  }
}

function getSessionCookieOptions(req: Request, maxAgeMs = 7 * 24 * 60 * 60 * 1000): CookieOptions {
  return {
    httpOnly: true,
    maxAge: maxAgeMs,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
  }
}

function getReturnToCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    maxAge: 10 * 60 * 1000,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/api/auth',
  }
}

// ============================================================================
// Router
// ============================================================================

export function createAuthRouter(): Router {
  const router = Router()

  // GET /api/auth/github — redirect to GitHub OAuth
  router.get('/github', (_req, res) => {
    if (!allowGitHubAuth()) {
      return res.status(404).json({ error: 'GitHub OAuth is not enabled' })
    }
    const clientId = GITHUB_CLIENT_ID()
    if (!clientId) {
      return res.status(500).json({ error: 'GitHub OAuth not configured. Set GITHUB_CLIENT_ID in .env' })
    }

    const state = crypto.randomBytes(16).toString('hex')
    const redirectUri = `${getBaseUrl(_req)}/api/auth/github/callback`
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user%20user:email&state=${state}`
    const returnTo = normalizeReturnTo((_req.query.return_to as string | undefined) || '', _req)

    // Store state in cookie for CSRF validation
    res.cookie(STATE_COOKIE_NAME, state, getStateCookieOptions(_req))
    res.cookie(RETURN_TO_COOKIE_NAME, returnTo, getReturnToCookieOptions(_req))

    res.redirect(url)
  })

  // GET /api/auth/github/callback — handle OAuth callback
  router.get('/github/callback', async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string }
    const savedState = req.cookies?.[STATE_COOKIE_NAME]
    const savedReturnTo = req.cookies?.[RETURN_TO_COOKIE_NAME]

    const clearStateCookie = () => {
      res.clearCookie(STATE_COOKIE_NAME, getStateCookieOptions(req))
      res.clearCookie(RETURN_TO_COOKIE_NAME, getReturnToCookieOptions(req))
    }

    if (!code) {
      clearStateCookie()
      return res.redirect(`${getAppUrl(req, savedReturnTo)}/?auth_error=no_code`)
    }

    if (!state || !savedState || state !== savedState) {
      clearStateCookie()
      return res.redirect(`${getAppUrl(req, savedReturnTo)}/?auth_error=state_mismatch`)
    }

    try {
      const accessToken = await exchangeCodeForToken(code)
      const user = await getGitHubUser(accessToken)

      // Check if user is allowed
      const allowed = getAllowedLogins()
      if (allowed.length > 0 && !allowed.includes(user.login.toLowerCase())) {
        return res.redirect(`${getAppUrl(req, savedReturnTo)}/?auth_error=not_allowed&login=${encodeURIComponent(user.login)}`)
      }

      // Create session
      const sessionToken = createSessionToken(user)

      // Set session cookie
      res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(req))

      // Clear OAuth state cookie
      clearStateCookie()

      console.log(`[Auth] GitHub login: ${user.login} (${user.name || 'no name'})`)

      // Redirect to dashboard
      res.redirect(`${getAppUrl(req, savedReturnTo)}/`)
    } catch (err: any) {
      clearStateCookie()
      console.error('[Auth] GitHub OAuth error:', err.message)
      res.redirect(`${getAppUrl(req, savedReturnTo)}/?auth_error=${encodeURIComponent(err.message)}`)
    }
  })

  // POST /api/auth/otp/request — request an email login code
  router.post('/otp/request', async (req, res) => {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email : ''
    const email = normalizeEmail(rawEmail)
    const generic = { ok: true, message: 'If this email is allowed, a code has been sent.' }

    if (!allowOtpAuth() || !email) {
      return res.json(generic)
    }

    const allowed = getOtpAllowedEmails()
    if (!allowed.includes(email)) {
      return res.json(generic)
    }

    const now = Date.now()
    const store = loadOtpStore()
    const recent = store.records.find((record) => record.email === email && now - record.createdAt < OTP_REQUEST_WINDOW_MS)
    if (recent) {
      return res.json(generic)
    }

    const code = createOtpCode()
    const nextRecords = store.records
      .filter((record) => !(record.email === email && !record.consumedAt))
      .filter((record) => record.expiresAt > now || !!record.consumedAt)

    nextRecords.push({
      email,
      codeHash: hashOtp(email, code),
      expiresAt: now + OTP_EXPIRY_MS,
      createdAt: now,
      attemptCount: 0,
      requestIp: req.ip,
    })
    saveOtpStore({ version: 1, records: nextRecords })

    try {
      await sendOtpEmail(email, code)
    } catch (err: any) {
      console.error('[Auth][OTP] Failed to send OTP:', err.message)
      return res.status(500).json({ error: err.message || 'Failed to send code' })
    }

    res.json(generic)
  })

  // POST /api/auth/otp/verify — verify code and create session
  router.post('/otp/verify', (req, res) => {
    const email = normalizeEmail(typeof req.body?.email === 'string' ? req.body.email : '')
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : ''
    const rememberDevice = req.body?.rememberDevice === true

    if (!allowOtpAuth()) {
      return res.status(400).json({ error: 'Email OTP auth is not enabled' })
    }
    if (!email || !code) {
      return res.status(400).json({ error: 'email and code are required' })
    }

    const now = Date.now()
    const store = loadOtpStore()
    const record = [...store.records]
      .reverse()
      .find((entry) => entry.email === email && !entry.consumedAt)

    if (!record || record.expiresAt < now) {
      return res.status(400).json({ error: 'Code expired or invalid' })
    }

    record.attemptCount += 1
    if (record.attemptCount > OTP_MAX_ATTEMPTS) {
      saveOtpStore(store)
      return res.status(429).json({ error: 'Too many attempts for this code' })
    }

    const expectedHash = hashOtp(email, code)
    const actual = Buffer.from(record.codeHash, 'hex')
    const expected = Buffer.from(expectedHash, 'hex')
    const valid = actual.length === expected.length && crypto.timingSafeEqual(actual, expected)

    if (!valid) {
      saveOtpStore(store)
      return res.status(400).json({ error: 'Code expired or invalid' })
    }

    record.consumedAt = now
    saveOtpStore(store)

    const sessionToken = createOtpSessionToken(email, rememberDevice)
    res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(req, rememberDevice ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000))
    res.json({
      ok: true,
      authenticated: true,
      user: {
        id: `otp:${email}`,
        login: email,
        name: email,
        avatar: '',
        email,
        authType: 'otp',
      },
    })
  })

  // GET /api/auth/me — get current user
  router.get('/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const session = getSessionFromRequest(req)
    if (!session) {
      return res.json({ authenticated: false })
    }
    res.json({
      authenticated: true,
      user: {
        id: session.userId,
        login: session.login,
        name: session.name,
        avatar: session.avatar,
        email: session.email || null,
        authType: session.authType || 'github',
      },
    })
  })

  // POST /api/auth/logout — clear session
  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, getSessionCookieOptions(req))
    res.json({ ok: true })
  })

  // GET /api/auth/logout — clear session and redirect back to the app origin
  router.get('/logout', (req, res) => {
    const returnTo = normalizeReturnTo((req.query.return_to as string | undefined) || '', req)
    res.clearCookie(COOKIE_NAME, getSessionCookieOptions(req))
    res.redirect(`${returnTo}/`)
  })

  return router
}

// ============================================================================
// Auth middleware
// ============================================================================

function getBaseUrl(req: Request): string {
  const configuredBaseUrl = process.env.DASHBOARD_PUBLIC_URL?.trim()
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '')
  }
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001'
  return `${proto}://${host}`
}

function getAppUrl(req: Request, savedReturnTo?: string): string {
  if (savedReturnTo) {
    return normalizeReturnTo(savedReturnTo, req)
  }

  const configuredAppUrl = process.env.DASHBOARD_APP_URL?.trim()
  if (configuredAppUrl) {
    return configuredAppUrl.replace(/\/+$/, '')
  }

  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

  if (allowedOrigins.length > 0) {
    return allowedOrigins[0].replace(/\/+$/, '')
  }

  return getBaseUrl(req)
}

function normalizeReturnTo(raw: string, req: Request): string {
  const fallback = getBaseUrl(req)
  if (!raw) return getAppUrl(req)

  try {
    const url = new URL(raw)
    const candidate = url.origin.replace(/\/+$/, '')
    const allowedOrigins = (process.env.CORS_ORIGIN || '')
      .split(',')
      .map(origin => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean)
    const configuredAppUrl = process.env.DASHBOARD_APP_URL?.trim()?.replace(/\/+$/, '')

    if (configuredAppUrl && candidate === configuredAppUrl) {
      return candidate
    }
    if (allowedOrigins.length === 0 || allowedOrigins.includes(candidate)) {
      return candidate
    }
  } catch {
    // Ignore invalid return_to and fall back below.
  }

  return configuredAppUrlOrAllowedOrigin(req) || fallback
}

function configuredAppUrlOrAllowedOrigin(req: Request): string | null {
  const configuredAppUrl = process.env.DASHBOARD_APP_URL?.trim()
  if (configuredAppUrl) {
    return configuredAppUrl.replace(/\/+$/, '')
  }

  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
  if (allowedOrigins.length > 0) {
    return allowedOrigins[0].replace(/\/+$/, '')
  }

  return getBaseUrl(req)
}

function getSessionFromRequest(req: Request): SessionPayload | null {
  // Check cookie
  const cookieToken = req.cookies?.[COOKIE_NAME]
  if (cookieToken) {
    return verifySessionToken(cookieToken)
  }

  // Also check Authorization header (for API clients)
  const authHeader = req.headers.authorization
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '')
    return verifySessionToken(token)
  }

  return null
}

/**
 * Middleware: require GitHub OAuth session OR dashboard token.
 * Supports both authentication methods for backwards compatibility.
 */
export function requireGitHubAuth(req: Request, res: Response, next: NextFunction) {
  // Dev/solo bypass — set BYPASS_OAUTH=true in .env to skip authentication
  if (isBypassAuth()) {
    return next()
  }

  // Check GitHub session (cookie or bearer)
  const session = getSessionFromRequest(req)
  if (session) {
    return next()
  }

  // Fall back to legacy dashboard token
  const authHeader = req.headers.authorization
  if (authHeader) {
    const { getOrCreateToken } = require('./auth')
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (token === getOrCreateToken()) {
      return next()
    }
  }

  res.status(401).json({
    error: 'Unauthorized',
    message: allowOtpAuth() ? 'Please log in' : 'Please log in via GitHub',
    loginUrl: allowGitHubAuth() ? '/api/auth/github' : undefined,
  })
}

/**
 * Check if GitHub OAuth is configured.
 */
export function isGitHubAuthConfigured(): boolean {
  return !!(GITHUB_CLIENT_ID() && GITHUB_CLIENT_SECRET())
}

export function isOtpAuthConfigured(): boolean {
  return allowOtpAuth()
}
