import crypto from 'crypto'
import { Router } from 'express'

const version = 'clawmax.host-agent-skill-authority/v1alpha1'
const requestVersion = 'clawmax.credential-broker-agent-skill/v1alpha1'
const fields = ['apiVersion', 'kind', 'requestId', 'instanceKey', 'workspaceId', 'workspaceRevisionId', 'agentId', 'skillName', 'skillDigest', 'actorId', 'operation', 'credentialNames', 'issuedAt', 'expiresAt'].sort()
const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const digest = /^sha256:[a-f0-9]{64}$/

export interface HostSkillAuthorityEvidence {
  workspaceId: string; workspaceRevisionId: string; agentId: string; actorId: string
  skillName: string; skillDigest: string; credentialNames: string[]
}

/** Private dev transport for a connected Mac host. The caller must still
 * independently verify its local Skill file and signed executable. */
export function createHostAgentSkillAuthorityRouter(options: {
  enabled: () => boolean
  secret: () => string
  instanceKey: () => string
  actorId: () => string
  workspaceId: () => string
  inspect: (input: { workspaceId: string; workspaceRevisionId: string; agentId: string; actorId: string; skillName: string }) => HostSkillAuthorityEvidence
  now?: () => number
}) {
  const router = Router()
  router.post('/authority', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const fail = (status: number, code: string) => res.status(status).json({ apiVersion: version, kind: 'Error', code })
    if (!options.enabled() || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) return fail(404, 'host_unavailable')
    const secret = options.secret()
    const supplied = req.get('X-ClawMax-Host-Key') || ''
    if (!/^[a-f0-9]{64}$/.test(secret) || !/^[a-f0-9]{64}$/.test(supplied)
      || !crypto.timingSafeEqual(Buffer.from(secret, 'hex'), Buffer.from(supplied, 'hex'))) return fail(401, 'host_unauthorized')
    const body = req.body
    if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 4096
      || JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(fields)
      || body.apiVersion !== requestVersion || body.kind !== 'AgentSkillExecutionRequest'
      || typeof body.requestId !== 'string' || !/^[a-f0-9]{64}$/.test(body.requestId)
      || typeof body.instanceKey !== 'string' || !id.test(body.instanceKey)
      || typeof body.workspaceId !== 'string' || !id.test(body.workspaceId)
      || typeof body.workspaceRevisionId !== 'string' || !id.test(body.workspaceRevisionId)
      || typeof body.agentId !== 'string' || !id.test(body.agentId)
      || body.skillName !== 'maximilien' || typeof body.skillDigest !== 'string' || !digest.test(body.skillDigest)
      || typeof body.actorId !== 'string' || !id.test(body.actorId)
      || body.operation !== 'maximilien.snapshot.v1'
      || !Array.isArray(body.credentialNames) || body.credentialNames.length !== 1 || body.credentialNames[0] !== 'MAXIMILIEN_ACCESS_TOKEN') return fail(400, 'invalid_request')
    if (typeof body.issuedAt !== 'string' || typeof body.expiresAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(body.issuedAt)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(body.expiresAt)) return fail(400, 'invalid_request')
    const issued = Date.parse(body.issuedAt)
    const expires = Date.parse(body.expiresAt)
    const now = options.now?.() ?? Date.now()
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now || expires <= now || expires - issued > 60000) return fail(400, 'invalid_or_expired_request')
    if (body.instanceKey !== options.instanceKey() || body.actorId !== options.actorId() || body.workspaceId !== options.workspaceId()) return fail(403, 'authority_revoked')
    try {
      const current = options.inspect({ workspaceId: body.workspaceId, workspaceRevisionId: body.workspaceRevisionId,
        agentId: body.agentId, actorId: body.actorId, skillName: body.skillName })
      if (current.workspaceId !== body.workspaceId || current.workspaceRevisionId !== body.workspaceRevisionId
        || current.agentId !== body.agentId || current.actorId !== body.actorId || current.skillName !== body.skillName
        || current.skillDigest !== body.skillDigest || JSON.stringify(current.credentialNames) !== JSON.stringify(body.credentialNames)) return fail(403, 'authority_revoked')
      return res.json({ apiVersion: version, kind: 'HostAgentSkillAuthority', requestId: body.requestId,
        instanceKey: body.instanceKey, ...current, connected: true, ownerAuthorized: true, skillInstalled: true })
    } catch { return fail(403, 'authority_unavailable') }
  })
  return router
}
