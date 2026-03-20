import { Request, Response, NextFunction } from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const LOG_DIR = path.join(__dirname, '..', 'logs')
const AUDIT_LOG = path.join(LOG_DIR, 'audit.log')

/**
 * Middleware that logs all API requests for audit trail.
 * Logs: timestamp, method, path, status, token hash (first 8 chars), response time.
 */
export function auditLog(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()

  res.on('finish', () => {
    const duration = Date.now() - start
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || ''
    const tokenHash = token ? crypto.createHash('sha256').update(token).digest('hex').slice(0, 8) : 'none'

    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      token: tokenHash,
      ms: duration,
    })

    try {
      fs.mkdirSync(LOG_DIR, { recursive: true })
      fs.appendFileSync(AUDIT_LOG, entry + '\n', 'utf-8')
    } catch {}
  })

  next()
}
