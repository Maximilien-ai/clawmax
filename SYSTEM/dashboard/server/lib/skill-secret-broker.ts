import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { getAgentSkills, getSkillById } from './skills'
import { getWorkspacePath } from './workspace'

const STORE_VERSION = 1
const KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,127}$/
const DEFAULT_CAPABILITY_TTL_MS = 60 * 60 * 1000
const MAX_OUTPUT_BYTES = 64 * 1024

export interface SkillSecretGrant {
  id: string
  workspaceId: string
  agentId: string
  skillId: string
  skillFingerprint: string
  keys: string[]
  createdAt: string
  updatedAt: string
  expiresAt?: string
  revokedAt?: string
}

interface EncryptedSecretStore {
  version: 1
  algorithm: 'aes-256-gcm'
  iv: string
  authTag: string
  ciphertext: string
  updatedAt: string
}

interface BrokerCapability {
  version: 1
  workspaceId: string
  agentId: string
  expiresAt: number
  nonce: string
}

export interface BrokerExecutionResult {
  ok: boolean
  skillId: string
  action: string
  stdout: string
  stderr: string
  exitCode: number | null
  keysUsed: string[]
}

const TEST_ENTRYPOINT = `
const crypto = require('crypto');
const secret = process.env.CLAWMAX_TEST_SECRET || '';
const action = process.argv[1] || 'check';
if (action === 'echo-for-redaction-test') {
  process.stdout.write(secret);
} else if (action === 'fail-for-redaction-test') {
  process.stderr.write('failure:' + secret);
  process.exit(7);
} else {
  process.stdout.write(JSON.stringify({
    secretAvailable: secret.length > 0,
    fingerprint: secret ? crypto.createHash('sha256').update(secret).digest('hex').slice(0, 12) : null
  }));
}
`

const FIXED_SKILL_ACTIONS: Record<string, Record<string, { keys: string[]; command: string; args: string[]; timeoutMs: number }>> = {
  'clawmax-secret-test': {
    check: { keys: ['CLAWMAX_TEST_SECRET'], command: process.execPath, args: ['-e', TEST_ENTRYPOINT, 'check'], timeoutMs: 10_000 },
    'echo-for-redaction-test': { keys: ['CLAWMAX_TEST_SECRET'], command: process.execPath, args: ['-e', TEST_ENTRYPOINT, 'echo-for-redaction-test'], timeoutMs: 10_000 },
    'fail-for-redaction-test': { keys: ['CLAWMAX_TEST_SECRET'], command: process.execPath, args: ['-e', TEST_ENTRYPOINT, 'fail-for-redaction-test'], timeoutMs: 10_000 },
  },
}

function workspaceId(workspacePath = getWorkspacePath()): string {
  return path.basename(path.resolve(workspacePath))
}

function brokerDir(workspacePath = getWorkspacePath()): string {
  return path.join(workspacePath, 'SYSTEM', '.clawmax')
}

function secretsPath(workspacePath = getWorkspacePath()): string {
  return path.join(brokerDir(workspacePath), 'skill-secrets.enc.json')
}

function grantsPath(workspacePath = getWorkspacePath()): string {
  return path.join(brokerDir(workspacePath), 'skill-secret-grants.json')
}

function auditPath(workspacePath = getWorkspacePath()): string {
  return path.join(brokerDir(workspacePath), 'skill-secret-audit.jsonl')
}

function getMasterKey(raw = process.env.CLAWMAX_SECRET_MASTER_KEY): Buffer | null {
  const value = `${raw || ''}`.trim()
  if (value.length < 32) return null
  return crypto.createHash('sha256').update(value).digest()
}

export function isSkillSecretBrokerConfigured(): boolean {
  return !!getMasterKey()
}

export function validateBrokerSecretKey(key: string): string {
  const normalized = `${key || ''}`.trim()
  if (!KEY_PATTERN.test(normalized) || normalized.includes('*')) {
    throw new Error('Secret keys must be uppercase identifiers containing only A-Z, 0-9, and underscores; wildcards are not allowed')
  }
  return normalized
}

function requireMasterKey(): Buffer {
  const key = getMasterKey()
  if (!key) {
    throw new Error('Brokered skill secrets require CLAWMAX_SECRET_MASTER_KEY with at least 32 characters')
  }
  return key
}

function encryptSecrets(values: Record<string, string>, masterKey = requireMasterKey()): EncryptedSecretStore {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(values), 'utf8'), cipher.final()])
  return {
    version: STORE_VERSION,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    updatedAt: new Date().toISOString(),
  }
}

function decryptSecrets(store: EncryptedSecretStore, masterKey = requireMasterKey()): Record<string, string> {
  if (store.version !== STORE_VERSION || store.algorithm !== 'aes-256-gcm') {
    throw new Error('Unsupported brokered secret store format')
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(store.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(store.authTag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(store.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
  const parsed = JSON.parse(plaintext)
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function readSecrets(workspacePath = getWorkspacePath()): Record<string, string> {
  requireMasterKey()
  const filePath = secretsPath(workspacePath)
  if (!fs.existsSync(filePath)) return {}
  return decryptSecrets(JSON.parse(fs.readFileSync(filePath, 'utf8')))
}

function writeSecrets(values: Record<string, string>, workspacePath = getWorkspacePath()): void {
  const filePath = secretsPath(workspacePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(filePath, JSON.stringify(encryptSecrets(values), null, 2), { encoding: 'utf8', mode: 0o600 })
}

function maskSecret(value: string): string {
  if (!value) return ''
  return '••••••••'
}

export function listBrokerSecretSummaries(workspacePath = getWorkspacePath()): Array<{ key: string; present: true; preview: string }> {
  if (!isSkillSecretBrokerConfigured()) return []
  return Object.entries(readSecrets(workspacePath))
    .filter(([, value]) => !!value)
    .map(([key, value]) => ({ key, present: true as const, preview: maskSecret(value) }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

export function putBrokerSecret(key: string, value: string, workspacePath = getWorkspacePath()): void {
  const normalizedKey = validateBrokerSecretKey(key)
  const normalizedValue = `${value || ''}`
  if (!normalizedValue) throw new Error('Secret value is required')
  const current = readSecrets(workspacePath)
  writeSecrets({ ...current, [normalizedKey]: normalizedValue }, workspacePath)
  appendAudit({ event: 'secret.updated', key: normalizedKey, status: 'success' }, workspacePath)
}

export function deleteBrokerSecret(key: string, workspacePath = getWorkspacePath()): void {
  const normalizedKey = validateBrokerSecretKey(key)
  const current = readSecrets(workspacePath)
  delete current[normalizedKey]
  writeSecrets(current, workspacePath)
  appendAudit({ event: 'secret.deleted', key: normalizedKey, status: 'success' }, workspacePath)
}

export function getSkillFingerprint(skillId: string): string {
  const skill = getSkillById(skillId)
  if (!skill) throw new Error(`Skill '${skillId}' not found`)
  const content = fs.readFileSync(skill.filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

export function getDeclaredSecretKeys(skillId: string): string[] {
  const skill = getSkillById(skillId)
  if (!skill) throw new Error(`Skill '${skillId}' not found`)
  const keys = [
    ...(skill.requires?.env || []),
    ...(skill.secretRequirements || []).map((requirement) => requirement.key),
  ].map(validateBrokerSecretKey)
  return Array.from(new Set(keys)).sort()
}

export function listSkillSecretGrants(workspacePath = getWorkspacePath()): SkillSecretGrant[] {
  try {
    const filePath = grantsPath(workspacePath)
    if (!fs.existsSync(filePath)) return []
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return Array.isArray(parsed?.grants) ? parsed.grants : []
  } catch {
    return []
  }
}

function writeGrants(grants: SkillSecretGrant[], workspacePath = getWorkspacePath()): void {
  const filePath = grantsPath(workspacePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, grants }, null, 2), { encoding: 'utf8', mode: 0o600 })
}

export function createSkillSecretGrant(input: {
  agentId: string
  skillId: string
  keys: string[]
  expiresAt?: string
}, workspacePath = getWorkspacePath()): SkillSecretGrant {
  requireMasterKey()
  const agentId = `${input.agentId || ''}`.trim()
  const skillId = `${input.skillId || ''}`.trim()
  if (!/^[a-z][a-z0-9_-]*$/.test(agentId)) throw new Error('Invalid agent id')
  if (!getAgentSkills(agentId).includes(skillId)) throw new Error(`Skill '${skillId}' is not assigned to agent '${agentId}'`)
  if (!FIXED_SKILL_ACTIONS[skillId]) throw new Error(`Skill '${skillId}' has no registered broker entrypoint`)

  const declared = new Set(getDeclaredSecretKeys(skillId))
  const keys = Array.from(new Set((input.keys || []).map(validateBrokerSecretKey))).sort()
  if (keys.length === 0) throw new Error('At least one secret key is required')
  const undeclared = keys.filter((key) => !declared.has(key))
  if (undeclared.length > 0) throw new Error(`Skill '${skillId}' did not declare: ${undeclared.join(', ')}`)
  const available = readSecrets(workspacePath)
  const missing = keys.filter((key) => !available[key])
  if (missing.length > 0) throw new Error(`Missing workspace-managed secrets: ${missing.join(', ')}`)

  const now = new Date().toISOString()
  const expiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : undefined
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) throw new Error('Grant expiration must be in the future')
  const grant: SkillSecretGrant = {
    id: crypto.randomUUID(),
    workspaceId: workspaceId(workspacePath),
    agentId,
    skillId,
    skillFingerprint: getSkillFingerprint(skillId),
    keys,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  }
  const grants = listSkillSecretGrants(workspacePath)
    .filter((existing) => !(existing.agentId === agentId && existing.skillId === skillId && !existing.revokedAt))
  writeGrants([...grants, grant], workspacePath)
  appendAudit({ event: 'grant.created', grantId: grant.id, agentId, skillId, keys, status: 'success' }, workspacePath)
  return grant
}

export function revokeSkillSecretGrant(grantId: string, workspacePath = getWorkspacePath()): SkillSecretGrant {
  const grants = listSkillSecretGrants(workspacePath)
  const index = grants.findIndex((grant) => grant.id === grantId)
  if (index < 0) throw new Error('Secret grant not found')
  grants[index] = { ...grants[index], revokedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  writeGrants(grants, workspacePath)
  appendAudit({ event: 'grant.revoked', grantId, agentId: grants[index].agentId, skillId: grants[index].skillId, status: 'success' }, workspacePath)
  return grants[index]
}

function resolveGrant(agentId: string, skillId: string, requestedKeys: string[], workspacePath = getWorkspacePath()): SkillSecretGrant {
  const grant = listSkillSecretGrants(workspacePath).find((candidate) =>
    candidate.workspaceId === workspaceId(workspacePath)
    && candidate.agentId === agentId
    && candidate.skillId === skillId
    && !candidate.revokedAt
  )
  if (!grant) throw new Error(`No active secret grant for skill '${skillId}' and agent '${agentId}'`)
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= Date.now()) throw new Error('Secret grant has expired')
  if (!getAgentSkills(agentId).includes(skillId)) throw new Error(`Skill '${skillId}' is no longer assigned to agent '${agentId}'`)
  if (grant.skillFingerprint !== getSkillFingerprint(skillId)) throw new Error(`Skill '${skillId}' changed and requires reauthorization`)
  const denied = requestedKeys.filter((key) => !grant.keys.includes(key))
  if (denied.length > 0) throw new Error(`Secret grant does not permit: ${denied.join(', ')}`)
  return grant
}

function redact(text: string, values: string[]): string {
  return values
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .reduce((output, value) => output.split(value).join('[REDACTED]'), text)
}

function appendAudit(event: Record<string, unknown>, workspacePath = getWorkspacePath()): void {
  const filePath = auditPath(workspacePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  fs.appendFileSync(filePath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`, { encoding: 'utf8', mode: 0o600 })
}

export function createBrokerCapabilityToken(agentId: string, workspacePath = getWorkspacePath(), ttlMs = DEFAULT_CAPABILITY_TTL_MS): string | undefined {
  const masterKey = getMasterKey()
  if (!masterKey) return undefined
  const payload: BrokerCapability = {
    version: 1,
    workspaceId: workspaceId(workspacePath),
    agentId,
    expiresAt: Date.now() + ttlMs,
    nonce: crypto.randomBytes(12).toString('base64url'),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', masterKey).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyBrokerCapabilityToken(token: string, workspacePath = getWorkspacePath()): BrokerCapability {
  const masterKey = requireMasterKey()
  const [encoded, providedSignature] = `${token || ''}`.split('.')
  if (!encoded || !providedSignature) throw new Error('Invalid broker capability')
  const expected = crypto.createHmac('sha256', masterKey).update(encoded).digest()
  const provided = Buffer.from(providedSignature, 'base64url')
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) throw new Error('Invalid broker capability')
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as BrokerCapability
  if (payload.version !== 1 || payload.workspaceId !== workspaceId(workspacePath) || payload.expiresAt <= Date.now()) {
    throw new Error('Expired or invalid broker capability')
  }
  if (!/^[a-z][a-z0-9_-]*$/.test(payload.agentId)) throw new Error('Invalid broker capability')
  return payload
}

export async function executeBrokeredSkill(input: {
  agentId: string
  skillId: string
  action: string
}, workspacePath = getWorkspacePath()): Promise<BrokerExecutionResult> {
  const skillId = `${input.skillId || ''}`.trim()
  const action = `${input.action || ''}`.trim()
  const definition = FIXED_SKILL_ACTIONS[skillId]?.[action]
  if (!definition) throw new Error(`Unknown brokered action '${action}' for skill '${skillId}'`)
  try {
    resolveGrant(input.agentId, skillId, definition.keys, workspacePath)
  } catch (error) {
    appendAudit({
      event: 'broker.denied',
      agentId: input.agentId,
      skillId,
      action,
      keys: definition.keys,
      status: 'denied',
    }, workspacePath)
    throw error
  }
  const stored = readSecrets(workspacePath)
  const resolved = Object.fromEntries(definition.keys.map((key) => [key, stored[key]]))
  const missing = definition.keys.filter((key) => !resolved[key])
  if (missing.length > 0) throw new Error(`Missing workspace-managed secrets: ${missing.join(', ')}`)
  const values = Object.values(resolved)

  const result = await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
    const child = spawn(definition.command, definition.args, {
      env: {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '',
        ...resolved,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      if (!settled) reject(new Error('Brokered skill action timed out'))
    }, definition.timeoutMs)
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(0, MAX_OUTPUT_BYTES) })
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(0, MAX_OUTPUT_BYTES) })
    child.once('error', (error) => {
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (exitCode) => {
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode })
    })
  })

  const output: BrokerExecutionResult = {
    ok: result.exitCode === 0,
    skillId,
    action,
    stdout: redact(result.stdout, values),
    stderr: redact(result.stderr, values),
    exitCode: result.exitCode,
    keysUsed: [...definition.keys],
  }
  appendAudit({
    event: 'broker.executed',
    agentId: input.agentId,
    skillId,
    action,
    keys: definition.keys,
    status: output.ok ? 'success' : 'failed',
    exitCode: output.exitCode,
  }, workspacePath)
  return output
}

export function getBrokerStatus(workspacePath = getWorkspacePath()) {
  return {
    configured: isSkillSecretBrokerConfigured(),
    workspaceId: workspaceId(workspacePath),
    secrets: listBrokerSecretSummaries(workspacePath),
    grants: listSkillSecretGrants(workspacePath),
    registeredSkills: Object.keys(FIXED_SKILL_ACTIONS),
  }
}

export const __test = {
  encryptSecrets,
  decryptSecrets,
  redact,
  resolveGrant,
  secretsPath,
  grantsPath,
  auditPath,
}
