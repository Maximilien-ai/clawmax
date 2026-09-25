import crypto from 'crypto'
import fs from 'fs'
import type { Request, Response } from 'express'
import { getWorkspaceManager } from '../lib/workspace-manager'
import { configuredTemplateResolverFromEnv } from '../lib/template-service'
import { inspectTemplateHostSkill } from '../lib/template-host-skill-inspection'
import { revalidateTemplateAuthority } from '../lib/template-authority'
import { templateStoragePath } from '../lib/template-storage-path'
import { runTemplateHostSkillRead } from '../lib/template-host-skill-tool'
import { runDevHostSkillAgent, runDevNoToolAgent } from '../lib/dev-host-skill-agent'
import { getSystemProviderKeys } from '../lib/dashboard-env'
import { isDashboardAuthBypassAllowed } from '../lib/http-security'
import { withRegisteredTurn } from '../lib/agent-turns'

const agentIdPattern = /^tr-[a-f0-9]{16}-agent-[a-f0-9]{12}$/
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function devHostSkillChatEnabled(env: NodeJS.ProcessEnv, origin: string | undefined, remoteAddress: string | undefined): boolean {
  return env.NODE_ENV !== 'production'
    && env.CLAWMAX_DEV_HOST_SKILL_CHAT === '1'
    && env.CLAWMAX_DEV_HOST_SKILL_AUTHORITY === '1'
    && env.DASHBOARD_APP_URL === 'http://localhost:5174'
    && isDashboardAuthBypassAllowed(env)
    && origin === 'http://localhost:5174'
    && loopback.has(remoteAddress || '')
    && /^[a-f0-9]{64}$/.test(env.CLAWMAX_DEV_HOST_AUTH_KEY || '')
    && !!env.CLAWMAX_DEV_HOST_ACTOR_ID
    && env.CLAWMAX_DEV_HOST_ACTOR_ID === env.CLAWMAX_CLI_LOCAL_ACTOR_ID
}

function enabled(req: Request): boolean {
  return devHostSkillChatEnabled(process.env, req.get('Origin'), req.socket.remoteAddress)
}

function readBoundFile(file: string, maxBytes: number): string {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
  try {
    const stat = fs.fstatSync(fd)
    if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) throw new Error('Bound Agent file unavailable')
    return fs.readFileSync(fd, 'utf8')
  } finally { fs.closeSync(fd) }
}

function resolve(agentId: string) {
  if (!agentIdPattern.test(agentId)) return null
  const workspaceId = process.env.CLAWMAX_DEV_HOST_WORKSPACE_ID || ''
  const actorId = process.env.CLAWMAX_DEV_HOST_ACTOR_ID || ''
  const manager = getWorkspaceManager()
  if (manager.getActiveWorkspaceId() !== workspaceId) return null
  const workspace = manager.getWorkspace(workspaceId)
  const resolver = configuredTemplateResolverFromEnv()
  if (!workspace || !resolver) return null
  const service = resolver({ workspaceId, workspacePath: workspace.path, actorId })
  const revisions = service.store.history().filter(revision => !revision.cleanedAt
    && revision.actorId === actorId && Object.values(revision.resources.agents).includes(agentId))
  if (revisions.length !== 1) return null
  const revision = revisions[0]
  const current = service.store.verifyExecutionResources(actorId, revision.id, agentId)
  if (!current.authority) return null
  revalidateTemplateAuthority(current.authority, current.authorityDigest, { workspaceId, actorId }, service.authority)
  const artifactId = Object.entries(revision.resources.agents).find(([, id]) => id === agentId)?.[0]
  const binding = revision.authority?.bindings.find(item => item.artifactId === artifactId)
  if (!binding || binding.skills.length > 1 || !binding.skills.length && binding.credentials.length) return null
  const identity = readBoundFile(templateStoragePath(workspace.path, `AGENTS/${agentId}/IDENTITY.md`), 32 * 1024)
  const soul = readBoundFile(templateStoragePath(workspace.path, `AGENTS/${agentId}/SOUL.md`), 32 * 1024)
  const skillName = binding.skills[0]?.name || null
  let skillInstructions = ''
  if (skillName) {
    const evidence = inspectTemplateHostSkill({ store: service.store, authority: service.authority,
      actorId, revisionId: revision.id, agentId, skillName })
    skillInstructions = readBoundFile(templateStoragePath(workspace.path, `SKILLS/custom/${skillName}/SKILL.md`), 64 * 1024)
    if (`sha256:${crypto.createHash('sha256').update(skillInstructions).digest('hex')}` !== evidence.skillDigest) return null
  }
  return { workspaceId, actorId, revisionId: revision.id, agentId, skillName,
    skillInstructions: `${identity}\n\n${soul}\n\n${skillInstructions}`, service }
}

/** Browser requests are only prompts. The server resolves immutable identity,
 * authority, Skill bytes, and the host key afresh for every tool call. */
export function isDevHostSkillChatReady(req: Request, agentId: string): boolean {
  if (!enabled(req)) return false
  try { return !!resolve(agentId) && !!getSystemProviderKeys().openai } catch { return false }
}

export async function executeDevHostSkillChat(req: Request, res: Response): Promise<void> {
  const { id: agentId } = req.params
  if (!enabled(req) || !agentIdPattern.test(agentId)) { res.status(404).json({ error: 'Dev Agent chat unavailable' }); return }
  const message = req.body?.message
  if (typeof message !== 'string' || !message.trim() || Buffer.byteLength(message) > 16 * 1024
    || req.body?.byok && Object.values(req.body.byok).some(Boolean)) {
    res.status(400).json({ error: 'Invalid dev Agent chat request' }); return
  }
  const openaiKey = getSystemProviderKeys().openai
  if (!openaiKey) { res.status(503).json({ error: 'Configured OpenAI model unavailable' }); return }
  let context: NonNullable<ReturnType<typeof resolve>>
  try {
    const resolved = resolve(agentId)
    if (!resolved) { res.status(409).json({ error: 'Dev Agent authority unavailable' }); return }
    context = resolved
  } catch { res.status(409).json({ error: 'Dev Agent authority unavailable' }); return }
  const sessionId = typeof req.body?.sessionId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(req.body.sessionId)
    ? req.body.sessionId : `dev-${crypto.randomUUID()}`
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
  const send = (type: string, data: unknown) => { if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify({ type, data })}\n\n`) }
  await withRegisteredTurn(agentId, async turn => {
    send('start', { sessionId, turnId: turn.turnId })
    try {
      const text = context.skillName ? await runDevHostSkillAgent({ message, skillName: context.skillName,
        skillInstructions: context.skillInstructions, apiKey: openaiKey, signal: turn.signal,
        invoke: async argv => {
          const fresh = resolve(agentId)
          if (!fresh || fresh.revisionId !== context.revisionId || fresh.skillName !== context.skillName) throw new Error('Dev Agent authority changed')
          if (!fresh.skillName) throw new Error('Dev Agent Skill unavailable')
          return runTemplateHostSkillRead({ instanceKey: process.env.CLAWMAX_INSTANCE_KEY || '',
            workspaceId: fresh.workspaceId, actorId: fresh.actorId, revisionId: fresh.revisionId,
            agentId, skillName: fresh.skillName, arguments: argv,
            hostKey: process.env.CLAWMAX_DEV_HOST_AUTH_KEY || '', signal: turn.signal,
            store: fresh.service.store, authority: fresh.service.authority,
            assertAuthorized: () => { if (turn.signal.aborted || !enabled(req) || getWorkspaceManager().getActiveWorkspaceId() !== fresh.workspaceId) throw new Error('Dev Agent authority revoked') },
          })
        },
      }) : await runDevNoToolAgent({ message, instructions: context.skillInstructions, apiKey: openaiKey, signal: turn.signal })
      if (turn.signal.aborted || !resolve(agentId)) throw new Error('Dev Agent authority revoked')
      send('delta', { text })
      send('complete', { text })
    } catch { send('error', { message: 'Dev Agent chat unavailable. Verify the host bridge, Skill sign-in, and current workspace.' }) }
  })
  if (!res.writableEnded) res.end()
}
