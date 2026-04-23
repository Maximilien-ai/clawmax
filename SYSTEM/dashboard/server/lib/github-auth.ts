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
import { Resend } from 'resend'

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
  sendCount: number
  cooldownUntil?: number
  consumedAt?: number
  supersededAt?: number
  attemptCount: number
  requestIp?: string
}

type OtpStore = {
  version: 1
  records: OtpRecord[]
}

const OTP_STORE_PATH = path.join(__dirname, '..', 'data', 'auth', 'otp-store.json')
const OTP_DEV_FILE_PATH = path.resolve(__dirname, '..', '..', '..', '..', '.clawmax-otp-dev.json')
const OTP_RESEND_BASE_MS = 30 * 1000
const OTP_RESEND_MAX_MS = 5 * 60 * 1000
const OTP_REQUEST_HARD_LIMIT_WINDOW_MS = 60 * 60 * 1000
const OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR = 10
const OTP_MAX_REQUESTS_PER_IP_PER_HOUR = 20
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

function isOtpDevMode(): boolean {
  return process.env.OTP_DEV_MODE === 'log'
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

function hashFingerprint(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function extractEmailAddress(from: string): string {
  const trimmed = from.trim()
  const bracketMatch = trimmed.match(/<([^>]+)>/)
  if (bracketMatch?.[1]) return bracketMatch[1].trim().toLowerCase()
  return trimmed.replace(/^"+|"+$/g, '').toLowerCase()
}

function extractEmailDomain(address: string): string | null {
  const normalized = address.trim().toLowerCase()
  const atIndex = normalized.lastIndexOf('@')
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null
  return normalized.slice(atIndex + 1)
}

export function getOtpProviderDiagnosticContext(apiKey: string, from: string, subject: string) {
  const senderAddress = extractEmailAddress(from)
  return {
    provider: 'resend',
    from,
    subject,
    senderAddress,
    senderDomain: extractEmailDomain(senderAddress),
    apiKeyFingerprint: hashFingerprint(apiKey),
  }
}

export function summarizeOtpProviderError(error: any) {
  return {
    name: typeof error?.name === 'string' ? error.name : null,
    type: typeof error?.type === 'string' ? error.type : null,
    code: typeof error?.code === 'string' || typeof error?.code === 'number' ? error.code : null,
    statusCode:
      typeof error?.statusCode === 'number'
        ? error.statusCode
        : typeof error?.status === 'number'
          ? error.status
          : null,
    message: typeof error?.message === 'string' ? error.message : 'Failed to send OTP email',
  }
}

function computeOtpCooldownMs(sendCount: number): number {
  if (sendCount <= 3) return OTP_RESEND_BASE_MS
  if (sendCount <= 5) return 60 * 1000
  if (sendCount <= 7) return 120 * 1000
  return OTP_RESEND_MAX_MS
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

const CLAWMAX_LOGO_URL = 'https://www.clawmax.ai/clawmax-logo.jpg'

function buildOtpEmailHtml(email: string, code: string): string {
  const expiryMinutes = Math.round(OTP_EXPIRY_MS / 60000)
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="color-scheme" content="light dark" />
      <meta name="supported-color-schemes" content="light dark" />
      <title>Your ClawMax login code</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f4f1ea;color:#1f2937;font-family:Georgia,'Times New Roman',serif;">
      <div style="margin:0;padding:32px 12px;background-color:#f4f1ea;color:#1f2937;">
        <div style="max-width:680px;margin:0 auto;background-color:#fffdf8;border:1px solid #e7ded1;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(31,41,55,0.08);">
          <div style="padding:28px 32px;background-color:#16222d;background-image:linear-gradient(135deg,#111827 0%,#23484d 100%);color:#f9fafb;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="width:70px;vertical-align:top;">
                  <img src="${CLAWMAX_LOGO_URL}" alt="ClawMax logo" width="56" height="56" style="width:56px;height:56px;border-radius:14px;display:block;background-color:#ffffff;" />
                </td>
                <td style="vertical-align:top;">
                  <div style="font-size:13px;letter-spacing:0.22em;text-transform:uppercase;color:#d1d5db;">ClawMax</div>
                  <div style="font-size:28px;font-weight:700;line-height:1.15;margin-top:4px;color:#f9fafb;">Your login code</div>
                </td>
              </tr>
            </table>
            <div style="margin-top:18px;font-size:15px;line-height:1.7;max-width:560px;color:#e5e7eb;">
              Use this one-time code to sign in to your ClawMax dashboard.
            </div>
          </div>

          <div style="padding:32px;background-color:#fffdf8;color:#1f2937;">
            <p style="margin:0 0 16px;font-size:18px;line-height:1.7;color:#111827;">Hi,</p>
            <p style="margin:0 0 16px;font-size:16px;line-height:1.8;color:#1f2937;">
              We received a sign-in request for <strong style="color:#111827;">${email}</strong>.
            </p>

            <div style="margin:24px 0;padding:22px;border:1px solid #d6c7b5;border-radius:18px;background-color:#fff9ef;background-image:linear-gradient(180deg,#fff9ef 0%,#fffdf8 100%);text-align:center;color:#1f2937;">
              <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#7c5c2d;margin-bottom:10px;">One-time password</div>
              <div style="display:inline-block;padding:12px 18px;border-radius:14px;background-color:#fffdf8;border:1px solid #d6c7b5;color:#111827;font-size:40px;line-height:1;font-weight:700;letter-spacing:0.3em;">
                ${code}
              </div>
              <div style="margin-top:12px;font-size:14px;color:#4b5563;line-height:1.7;">
                This code expires in ${expiryMinutes} minutes and can only be used once.
              </div>
            </div>

            <div style="margin:24px 0 0;padding:0;background-color:#fffdf8;color:#1f2937;">
              <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:10px;">Security notes</div>
              <ul style="padding-left:22px;margin:0;color:#374151;font-size:15px;line-height:1.8;">
                <li style="color:#374151;">Enter the code exactly as shown on the login screen.</li>
                <li style="color:#374151;">If you did not request this login code, you can ignore this email.</li>
                <li style="color:#374151;">ClawMax will never ask you to share this code with anyone.</li>
              </ul>
            </div>

            <div style="margin-top:28px;padding-top:22px;border-top:1px solid #ece6dc;background-color:#fffdf8;">
              <div style="font-size:15px;line-height:1.8;color:#1f2937;">
                Thank you,
                <br /><br />
                <strong style="color:#111827;">ClawMax</strong><br />
                <a href="mailto:max@clawmax.ai" style="color:#0f766e;text-decoration:none;">max@clawmax.ai</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>
  </html>`
}

function buildOtpEmailText(email: string, code: string): string {
  const expiryMinutes = Math.round(OTP_EXPIRY_MS / 60000)
  return [
    'Your ClawMax login code',
    '',
    `Email: ${email}`,
    `Code: ${code}`,
    '',
    `This code expires in ${expiryMinutes} minutes and can only be used once.`,
    'If you did not request this code, you can ignore this email.',
  ].join('\n')
}

async function sendOtpEmail(email: string, code: string): Promise<void> {
  if (isOtpDevMode()) {
    const payload = {
      email,
      code,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MS).toISOString(),
      updatedAt: new Date().toISOString(),
      note: 'Local dev OTP only. This file is gitignored.',
    }
    fs.writeFileSync(OTP_DEV_FILE_PATH, JSON.stringify(payload, null, 2), 'utf-8')
    console.log(`[Auth][OTP] Code for ${email}: ${code}`)
    console.log(`[Auth][OTP] Dev file: ${OTP_DEV_FILE_PATH}`)
    return
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  const from = (process.env.OTP_FROM_EMAIL || process.env.SIGNUP_FROM_EMAIL || '').trim()
  if (!from) {
    throw new Error('Missing OTP_FROM_EMAIL or SIGNUP_FROM_EMAIL')
  }

  const resend = new Resend(apiKey)
  const subject = process.env.OTP_EMAIL_SUBJECT || 'Your ClawMax login code'
  const providerContext = getOtpProviderDiagnosticContext(apiKey, from, subject)
  const sendResult = await resend.emails.send({
    from,
    to: [email],
    subject,
    html: buildOtpEmailHtml(email, code),
    text: buildOtpEmailText(email, code),
  })

  if ((sendResult as any)?.error) {
    const error = (sendResult as any).error
    const summarizedError = summarizeOtpProviderError(error)
    console.error('[Auth][OTP] Resend rejected OTP email', {
      email,
      ...providerContext,
      error: summarizedError,
      note: 'If this is instance-specific, compare key fingerprint and sender-domain state before treating it as a frontend issue.',
    })
    throw new Error(summarizedError.message)
  }

  console.log('[Auth][OTP] Resend accepted OTP email', {
    email,
    ...providerContext,
    id: (sendResult as any)?.data?.id || null,
  })
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
    const maskedEmail = email ? `${email.slice(0, 2)}***${email.slice(email.indexOf('@'))}` : 'unknown'

    if (!allowOtpAuth() || !email) {
      console.log(`[Auth][OTP] Ignored request (otp disabled or missing email) from ${req.ip}`)
      return res.json(generic)
    }

    const allowed = getOtpAllowedEmails()
    if (!allowed.includes(email)) {
      console.log(`[Auth][OTP] Ignored request for non-allowlisted email ${maskedEmail} from ${req.ip}`)
      return res.json(generic)
    }

    const now = Date.now()
    const store = loadOtpStore()
    const recentEmailRequests = store.records.filter((record) => record.email === email && now - record.createdAt < OTP_REQUEST_HARD_LIMIT_WINDOW_MS)
    const recentIpRequests = store.records.filter((record) => record.requestIp && record.requestIp === req.ip && now - record.createdAt < OTP_REQUEST_HARD_LIMIT_WINDOW_MS)
    if (recentEmailRequests.length >= OTP_MAX_REQUESTS_PER_EMAIL_PER_HOUR) {
      console.warn(`[Auth][OTP] Email request limit hit for ${maskedEmail}`)
      return res.status(429).json({
        error: 'Too many login code requests for this email. Try again later.',
        retryAfterSeconds: Math.ceil((OTP_REQUEST_HARD_LIMIT_WINDOW_MS - (now - recentEmailRequests[0].createdAt)) / 1000),
      })
    }
    if (recentIpRequests.length >= OTP_MAX_REQUESTS_PER_IP_PER_HOUR) {
      console.warn(`[Auth][OTP] IP request limit hit for ${req.ip}`)
      return res.status(429).json({
        error: 'Too many login code requests from this network. Try again later.',
        retryAfterSeconds: Math.ceil((OTP_REQUEST_HARD_LIMIT_WINDOW_MS - (now - recentIpRequests[0].createdAt)) / 1000),
      })
    }

    const activeRecord = [...store.records]
      .reverse()
      .find((record) => record.email === email && !record.consumedAt && !record.supersededAt && record.expiresAt > now)

    if (activeRecord?.cooldownUntil && activeRecord.cooldownUntil > now) {
      console.log(`[Auth][OTP] Cooldown active for ${maskedEmail} (${Math.ceil((activeRecord.cooldownUntil - now) / 1000)}s remaining)`)
      return res.status(429).json({
        error: `Please wait before requesting another code.`,
        retryAfterSeconds: Math.ceil((activeRecord.cooldownUntil - now) / 1000),
        resendAvailableAt: activeRecord.cooldownUntil,
      })
    }

    const code = createOtpCode()
    const nextRecords = store.records
      .filter((record) => record.expiresAt > now || !!record.consumedAt)

    for (const record of nextRecords) {
      if (record.email === email && !record.consumedAt && !record.supersededAt) {
        record.supersededAt = now
      }
    }

    const sendCount = (activeRecord?.sendCount || 0) + 1
    const cooldownMs = computeOtpCooldownMs(sendCount)

    nextRecords.push({
      email,
      codeHash: hashOtp(email, code),
      expiresAt: now + OTP_EXPIRY_MS,
      createdAt: now,
      sendCount,
      cooldownUntil: now + cooldownMs,
      attemptCount: 0,
      requestIp: req.ip,
    })
    saveOtpStore({ version: 1, records: nextRecords })

    try {
      await sendOtpEmail(email, code)
      console.log(`[Auth][OTP] Sent login code to ${maskedEmail} (send #${sendCount})`)
    } catch (err: any) {
      console.error('[Auth][OTP] Failed to send OTP:', err.message)
      return res.status(500).json({ error: err.message || 'Failed to send code' })
    }

    res.json({
      ...generic,
      retryAfterSeconds: Math.ceil(cooldownMs / 1000),
      resendAvailableAt: now + cooldownMs,
      ...(isOtpDevMode()
        ? {
            message: `Dev mode is enabled. Read the latest code from ${OTP_DEV_FILE_PATH}.`,
            devOtpFile: OTP_DEV_FILE_PATH,
          }
        : {}),
    })
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

export function getAuthenticatedSession(req: Request): {
  userId: string
  login: string
  name: string | null
  email?: string | null
  authType?: 'github' | 'otp'
} | null {
  return getSessionFromRequest(req)
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
