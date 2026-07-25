import { Router } from 'express'
import { getAuthenticatedSession } from '../lib/github-auth'
import {
  beginMailOAuth,
  completeMailOAuth,
  createDefaultMailOAuthProviders,
  disconnectMailOAuth,
  getMailOAuthStatus,
  MailOAuthProviderAdapter,
  refreshMailOAuth,
} from '../lib/mail-oauth'
import { MailProviderId } from '../lib/mail-capabilities'

type ProviderMap = Record<MailProviderId, MailOAuthProviderAdapter>

function actorId(req: any): string {
  const session = getAuthenticatedSession(req)
  return session?.email || session?.login || 'dashboard-user'
}

function errorStatus(message: string): number {
  if (/not found/i.test(message)) return 404
  if (/state|actor mismatch|workspace mismatch|provider mismatch|expired/i.test(message)) return 403
  if (/master key|required|unsupported|not configured|not enabled|redirect URI/i.test(message)) return 400
  return 502
}

export function createMailOAuthRouter(providers: ProviderMap = createDefaultMailOAuthProviders()) {
  const router = Router()

  router.get('/status', (_req, res) => {
    try {
      res.json(getMailOAuthStatus(providers))
    } catch (error: any) {
      res.status(errorStatus(error?.message || '')).json({ error: error?.message || 'Failed to load mail connection status' })
    }
  })

  router.post('/:provider/begin', (req, res) => {
    try {
      const provider = `${req.params.provider || ''}` as MailProviderId
      const adapter = providers[provider]
      if (!adapter) throw new Error('Unsupported mail OAuth provider')
      const requested = Array.isArray(req.body?.capabilities)
        ? req.body.capabilities
        : Array.isArray(req.body?.scopes)
          ? req.body.scopes
          : ['mail.read.metadata']
      const result = beginMailOAuth({
        provider,
        actorId: actorId(req),
        scopes: requested.filter((entry: unknown): entry is string => typeof entry === 'string'),
        adapter,
      })
      res.json({ ok: true, provider, ...result })
    } catch (error: any) {
      res.status(errorStatus(error?.message || '')).json({ error: error?.message || 'Failed to begin mail authorization' })
    }
  })

  router.get('/:provider/callback', async (req, res) => {
    try {
      const provider = `${req.params.provider || ''}` as MailProviderId
      const adapter = providers[provider]
      if (!adapter) throw new Error('Unsupported mail OAuth provider')
      const connection = await completeMailOAuth({
        provider,
        actorId: actorId(req),
        state: `${req.query.state || ''}`,
        code: `${req.query.code || ''}`,
        adapter,
      })
      res.json({ ok: true, connection })
    } catch (error: any) {
      res.status(errorStatus(error?.message || '')).json({ error: error?.message || 'Failed to complete mail authorization' })
    }
  })

  router.delete('/:provider/connections/:accountId', async (req, res) => {
    try {
      const provider = `${req.params.provider || ''}` as MailProviderId
      const adapter = providers[provider]
      if (!adapter) throw new Error('Unsupported mail OAuth provider')
      await disconnectMailOAuth({
        provider,
        accountId: `${req.params.accountId || ''}`,
        actorId: actorId(req),
        adapter,
      })
      res.json({ ok: true, status: getMailOAuthStatus(providers) })
    } catch (error: any) {
      res.status(errorStatus(error?.message || '')).json({ error: error?.message || 'Failed to disconnect mail account' })
    }
  })

  router.post('/:provider/connections/:accountId/refresh', async (req, res) => {
    try {
      const provider = `${req.params.provider || ''}` as MailProviderId
      const adapter = providers[provider]
      if (!adapter) throw new Error('Unsupported mail OAuth provider')
      const connection = await refreshMailOAuth({
        provider,
        accountId: `${req.params.accountId || ''}`,
        actorId: actorId(req),
        adapter,
      })
      res.json({ ok: true, connection })
    } catch (error: any) {
      res.status(errorStatus(error?.message || '')).json({ error: error?.message || 'Failed to refresh mail account' })
    }
  })

  return router
}

export default createMailOAuthRouter()
