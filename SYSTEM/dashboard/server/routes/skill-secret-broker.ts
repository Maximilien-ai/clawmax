import express from 'express'
import {
  createSkillSecretGrant,
  deleteBrokerSecret,
  executeBrokeredSkill,
  getBrokerStatus,
  putBrokerSecret,
  revokeSkillSecretGrant,
  verifyBrokerCapabilityToken,
} from '../lib/skill-secret-broker'

export const skillSecretBrokerRouter = express.Router()
export const skillSecretBrokerRuntimeRouter = express.Router()

function statusForError(message: string): number {
  if (/not found/i.test(message)) return 404
  if (/No active secret grant|has expired|requires reauthorization|no longer assigned|does not permit/i.test(message)) return 403
  if (/master key|not assigned|did not declare|missing|invalid|expiration|entrypoint|secret keys/i.test(message)) return 400
  return 500
}

skillSecretBrokerRouter.get('/status', (_req, res) => {
  try {
    res.json(getBrokerStatus())
  } catch (error: any) {
    res.status(statusForError(error?.message || '')).json({ error: error?.message || 'Failed to load skill secret broker status' })
  }
})

skillSecretBrokerRouter.put('/secrets/:key', (req, res) => {
  try {
    putBrokerSecret(req.params.key, req.body?.value)
    res.json(getBrokerStatus())
  } catch (error: any) {
    res.status(statusForError(error?.message || '')).json({ error: error?.message || 'Failed to save brokered secret' })
  }
})

skillSecretBrokerRouter.delete('/secrets/:key', (req, res) => {
  try {
    deleteBrokerSecret(req.params.key)
    res.json(getBrokerStatus())
  } catch (error: any) {
    res.status(statusForError(error?.message || '')).json({ error: error?.message || 'Failed to delete brokered secret' })
  }
})

skillSecretBrokerRouter.post('/grants', (req, res) => {
  try {
    const grant = createSkillSecretGrant({
      agentId: req.body?.agentId,
      skillId: req.body?.skillId,
      keys: req.body?.keys,
      expiresAt: req.body?.expiresAt,
    })
    res.json({ ok: true, grant, status: getBrokerStatus() })
  } catch (error: any) {
    res.status(statusForError(error?.message || '')).json({ error: error?.message || 'Failed to authorize skill secrets' })
  }
})

skillSecretBrokerRouter.delete('/grants/:grantId', (req, res) => {
  try {
    const grant = revokeSkillSecretGrant(req.params.grantId)
    res.json({ ok: true, grant, status: getBrokerStatus() })
  } catch (error: any) {
    res.status(statusForError(error?.message || '')).json({ error: error?.message || 'Failed to revoke skill secret grant' })
  }
})

skillSecretBrokerRouter.post('/grants/:grantId/test', async (req, res) => {
  try {
    const status = getBrokerStatus()
    const grant = status.grants.find((candidate) => candidate.id === req.params.grantId)
    if (!grant) return res.status(404).json({ error: 'Secret grant not found' })
    const result = await executeBrokeredSkill({
      agentId: grant.agentId,
      skillId: grant.skillId,
      action: `${req.body?.action || 'check'}`,
    })
    res.status(result.ok ? 200 : 502).json(result)
  } catch (error: any) {
    res.status(statusForError(error?.message || '')).json({ error: error?.message || 'Brokered skill test failed' })
  }
})

skillSecretBrokerRuntimeRouter.post('/execute', async (req, res) => {
  try {
    const authorization = `${req.headers.authorization || ''}`
    const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
    const capability = verifyBrokerCapabilityToken(token)
    const result = await executeBrokeredSkill({
      agentId: capability.agentId,
      skillId: req.body?.skillId,
      action: req.body?.action,
    })
    res.status(result.ok ? 200 : 502).json(result)
  } catch (error: any) {
    res.status(/capability/i.test(error?.message || '') ? 401 : statusForError(error?.message || '')).json({
      error: error?.message || 'Brokered skill execution failed',
    })
  }
})

export default skillSecretBrokerRouter
