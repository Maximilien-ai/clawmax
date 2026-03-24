/**
 * GitHub OAuth authentication.
 * Handles OAuth flow, JWT session tokens, and user management.
 */

import { Request, Response, NextFunction, Router } from 'express'
import https from 'https'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import type { CookieOptions } from 'express'

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
  userId: number
  login: string
  name: string | null
  avatar: string
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
    userId: user.id,
    login: user.login,
    name: user.name,
    avatar: user.avatar_url,
  }
  return jwt.sign(payload, JWT_SECRET(), { expiresIn: SESSION_DURATION })
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

function getSessionCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
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
  if (process.env.BYPASS_OAUTH === 'true' || process.env.DASHBOARD_AUTH_DISABLED === 'true') {
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
    message: 'Please log in via GitHub',
    loginUrl: '/api/auth/github',
  })
}

/**
 * Check if GitHub OAuth is configured.
 */
export function isGitHubAuthConfigured(): boolean {
  return !!(GITHUB_CLIENT_ID() && GITHUB_CLIENT_SECRET())
}
