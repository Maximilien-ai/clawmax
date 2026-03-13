import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// ============================================================================
// Token Management
// ============================================================================

const TOKEN_FILE = path.join(__dirname, '..', '.dashboard-token')

/**
 * Gets or generates the dashboard auth token.
 * Priority:
 * 1. DASHBOARD_TOKEN environment variable
 * 2. Token from .dashboard-token file
 * 3. Generate new random token and save to file
 */
export function getOrCreateToken(): string {
  // Check environment variable first
  if (process.env.DASHBOARD_TOKEN) {
    return process.env.DASHBOARD_TOKEN
  }

  // Check token file
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      const token = fs.readFileSync(TOKEN_FILE, 'utf-8').trim()
      if (token) return token
    } catch (err) {
      console.warn('Failed to read token file:', err)
    }
  }

  // Generate new token
  const newToken = crypto.randomBytes(32).toString('hex')

  try {
    fs.writeFileSync(TOKEN_FILE, newToken, { mode: 0o600 })
    console.log('\n' + '='.repeat(70))
    console.log('🔐 DASHBOARD TOKEN (save this for API access):')
    console.log(newToken)
    console.log('='.repeat(70) + '\n')
  } catch (err) {
    console.error('Failed to write token file:', err)
  }

  return newToken
}

// ============================================================================
// Auth Middleware
// ============================================================================

const VALID_TOKEN = getOrCreateToken()

/**
 * Middleware to protect API routes with token authentication.
 * Expects: Authorization: Bearer <token>
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Skip auth if disabled in development
  if (process.env.DASHBOARD_AUTH_DISABLED === 'true') {
    next()
    return
  }

  const authHeader = req.headers.authorization

  if (!authHeader) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing Authorization header'
    })
    return
  }

  const token = authHeader.replace(/^Bearer\s+/i, '')

  if (token !== VALID_TOKEN) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token'
    })
    return
  }

  next()
}

/**
 * Public endpoint to verify token validity (useful for client-side checks)
 */
export function verifyToken(req: Request, res: Response) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    res.json({ valid: false })
    return
  }

  const token = authHeader.replace(/^Bearer\s+/i, '')
  res.json({ valid: token === VALID_TOKEN })
}
