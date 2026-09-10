import crypto from 'crypto'
import express, { NextFunction, Request, Response } from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getOrCreateToken } from '../lib/auth'
import { getDashboardEnvRaw, getDashboardInstanceLabel } from '../lib/dashboard-env'
import { createCliSessionToken, getAuthenticatedSession, isGitHubAuthConfigured } from '../lib/github-auth'
import { isDashboardAuthBypassAllowed } from '../lib/http-security'
import { getRuntimeInstanceIdentity } from '../lib/opik'
import { getWorkspaceManager, Workspace } from '../lib/workspace-manager'
import { getDashboardVersion, listAgents } from '../lib/workspace'
import { listWorkflows } from '../lib/workflows'

const API_VERSION = 'clawmax.instance/v1'
const WORKSPACE_SCOPES = ['agents.read', 'agents.chat', 'workflows.run']
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const STATE_VERSION = 1

type Membership = { id: string; tenantId: string; role: string }
type CliActor = {
  actorId: string
  email: string
  displayName: string
  memberships: Membership[]
  workspaceIds?: string[]
}
type CreatedWorkspace = {
  workspaceId: string
  actorId: string
  membershipId: string
  tenantId: string
  createdAt: string
}
type IdempotencyRecord = {
  key: string
  actorId: string
  requestHash: string
  workspaceId: string
}
type CliState = {
  version: 1
  createdWorkspaces: CreatedWorkspace[]
  idempotency: IdempotencyRecord[]
  authSessions: Array<{ refreshHash: string; actor: CliActor; expiresAt: string }>
}

type AuthorizationCode = { actor: CliActor; challenge: string; redirectUri: string; expiresAt: number }
const authorizationCodes = new Map<string, AuthorizationCode>()

declare global {
  namespace Express {
    interface Request {
      clawmaxCliActor?: CliActor
    }
  }
}

function requestId(req: Request): string {
  const supplied = req.get('x-request-id')?.trim()
  return supplied && supplied.length <= 128 ? supplied : `req_${crypto.randomUUID()}`
}

function sendError(res: Response, req: Request, status: number, code: string, message: string, retryable = false) {
  return res.status(status).json({
    apiVersion: API_VERSION,
    kind: 'Error',
    requestId: requestId(req),
    error: { code, message, retryable },
  })
}

function safeId(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 128)
  return RESOURCE_ID.test(normalized) ? normalized : fallback
}

function localActor(): CliActor {
  const tenantId = safeId(process.env.CLAWMAX_TENANT_ID || '', 'tenant_local')
  return {
    actorId: safeId(process.env.CLAWMAX_CLI_LOCAL_ACTOR_ID || '', 'actor_local'),
    email: (process.env.CLAWMAX_CLI_LOCAL_ACTOR_EMAIL || 'operator@localhost').trim(),
    displayName: (process.env.CLAWMAX_CLI_LOCAL_ACTOR_NAME || 'Local operator').trim(),
    memberships: [{ id: safeId(process.env.CLAWMAX_CLI_LOCAL_MEMBERSHIP_ID || '', 'membership_local'), tenantId, role: 'owner' }],
  }
}

export function resolveCliActor(req: Request): CliActor | null {
  const session = getAuthenticatedSession(req)
  if (session) {
    if (session.enterprise) {
      return {
        actorId: safeId(session.userId, 'actor_enterprise'),
        email: session.email?.trim() || `${safeId(session.userId, 'actor')}@enterprise.local`,
        displayName: session.name?.trim() || session.login,
        memberships: [{
          id: safeId(session.enterprise.membershipId, 'membership_enterprise'),
          tenantId: safeId(session.enterprise.tenantId, 'tenant_enterprise'),
          role: 'member',
        }],
        workspaceIds: [session.enterprise.workspaceId],
      }
    }
    return {
      actorId: safeId(session.userId, 'actor_user'),
      email: session.email?.trim() || `${safeId(session.login, 'user')}@users.noreply.github.com`,
      displayName: session.name?.trim() || session.login,
      memberships: [{ id: 'membership_local', tenantId: safeId(process.env.CLAWMAX_TENANT_ID || '', 'tenant_local'), role: 'owner' }],
    }
  }

  if (isDashboardAuthBypassAllowed(process.env)) return localActor()
  const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '')
  if (match && match[1] === getOrCreateToken()) return localActor()
  return null
}

function requireCliAuth(req: Request, res: Response, next: NextFunction) {
  const actor = resolveCliActor(req)
  if (!actor) return sendError(res, req, 401, 'authentication_required', 'ClawMax instance authentication is required')
  req.clawmaxCliActor = actor
  next()
}

function statePath(): string {
  return process.env.CLAWMAX_CLI_API_STATE_PATH
    || path.join(process.env.HOME || os.homedir(), '.openclaw', 'clawmax-cli-api.json')
}

function emptyState(): CliState {
  return { version: STATE_VERSION, createdWorkspaces: [], idempotency: [], authSessions: [] }
}

function loadState(): CliState {
  const file = statePath()
  if (!fs.existsSync(file)) return emptyState()
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.createdWorkspaces) || !Array.isArray(parsed.idempotency)) {
    throw new Error('unsupported CLI API state')
  }
  return { ...parsed, authSessions: Array.isArray(parsed.authSessions) ? parsed.authSessions : [] }
}

function saveState(state: CliState): void {
  const file = statePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temporary, file)
}

export function selectCliMembership(actor: CliActor, membershipId?: string): Membership | null | 'ambiguous' {
  if (membershipId) return actor.memberships.find((entry) => entry.id === membershipId) || null
  return actor.memberships.length === 1 ? actor.memberships[0] : 'ambiguous'
}

function authorizedWorkspaceIds(actor: CliActor, state: CliState): Set<string> | null {
  if (!actor.workspaceIds) return null
  const ids = new Set(actor.workspaceIds)
  for (const entry of state.createdWorkspaces) {
    if (entry.actorId === actor.actorId && actor.memberships.some((membership) => membership.id === entry.membershipId)) {
      ids.add(entry.workspaceId)
    }
  }
  return ids
}

function authorizationFor(workspace: Workspace, actor: CliActor, state: CliState) {
  const explicit = state.createdWorkspaces.find((entry) => entry.workspaceId === workspace.id)
  const membership = explicit
    ? actor.memberships.find((entry) => entry.id === explicit.membershipId && entry.tenantId === explicit.tenantId)
    : actor.memberships[0]
  const allowedIds = authorizedWorkspaceIds(actor, state)
  if (!membership || (allowedIds && !allowedIds.has(workspace.id))) return null
  return {
    id: workspace.id,
    name: workspace.name,
    tenantId: membership.tenantId,
    membershipId: membership.id,
    role: membership.role,
    scopes: [...WORKSPACE_SCOPES],
  }
}

function strictWorkspaceCreate(body: unknown): { name: string; membershipId?: string; idempotencyKey: string } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const value = body as Record<string, unknown>
  const allowed = ['apiVersion', 'kind', 'name', 'membershipId', 'idempotencyKey']
  if (Object.keys(value).some((key) => !allowed.includes(key))) return null
  if (value.apiVersion !== API_VERSION || value.kind !== 'WorkspaceCreateRequest') return null
  if (typeof value.name !== 'string' || value.name !== value.name.trim() || !value.name || value.name.length > 128 || /[\r\n\0]/.test(value.name)) return null
  if (typeof value.idempotencyKey !== 'string' || !RESOURCE_ID.test(value.idempotencyKey)) return null
  if (value.membershipId !== undefined && (typeof value.membershipId !== 'string' || !RESOURCE_ID.test(value.membershipId))) return null
  if (!/[A-Za-z0-9]/.test(value.name)) return null
  return { name: value.name, membershipId: value.membershipId as string | undefined, idempotencyKey: value.idempotencyKey }
}

function originFor(req: Request): string {
  const configured = (process.env.CLAWMAX_CLI_AUTH_ISSUER || process.env.DASHBOARD_PUBLIC_URL || '').trim().replace(/\/$/, '')
  if (configured) return configured
  const host = (req.get('x-forwarded-host') || req.get('host') || 'localhost').split(',')[0].trim()
  return `https://${host}`
}

function instanceId(): string {
  const runtime = getRuntimeInstanceIdentity()
  return safeId(runtime.instanceKey || runtime.machineId || os.hostname(), 'inst_local')
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && keys.every((key) => expected.includes(key))
}

function loopbackRedirect(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:'
      && !parsed.username
      && !parsed.password
      && ['127.0.0.1', '::1'].includes(parsed.hostname)
  } catch {
    return false
  }
}

function base64urlSha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('base64url')
}

function refreshHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function issueTokenSession(actor: CliActor, state: CliState) {
  const refreshToken = crypto.randomBytes(48).toString('base64url')
  state.authSessions = state.authSessions.filter((entry) => Date.parse(entry.expiresAt) > Date.now())
  state.authSessions.push({
    refreshHash: refreshHash(refreshToken),
    actor,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  })
  saveState(state)
  return {
    apiVersion: API_VERSION,
    kind: 'TokenSession',
    accessToken: createCliSessionToken(actor),
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: 900,
    scopes: ['workspaces.read', ...WORKSPACE_SCOPES],
    instanceId: instanceId(),
    actorId: actor.actorId,
  }
}

export function createInstanceCliRouter() {
  const router = express.Router()
  const manager = getWorkspaceManager()

  router.get('/discovery', (req, res) => {
    const issuer = originFor(req)
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      apiVersion: API_VERSION,
      kind: 'InstanceDiscovery',
      instance: {
        id: instanceId(),
        name: getDashboardInstanceLabel(getDashboardEnvRaw()) || 'ClawMax',
        dashboardVersion: getDashboardVersion(),
      },
      auth: {
        issuer,
        authorizationEndpoint: `${issuer}/api/cli/v1/auth/authorize`,
        tokenEndpoint: `${issuer}/api/cli/v1/auth/token`,
        revocationEndpoint: `${issuer}/api/cli/v1/auth/revoke`,
        modes: ['authorization_code_pkce'],
      },
    })
  })

  router.get('/auth/authorize', (req, res) => {
    const allowedKeys = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state']
    if (Object.keys(req.query).some((key) => !allowedKeys.includes(key))
      || req.query.response_type !== 'code'
      || req.query.client_id !== 'clawmax-cli'
      || req.query.code_challenge_method !== 'S256'
      || typeof req.query.redirect_uri !== 'string'
      || !loopbackRedirect(req.query.redirect_uri)
      || typeof req.query.code_challenge !== 'string'
      || !/^[A-Za-z0-9_-]{43,128}$/.test(req.query.code_challenge)
      || typeof req.query.state !== 'string'
      || !req.query.state
      || req.query.state.length > 256) {
      return sendError(res, req, 400, 'invalid_authorization_request', 'PKCE authorization request is invalid')
    }

    const actor = resolveCliActor(req)
    if (!actor) {
      const returnTo = req.originalUrl
      if (isGitHubAuthConfigured()) return res.redirect(`/api/auth/github?return_to=${encodeURIComponent(returnTo)}`)
      return res.redirect(`/?return_to=${encodeURIComponent(returnTo)}`)
    }
    const code = crypto.randomBytes(32).toString('base64url')
    authorizationCodes.set(code, {
      actor,
      challenge: req.query.code_challenge,
      redirectUri: req.query.redirect_uri,
      expiresAt: Date.now() + 5 * 60 * 1000,
    })
    const callback = new URL(req.query.redirect_uri)
    callback.searchParams.set('code', code)
    callback.searchParams.set('state', req.query.state)
    res.setHeader('Cache-Control', 'no-store')
    return res.redirect(callback.toString())
  })

  router.post('/auth/token', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return sendError(res, req, 400, 'invalid_token_request', 'token request is invalid')
    }
    const body = req.body as Record<string, unknown>
    try {
      const state = loadState()
      if (body.grantType === 'authorization_code') {
        if (!exactKeys(body, ['grantType', 'clientId', 'code', 'redirectUri', 'codeVerifier'])
          || body.clientId !== 'clawmax-cli'
          || typeof body.code !== 'string'
          || typeof body.redirectUri !== 'string'
          || typeof body.codeVerifier !== 'string') {
          return sendError(res, req, 400, 'invalid_token_request', 'authorization code request is invalid')
        }
        const pending = authorizationCodes.get(body.code)
        authorizationCodes.delete(body.code)
        if (!pending || pending.expiresAt <= Date.now() || pending.redirectUri !== body.redirectUri
          || base64urlSha256(body.codeVerifier) !== pending.challenge) {
          return sendError(res, req, 400, 'invalid_grant', 'authorization code is invalid or expired')
        }
        return res.json(issueTokenSession(pending.actor, state))
      }
      if (body.grantType === 'refresh_token') {
        if (!exactKeys(body, ['grantType', 'clientId', 'refreshToken'])
          || body.clientId !== 'clawmax-cli'
          || typeof body.refreshToken !== 'string') {
          return sendError(res, req, 400, 'invalid_token_request', 'refresh request is invalid')
        }
        const suppliedHash = refreshHash(body.refreshToken)
        const index = state.authSessions.findIndex((entry) => entry.refreshHash === suppliedHash && Date.parse(entry.expiresAt) > Date.now())
        if (index < 0) return sendError(res, req, 400, 'invalid_grant', 'refresh credential is invalid or expired')
        const [session] = state.authSessions.splice(index, 1)
        return res.json(issueTokenSession(session.actor, state))
      }
      return sendError(res, req, 400, 'unsupported_grant_type', 'grant type is unsupported')
    } catch (error) {
      console.error('[Instance CLI] Token storage failed:', error)
      return sendError(res, req, 503, 'authentication_store_unavailable', 'authentication storage is unavailable', true)
    }
  })

  router.post('/auth/revoke', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || !exactKeys(req.body, ['clientId', 'token', 'tokenTypeHint'])
      || req.body.clientId !== 'clawmax-cli'
      || req.body.tokenTypeHint !== 'refresh_token'
      || typeof req.body.token !== 'string') {
      return sendError(res, req, 400, 'invalid_revocation_request', 'revocation request is invalid')
    }
    try {
      const state = loadState()
      const suppliedHash = refreshHash(req.body.token)
      state.authSessions = state.authSessions.filter((entry) => entry.refreshHash !== suppliedHash)
      saveState(state)
      return res.status(204).end()
    } catch (error) {
      console.error('[Instance CLI] Revocation storage failed:', error)
      return sendError(res, req, 503, 'authentication_store_unavailable', 'authentication storage is unavailable', true)
    }
  })

  router.get('/identity', requireCliAuth, (req, res) => {
    const actor = req.clawmaxCliActor!
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      apiVersion: API_VERSION,
      kind: 'Identity',
      actorId: actor.actorId,
      email: actor.email,
      displayName: actor.displayName,
      memberships: actor.memberships,
    })
  })

  router.get('/workspaces', requireCliAuth, (req, res) => {
    try {
      const actor = req.clawmaxCliActor!
      const state = loadState()
      const items = manager.listWorkspaces()
        .map((workspace) => authorizationFor(workspace, actor, state))
        .filter(Boolean)
      res.json({ apiVersion: API_VERSION, kind: 'WorkspaceList', items })
    } catch (error) {
      console.error('[Instance CLI] Failed to read authorized workspaces:', error)
      return sendError(res, req, 503, 'workspace_store_unavailable', 'workspace storage is unavailable', true)
    }
  })

  router.post('/workspaces', requireCliAuth, (req, res) => {
    const actor = req.clawmaxCliActor!
    const input = strictWorkspaceCreate(req.body)
    if (!input) return sendError(res, req, 400, 'invalid_request', 'workspace create request is invalid')
    if (req.get('idempotency-key') !== input.idempotencyKey) {
      return sendError(res, req, 409, 'idempotency_conflict', 'idempotency header and body must match')
    }
    const membership = selectCliMembership(actor, input.membershipId)
    if (membership === 'ambiguous') return sendError(res, req, 409, 'membership_ambiguous', 'membership must be selected explicitly')
    if (!membership) return sendError(res, req, 403, 'membership_forbidden', 'membership is not authorized')

    let createdWorkspace: Workspace | null = null
    try {
      const state = loadState()
      const requestHash = crypto.createHash('sha256').update(JSON.stringify({
        name: input.name,
        membershipId: membership.id,
      })).digest('hex')
      const replay = state.idempotency.find((entry) => entry.key === input.idempotencyKey && entry.actorId === actor.actorId)
      if (replay) {
        if (replay.requestHash !== requestHash) return sendError(res, req, 409, 'idempotency_conflict', 'idempotency key was used for another request')
        const workspace = manager.getWorkspace(replay.workspaceId)
        const authorized = workspace && authorizationFor(workspace, actor, state)
        if (!authorized) return sendError(res, req, 409, 'idempotency_conflict', 'idempotent workspace no longer exists')
        return res.status(200).json({ apiVersion: API_VERSION, kind: 'WorkspaceCreateResult', created: false, workspace: authorized })
      }

      if (manager.listWorkspaces().some((workspace) => workspace.name === input.name)) {
        return sendError(res, req, 409, 'workspace_name_conflict', 'workspace name already exists')
      }
      const root = process.env.CLAWMAX_WORKSPACES_ROOT
        || path.dirname(manager.getActiveWorkspace().path)
      const directory = safeId(input.name.toLowerCase().replace(/\s+/g, '-'), `workspace-${Date.now()}`)
      const workspace = manager.createWorkspace(input.name, path.join(root, directory))
      createdWorkspace = workspace
      const createdAt = new Date().toISOString()
      state.createdWorkspaces.push({
        workspaceId: workspace.id,
        actorId: actor.actorId,
        membershipId: membership.id,
        tenantId: membership.tenantId,
        createdAt,
      })
      state.idempotency.push({ key: input.idempotencyKey, actorId: actor.actorId, requestHash, workspaceId: workspace.id })
      saveState(state)
      const authorized = authorizationFor(workspace, actor, state)!
      return res.status(201).json({ apiVersion: API_VERSION, kind: 'WorkspaceCreateResult', created: true, workspace: authorized })
    } catch (error) {
      if (createdWorkspace) {
        try {
          manager.deleteWorkspace(createdWorkspace.id)
          fs.rmSync(createdWorkspace.path, { recursive: true, force: true })
        } catch (rollbackError) {
          console.error('[Instance CLI] Failed to roll back workspace creation:', rollbackError)
        }
      }
      console.error('[Instance CLI] Failed to create workspace:', error)
      return sendError(res, req, 503, 'workspace_store_unavailable', 'workspace storage is unavailable', true)
    }
  })

  router.get('/workspaces/:workspaceId/agents', requireCliAuth, async (req, res) => {
    try {
      const actor = req.clawmaxCliActor!
      const state = loadState()
      const workspace = manager.getWorkspace(req.params.workspaceId)
      if (!workspace || !authorizationFor(workspace, actor, state)) {
        return sendError(res, req, 403, 'workspace_forbidden', 'workspace access denied')
      }
      const agents = await manager.withWorkspace(workspace.id, () => listAgents())
      return res.json({
        apiVersion: API_VERSION,
        kind: 'AgentList',
        items: agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          description: '',
          status: agent.status,
          updatedAt: agent.lastHeartbeat || undefined,
        })),
      })
    } catch (error) {
      console.error('[Instance CLI] Failed to list workspace agents:', error)
      return sendError(res, req, 503, 'workspace_store_unavailable', 'workspace storage is unavailable', true)
    }
  })

  router.get('/workspaces/:workspaceId/workflows', requireCliAuth, async (req, res) => {
    try {
      const actor = req.clawmaxCliActor!
      const state = loadState()
      const workspace = manager.getWorkspace(req.params.workspaceId)
      if (!workspace || !authorizationFor(workspace, actor, state)) {
        return sendError(res, req, 403, 'workspace_forbidden', 'workspace access denied')
      }
      const workflows = await manager.withWorkspace(workspace.id, () => listWorkflows())
      return res.json({
        apiVersion: API_VERSION,
        kind: 'WorkflowList',
        items: workflows.map((workflow) => ({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          status: workflow.status || (workflow.enabled ? 'idle' : 'disabled'),
          updatedAt: workflow.modified || undefined,
        })),
      })
    } catch (error) {
      console.error('[Instance CLI] Failed to list workspace workflows:', error)
      return sendError(res, req, 503, 'workspace_store_unavailable', 'workspace storage is unavailable', true)
    }
  })

  router.use((req, res) => sendError(res, req, 404, 'route_not_found', 'CLI API route not found'))
  return router
}

export default createInstanceCliRouter()
