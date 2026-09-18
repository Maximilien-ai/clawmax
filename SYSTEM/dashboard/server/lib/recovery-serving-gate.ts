import type { RequestHandler } from 'express'
import { randomUUID } from 'crypto'

/** Startup-only gate. Readiness and background services cannot precede verified
 * recovery. HTTP may serve liveness and sanitized recovery status meanwhile.
 */
export class RecoveryServingGate {
  private verified = false
  private listening = false
  private servicesStarted = false
  private stopped = false
  constructor(private verify: () => void, private startServices: () => void) {}
  get ready(): boolean { return this.verified && !this.stopped }
  resume(): void {
    if (this.stopped || this.verified) return
    this.verify() // Throwing leaves all normal operations blocked for the retry.
    this.verified = true
    this.startIfReady()
  }
  onListening(): void { this.listening = true; this.startIfReady() }
  stop(): void { this.stopped = true }
  private startIfReady(): void {
    if (!this.ready || !this.listening || this.servicesStarted) return
    this.servicesStarted = true
    this.startServices()
  }
}

/** Mount before audit, authentication and all runtime/resource routes. No broad
 * auth or CLI exemption: those handlers may read or mutate workspace state.
 */
export function recoveryRequestGate(isReady: () => boolean): RequestHandler {
  return (req, res, next) => {
    if (isReady() || ((req.method === 'GET' || req.method === 'HEAD') && ['/health', '/health/live', '/recovery'].includes(req.path))) return next()
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Retry-After', '30')
    return res.status(503).json({
      apiVersion: 'clawmax.instance/v1', kind: 'Error',
      requestId: `req_${randomUUID()}`,
      error: { code: 'workspace_recovery_required', message: 'Dashboard is recovering its active workspace. Retry shortly.', retryable: true },
    })
  }
}
