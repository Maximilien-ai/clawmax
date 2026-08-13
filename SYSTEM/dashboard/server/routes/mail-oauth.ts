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
import {
  createMailCapabilityGrant,
  executeGrantedMailCapability,
  listGrantedMailAccounts,
  listMailCapabilityGrants,
  revokeMailCapabilityGrant,
  revokeMailGrantsForConnection,
} from '../lib/mail-grants'
import { verifyBrokerCapabilityToken } from '../lib/skill-secret-broker'
import { listAgents } from '../lib/workspace'

type ProviderMap = Record<MailProviderId, MailOAuthProviderAdapter>

function actorId(req: any): string {
  const session = getAuthenticatedSession(req)
  return session?.email || session?.login || 'dashboard-user'
}

function errorStatus(message: string): number {
  if (/not found/i.test(message)) return 404
  if (/state|actor mismatch|workspace mismatch|provider mismatch|expired|No active mail grant|not granted|no longer assigned|requires reauthorization|did not approve/i.test(message)) return 403
  if (/master key|required|unsupported|not configured|not enabled|redirect URI|not assigned|invalid agent/i.test(message)) return 400
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

  router.get('/grants', (_req, res) => {
    try {
      res.json({
        grants: listMailCapabilityGrants(),
        agents: listAgents().map((agent) => ({ id: agent.id, name: agent.name, skills: agent.skills || [] })),
      })
    } catch (error: any) {
      res.status(errorStatus(error?.message || '')).json({ error: error?.message || 'Failed to load mail grants' })
    }
  })

  router.post('/grants', (req, res) => {
    try {
      const grant = createMailCapabilityGrant({
        agentId: req.body?.agentId,
        provider: req.body?.provider,
        accountId: req.body?.accountId,
        capabilities: req.body?.capabilities,
        expiresAt: req.body?.expiresAt,
      })
      res.json({ ok: true, grant })
    } catch (error: any) {
      res.status(errorStatus(error?.message || '')).json({ error: error?.message || 'Failed to authorize mail access' })
    }
  })

  router.delete('/grants/:grantId', (req, res) => {
    try {
      const grant = revokeMailCapabilityGrant(`${req.params.grantId || ''}`)
      res.json({ ok: true, grant })
    } catch (error: any) {
      res.status(errorStatus(error?.message || '')).json({ error: error?.message || 'Failed to revoke mail access' })
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
      if (`${req.headers.accept || ''}`.includes('text/html')) {
        res.type('html').send(`<!doctype html><html><body><p>Mail account connected. You can close this window.</p><script>window.opener?.postMessage({type:'clawmax-mail-oauth-complete',provider:${JSON.stringify(provider)}},'*');window.close();</script></body></html>`)
        return
      }
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
      revokeMailGrantsForConnection(provider, `${req.params.accountId || ''}`)
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

export function createMailRuntimeRouter(providers: ProviderMap = createDefaultMailOAuthProviders()) {
  const router = Router()

  function capability(req: any) {
    const authorization = `${req.headers.authorization || ''}`
    const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
    return verifyBrokerCapabilityToken(token)
  }

  router.post('/accounts', (req, res) => {
    try {
      const authorized = capability(req)
      res.json({ accounts: listGrantedMailAccounts(authorized.agentId) })
    } catch (error: any) {
      res.status(/capability/i.test(error?.message || '') ? 401 : errorStatus(error?.message || '')).json({
        error: error?.message || 'Failed to list granted mail accounts',
      })
    }
  })

  router.post('/execute', async (req, res) => {
    try {
      const authorized = capability(req)
      const result = await executeGrantedMailCapability({
        agentId: authorized.agentId,
        provider: req.body?.provider,
        accountId: req.body?.accountId,
        capability: req.body?.capability,
        args: req.body?.args,
        providers,
      })
      res.json({ ok: true, result })
    } catch (error: any) {
      res.status(/capability/i.test(error?.message || '') ? 401 : errorStatus(error?.message || '')).json({
        error: error?.message || 'Mail capability execution failed',
      })
    }
  })

  return router
}

export default createMailOAuthRouter()
