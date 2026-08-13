import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getAgentSkills } from './skills'
import { getSkillFingerprint } from './skill-secret-broker'
import { getWorkspacePath } from './workspace'
import {
  MAIL_CAPABILITIES,
  MailCapability,
  MailCapabilityGrant,
  MailInvocation,
  MailProviderId,
  createMailAuditEvent,
  invokeMailCapability,
} from './mail-capabilities'
import {
  MailOAuthProviderAdapter,
  getMailOAuthAccessToken,
  listMailOAuthConnections,
} from './mail-oauth'
import { createAuthenticatedMailProvider } from './mail-provider-adapters'

const STORE_VERSION = 1
export const MAIL_SKILL_ID = 'clawmax-mail'

function workspaceId(workspacePath = getWorkspacePath()): string {
  return path.basename(path.resolve(workspacePath))
}

function grantsPath(workspacePath = getWorkspacePath()): string {
  return path.join(workspacePath, 'SYSTEM', '.clawmax', 'mail-capability-grants.json')
}

function auditPath(workspacePath = getWorkspacePath()): string {
  return path.join(workspacePath, 'SYSTEM', '.clawmax', 'mail-capability-audit.jsonl')
}

function assertProvider(provider: string): asserts provider is MailProviderId {
  if (provider !== 'gmail' && provider !== 'microsoft365') throw new Error('Unsupported mail provider')
}

function normalizeCapabilities(values: unknown): MailCapability[] {
  if (!Array.isArray(values)) throw new Error('Mail capabilities are required')
  const capabilities = Array.from(new Set(values.map((value) => `${value}`.trim()).filter(Boolean)))
  const unsupported = capabilities.find((capability) => !MAIL_CAPABILITIES.includes(capability as MailCapability))
  if (unsupported) throw new Error(`Unsupported mail capability '${unsupported}'`)
  if (capabilities.length === 0) throw new Error('At least one mail capability is required')
  return capabilities.sort() as MailCapability[]
}

function writeGrants(grants: MailCapabilityGrant[], workspacePath = getWorkspacePath()): void {
  const filePath = grantsPath(workspacePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(filePath, JSON.stringify({ version: STORE_VERSION, grants }, null, 2), { encoding: 'utf8', mode: 0o600 })
}

function appendAudit(event: Record<string, unknown>, workspacePath = getWorkspacePath()): void {
  const filePath = auditPath(workspacePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  fs.appendFileSync(filePath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, { encoding: 'utf8', mode: 0o600 })
}

export function listMailCapabilityGrants(workspacePath = getWorkspacePath()): MailCapabilityGrant[] {
  try {
    const filePath = grantsPath(workspacePath)
    if (!fs.existsSync(filePath)) return []
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return parsed?.version === STORE_VERSION && Array.isArray(parsed.grants) ? parsed.grants : []
  } catch {
    return []
  }
}

export function createMailCapabilityGrant(input: {
  agentId: string
  provider: string
  accountId: string
  capabilities: unknown
  expiresAt?: string
}, workspacePath = getWorkspacePath()): MailCapabilityGrant {
  const agentId = `${input.agentId || ''}`.trim()
  const accountId = `${input.accountId || ''}`.trim()
  if (!/^[a-z][a-z0-9_-]*$/.test(agentId)) throw new Error('Invalid agent id')
  if (!getAgentSkills(agentId).includes(MAIL_SKILL_ID)) {
    throw new Error(`Skill '${MAIL_SKILL_ID}' is not assigned to agent '${agentId}'`)
  }
  assertProvider(input.provider)
  if (!accountId) throw new Error('Mail account is required')
  const connection = listMailOAuthConnections(workspacePath).find((candidate) =>
    candidate.provider === input.provider && candidate.accountId === accountId)
  if (!connection) {
    throw new Error('Mail OAuth connection not found')
  }
  const capabilities = normalizeCapabilities(input.capabilities)
  const unapproved = capabilities.filter((capability) => !connection.capabilities.includes(capability))
  if (unapproved.length > 0) throw new Error(`Mail OAuth connection did not approve: ${unapproved.join(', ')}`)
  const now = new Date().toISOString()
  const expiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : undefined
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) throw new Error('Grant expiration must be in the future')
  const grant: MailCapabilityGrant = {
    id: crypto.randomUUID(),
    workspaceId: workspaceId(workspacePath),
    agentId,
    pluginId: MAIL_SKILL_ID,
    pluginFingerprint: getSkillFingerprint(MAIL_SKILL_ID),
    provider: input.provider,
    accountId,
    capabilities,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  }
  const grants = listMailCapabilityGrants(workspacePath).map((candidate) =>
    candidate.agentId === agentId
      && candidate.provider === input.provider
      && candidate.accountId === accountId
      && !candidate.revokedAt
      ? { ...candidate, revokedAt: now, updatedAt: now }
      : candidate)
  writeGrants([...grants, grant], workspacePath)
  appendAudit({ event: 'mail.grant.created', grantId: grant.id, agentId, provider: input.provider, accountId, capabilities, status: 'success' }, workspacePath)
  return grant
}

export function revokeMailCapabilityGrant(grantId: string, workspacePath = getWorkspacePath()): MailCapabilityGrant {
  const grants = listMailCapabilityGrants(workspacePath)
  const index = grants.findIndex((grant) => grant.id === grantId)
  if (index < 0) throw new Error('Mail grant not found')
  const now = new Date().toISOString()
  grants[index] = { ...grants[index], revokedAt: grants[index].revokedAt || now, updatedAt: now }
  writeGrants(grants, workspacePath)
  appendAudit({ event: 'mail.grant.revoked', grantId, agentId: grants[index].agentId, provider: grants[index].provider, accountId: grants[index].accountId, status: 'success' }, workspacePath)
  return grants[index]
}

export function revokeMailGrantsForConnection(provider: MailProviderId, accountId: string, workspacePath = getWorkspacePath()): number {
  const now = new Date().toISOString()
  let count = 0
  const grants = listMailCapabilityGrants(workspacePath).map((grant) => {
    if (grant.provider !== provider || grant.accountId !== accountId || grant.revokedAt) return grant
    count += 1
    return { ...grant, revokedAt: now, updatedAt: now }
  })
  if (count > 0) {
    writeGrants(grants, workspacePath)
    appendAudit({ event: 'mail.grants.connection-revoked', provider, accountId, count, status: 'success' }, workspacePath)
  }
  return count
}

function resolveGrant(input: {
  agentId: string
  provider: MailProviderId
  accountId: string
  capability: MailCapability
}, workspacePath = getWorkspacePath()): MailCapabilityGrant {
  const grant = listMailCapabilityGrants(workspacePath).find((candidate) =>
    candidate.workspaceId === workspaceId(workspacePath)
      && candidate.agentId === input.agentId
      && candidate.provider === input.provider
      && candidate.accountId === input.accountId
      && !candidate.revokedAt)
  if (!grant) throw new Error('No active mail grant for this agent and account')
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) throw new Error('Mail grant has expired')
  if (!getAgentSkills(input.agentId).includes(MAIL_SKILL_ID)) throw new Error(`Skill '${MAIL_SKILL_ID}' is no longer assigned to agent '${input.agentId}'`)
  if (grant.pluginFingerprint !== getSkillFingerprint(MAIL_SKILL_ID)) throw new Error(`Skill '${MAIL_SKILL_ID}' changed and requires reauthorization`)
  if (!grant.capabilities.includes(input.capability)) throw new Error(`Mail capability ${input.capability} is not granted`)
  return grant
}

export function listGrantedMailAccounts(agentId: string, workspacePath = getWorkspacePath()) {
  const connections = listMailOAuthConnections(workspacePath)
  return listMailCapabilityGrants(workspacePath)
    .filter((grant) => grant.agentId === agentId && !grant.revokedAt && (!grant.expiresAt || Date.parse(grant.expiresAt) > Date.now()))
    .map((grant) => {
      const connection = connections.find((candidate) => candidate.provider === grant.provider && candidate.accountId === grant.accountId)
      return {
        grantId: grant.id,
        provider: grant.provider,
        accountId: grant.accountId,
        accountEmail: connection?.accountEmail,
        capabilities: [...grant.capabilities],
        status: connection?.status || 'disconnected',
      }
    })
    .filter((entry) => entry.status !== 'disconnected')
}

export async function executeGrantedMailCapability(input: {
  agentId: string
  provider: string
  accountId: string
  capability: string
  args?: MailInvocation['args']
  providers: Record<MailProviderId, MailOAuthProviderAdapter>
  fetchFn?: typeof fetch
}, workspacePath = getWorkspacePath()) {
  assertProvider(input.provider)
  if (!MAIL_CAPABILITIES.includes(input.capability as MailCapability)) throw new Error('Unsupported mail capability')
  const capability = input.capability as MailCapability
  const grant = resolveGrant({ agentId: input.agentId, provider: input.provider, accountId: input.accountId, capability }, workspacePath)
  const request: MailInvocation = {
    provider: input.provider,
    accountId: input.accountId,
    capability,
    context: {
      workspaceId: grant.workspaceId,
      agentId: grant.agentId,
      pluginId: grant.pluginId,
      pluginFingerprint: grant.pluginFingerprint,
    },
    args: input.args || {},
  }
  try {
    const accessToken = await getMailOAuthAccessToken({
      provider: input.provider,
      accountId: input.accountId,
      actorId: `agent:${input.agentId}`,
      adapter: input.providers[input.provider],
      workspacePath,
    })
    const result = await invokeMailCapability(grant, createAuthenticatedMailProvider(input.provider, accessToken, input.fetchFn), request)
    appendAudit({ event: 'mail.capability.executed', ...createMailAuditEvent(request, 'succeeded'), status: 'success' }, workspacePath)
    return result
  } catch (error) {
    appendAudit({ event: 'mail.capability.denied', ...createMailAuditEvent(request, 'failed'), status: 'failed' }, workspacePath)
    throw error
  }
}

export const __test = { auditPath, grantsPath, resolveGrant }
