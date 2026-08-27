import express, { Router } from 'express'
import { execFileSync, execSync, spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import archiver from 'archiver'
import { listAgents, getAgentActivity, getNextAgentId, findFreePort, getAgentImpact, deleteAgent, cloneAgentFiles, getAgentGatewayConfig, parseGroups, parseIdentity, getWorkspacePath, getAgentsDir, ensureManagedAgentWorkspaceFiles } from '../lib/workspace'
import { generateAgentFiles, generateAgentMeta, generateArchiveTitle, withGenerationAttribution, withGenerationRuntimePin } from '../lib/ai-generator'
import { importAgentFromTemplate } from '../lib/templates'
import { getConfiguredGatewayPort, getGatewayClient, isGatewayConfigured, isGatewayRunning, probeGatewayResponsive } from '../lib/gateway-rpc'
import { listWorkflows, resolveParticipants } from '../lib/workflows'
import { safeEnv, userExecutionEnv, validatePort } from '../lib/safe-env'
import { validateAgentConfigSections, validateProvisionInput } from '../lib/agent-config-validation'
import type { AgentModelConfigUpdateResult } from '../lib/agent-model'
import {
  normalizeAgentModelInput,
  resetAgentSessionsForModelChange,
  updateAgentBackupModelInConfigFile,
  upsertAgentBackupModelInIdentityContent,
  upsertAgentModelFitInIdentityContent,
  upsertAgentModelInConfigFile,
  upsertAgentModelInIdentityContent,
  type AgentModelPreference,
  type AgentModelSelectionMode,
  upsertAgentRuntimeInIdentityContent,
} from '../lib/agent-model'
import { AGENT_RUNTIME_IDS, detectRuntimeStatuses, executeAgentRuntimeTurn, listRuntimeModels, normalizeAgentRuntime, resolveEnabledRuntimes, resolveWorkspaceRuntime, runtimeAcceptsModelId, runtimeLabel } from '../lib/agent-runtime'
import { hasRuntimeSession } from '../lib/runtime-sessions'
import { appendRuntimeTranscriptExchange, clearRuntimeTranscript, getLatestRuntimeTranscriptSessionId, hasRuntimeTranscripts, readRuntimeTranscript, readRuntimeTranscriptAsArchiveLines } from '../lib/runtime-transcripts'
import { validateAgentCostLimit } from '../lib/budget'
import {
  getSystemProviderKeys,
  getUserDefaultProviderKeys,
  getDashboardEnvRaw,
  getDefaultOllamaBaseUrl,
  isOllamaUiEnabled,
  resolveSystemExecutionProviderKeys,
} from '../lib/dashboard-env'
import { discoverModels, getAvailableModelsCached, clearModelCache } from '../lib/model-discovery'
import { recommendModelsForDescription, type ModelFitPreference } from '../lib/model-fit'
import { getPausedAgents, pauseAgents, resumeAgents, getAgentCostLimit, setAgentCostLimit, getAllAgentCostLimits } from '../lib/agent-state'
import { exportAgentToOpenClaw, getAgentTransferMetadata, importAgentFromBundleDirectory, importAgentFromOpenClaw, importAgentFromZipArchive, listImportableOpenClawAgents } from '../lib/openclaw-agent-transfer'
import { normalizeChatMessage } from '../lib/chat-normalization'
import { writeDashboardManagedOpenClawConfig } from '../lib/openclaw-config'
import { runExclusiveAgentExecution } from '../lib/agent-execution'
import { withRegisteredTurn } from '../lib/agent-turns'
import { scopeSessionIdToModel, resolveAgentExecutionConfig, resolvePersistedAgentSessionId } from '../lib/agent-execution'
import { resolveDefaultAgentModel } from '../lib/agent-default-model'
import { getAuthenticatedSession } from '../lib/github-auth'
import { getRequestDashboardInstanceId, traceAgentChat } from '../lib/opik'
import { resolveOpenClawCliPath } from '../lib/openclaw-cli'
import { buildNamedExportFilename } from '../lib/export-filename'
import { recordAgentLifecycleAuditEvent } from '../lib/agent-lifecycle-audit'
import { assertTenantResourceCapacity, tenantResourceLimitResponse } from '../lib/tenant-resource-limits'
import { listAvailableSkills, setAgentSkills } from '../lib/skills'
import {
  getArchiveTitleMessages,
  isArchiveSessionFile,
  isUsableArchiveTitle,
  parseArchiveTimestamp,
} from '../lib/chat-archives'
import { cancelProcessTree, detachProcessStreams } from '../lib/process-tree'

/** Find the root dir of a pnpm package by scanning .pnpm store for a prefix */
function findPnpmPkg(repoDir: string, prefix: string, pkgSubPath: string): string | null {
  const pnpmDir = path.join(repoDir, 'node_modules', '.pnpm')
  try {
    const entries = fs.readdirSync(pnpmDir)
    for (const e of entries) {
      if (!e.startsWith(prefix)) continue
      const candidate = path.join(pnpmDir, e, 'node_modules', pkgSubPath)
      if (fs.existsSync(path.join(candidate, 'lib', 'index.js'))) return candidate
    }
  } catch {}
  // Fallback: direct node_modules
  const direct = path.join(repoDir, 'node_modules', pkgSubPath)
  if (fs.existsSync(path.join(direct, 'lib', 'index.js'))) return direct
  return null
}

/** Detect Baileys and Boom paths from known openclaw repo locations */
function detectWaPaths(): { baileys: string | null; boom: string | null } {
  const HOME = process.env.HOME || ''
  // Search order: openclaw main repo, workspace itself
  const repoDirs = [
    path.join(HOME, 'github', 'maximilien', 'openclaw'),
    getWorkspacePath(),
  ]
  for (const dir of repoDirs) {
    const baileys = findPnpmPkg(dir, '@whiskeysockets+baileys', '@whiskeysockets/baileys')
    const boom = findPnpmPkg(dir, '@hapi+boom', '@hapi/boom')
    if (baileys && boom) return { baileys, boom }
  }
  return { baileys: null, boom: null }
}

/** Synchronous model list for validation — uses cached discovery or fallback */
function getAvailableModels(): string[] {
  return getAvailableModelsCached()
}

function isLocalRuntimeModel(model: string | undefined): boolean {
  return !!model && (model.startsWith('ollama/') || model.startsWith('openai-compatible/'))
}

function isHostedModel(model: string | undefined): boolean {
  return !!model && !isLocalRuntimeModel(model)
}

function resolveAgentProvisionCliPath(): string | null {
  const cliPath = resolveOpenClawCliPath()
  if (!cliPath) return null
  try {
    execFileSync(cliPath, ['--version'], { stdio: 'pipe', env: safeEnv() })
    return cliPath
  } catch {
    return null
  }
}

// buildModelsResponse removed — replaced by discoverModels() from model-discovery.ts

function updateAgentModelInConfig(agentId: string, model: string): AgentModelConfigUpdateResult {
  const HOME = process.env.HOME || ''
  const defaultConfigPath = path.join(HOME, '.openclaw', 'openclaw.json')
  const workspacePath = path.join(getWorkspacePath(), 'AGENTS', agentId)
  const runtimeAgentDir = path.join(HOME, '.openclaw', 'agents', agentId, 'agent')
  return upsertAgentModelInConfigFile(defaultConfigPath, agentId, model, {
    workspacePath,
    agentDir: runtimeAgentDir,
    name: agentId,
  })
}

function updateAgentBackupModelInConfig(agentId: string, backupModel: string | undefined): AgentModelConfigUpdateResult {
  const HOME = process.env.HOME || ''
  const defaultConfigPath = path.join(HOME, '.openclaw', 'openclaw.json')
  const workspacePath = path.join(getWorkspacePath(), 'AGENTS', agentId)
  return updateAgentBackupModelInConfigFile(defaultConfigPath, agentId, backupModel, {
    workspacePath,
  })
}

function updateAgentIdentityModel(identityPath: string, model: string) {
  const content = fs.readFileSync(identityPath, 'utf-8')
  fs.writeFileSync(identityPath, upsertAgentModelInIdentityContent(content, model), 'utf-8')
}

function syncAgentIdentityModels(
  identityContent: string,
  model: string,
  backupModel?: string,
  modelFit?: { selectionMode?: AgentModelSelectionMode; preference?: AgentModelPreference },
): string {
  return upsertAgentModelFitInIdentityContent(upsertAgentBackupModelInIdentityContent(
    upsertAgentModelInIdentityContent(identityContent, model),
    backupModel,
  ), modelFit?.selectionMode, modelFit?.preference)
}

function updateAgentIdentityRuntime(identityPath: string, runtime: string) {
  const content = fs.readFileSync(identityPath, 'utf-8')
  fs.writeFileSync(identityPath, upsertAgentRuntimeInIdentityContent(content, runtime), 'utf-8')
}

function resetAgentRuntimeForModelChange(agentId: string) {
  const HOME = process.env.HOME || ''
  const reset = resetAgentSessionsForModelChange(HOME, agentId)
  if (!reset.ok) {
    throw new Error(reset.error || `Failed to reset runtime sessions for ${agentId}`)
  }
}

function resetAgentRuntimeSessions(agentId: string) {
  const HOME = process.env.HOME || ''
  const reset = resetAgentSessionsForModelChange(HOME, agentId)
  if (!reset.ok) {
    throw new Error(reset.error || `Failed to reset runtime sessions for ${agentId}`)
  }
}

function summarizeAiGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '')
  const collectCauseMessages = (value: any, messages: string[] = []): string[] => {
    if (!value) return messages
    const nextMessage = value instanceof Error ? value.message : String(value || '')
    if (nextMessage) messages.push(nextMessage)
    if (value?.cause && value.cause !== value) {
      return collectCauseMessages(value.cause, messages)
    }
    return messages
  }
  const combined = collectCauseMessages(error).join('\n').trim()

  if (/getaddrinfo\s+ENOTFOUND\s+api\.openai\.com/i.test(combined)) {
    return 'Network error: the dashboard could not reach OpenAI. Check DNS or outbound network access and try again.'
  }

  if (/Connection error/i.test(message) && /fetch failed/i.test(combined)) {
    return 'Network error: the dashboard could not reach the AI provider. Check DNS, outbound network access, or provider base URL settings and try again.'
  }

  if (/timed out after/i.test(message)) {
    return 'AI generation timed out while contacting the configured provider. Try again, verify the provider key and system generation model, or choose a faster model.'
  }

  return message || 'AI generation failed.'
}

/**
 * Register a new agent via Gateway RPC
 *
 * Uses OpenClaw Gateway RPC for config modifications, which provides:
 * - Full Zod schema validation
 * - Automatic metadata stamping
 * - Environment variable preservation
 * - Merge patch conflict resolution
 * - Atomic writes with backups
 */
async function registerAgentInConfig(agentId: string, profile: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const HOME = process.env.HOME || ''
    const workspacePath = path.join(getWorkspacePath(), 'AGENTS', agentId)
    const agentDir = profile
      ? path.join(HOME, `.openclaw-${agentId}`, 'agents', agentId, 'agent')
      : path.join(HOME, '.openclaw', 'agents', agentId, 'agent')

    // Ensure agent directory exists
    fs.mkdirSync(agentDir, { recursive: true })

    if (profile) {
      // Profile mode: Must use direct write (Gateway doesn't support profile configs)
      console.warn(`⚠️  Profile mode: Using direct config write for agent ${agentId}`)

      const configPath = path.join(HOME, `.openclaw-${agentId}`, 'openclaw.json')

      if (!fs.existsSync(configPath)) {
        return { ok: false, error: `Config not found: ${configPath}` }
      }

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

      if (config.agents?.list?.some((a: any) => a.id === agentId)) {
        return { ok: true }
      }

      const newAgent = {
        id: agentId,
        name: agentId,
        workspace: workspacePath,
        agentDir
      }

      if (!config.agents) config.agents = {}
      if (!config.agents.list) config.agents.list = []
      config.agents.list.push(newAgent)

      writeDashboardManagedOpenClawConfig(configPath, config, `registerAgentInConfig(profile:${agentId})`)
      return { ok: true }
    }

    // Default mode: Use Gateway RPC
    const gateway = getGatewayClient()
    await gateway.registerAgent({
      id: agentId,
      name: agentId,
      workspace: workspacePath,
      agentDir
    })

    console.log(`✓ Successfully registered agent ${agentId} via Gateway RPC`)
    return { ok: true }
  } catch (err: any) {
    console.error(`Error registering agent ${agentId}:`, err)
    return { ok: false, error: err.message || String(err) }
  }
}

const router = Router()

type ProvisionGeneratedFiles = {
  identity: string
  soul: string
  tools: string
}

function collapseInlineWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function extractRoleTurns(transcript: string, role: 'user' | 'assistant' | 'system'): string[] {
  const lines = String(transcript || '').split('\n')
  const roleRe = /^(user|assistant|system)\s*:\s*(.*)$/i
  const collected: string[] = []
  let activeRole: string | null = null
  let buffer: string[] = []

  const flush = () => {
    if (activeRole?.toLowerCase() === role && buffer.length > 0) {
      const joined = collapseInlineWhitespace(buffer.join(' '))
      if (joined) collected.push(joined)
    }
    buffer = []
  }

  for (const line of lines) {
    const match = line.match(roleRe)
    if (match) {
      flush()
      activeRole = match[1]
      buffer.push(match[2] || '')
      continue
    }
    if (activeRole) {
      buffer.push(line)
    }
  }

  flush()
  return collected
}

function synthesizePromptOnlyDescription(aiDescription?: string): string | null {
  const raw = String(aiDescription || '')
  if (!raw.trim()) return null

  const userTurns = extractRoleTurns(raw, 'user')
  const userIntent = userTurns.length > 0 ? userTurns.join(' ') : raw
  const normalizedPrompt = collapseInlineWhitespace(userIntent)
  if (!normalizedPrompt) return null

  const synthesized = normalizedPrompt
    .replace(/\b(user|assistant|system)\s*:/gi, '')
    .replace(/\b(can you|please|build|create|make)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return synthesized ? synthesized.slice(0, 240) : null
}

function extractIdentityField(identityContent: string, label: string): string | null {
  const match = identityContent.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`, 'i'))
  return match?.[1] ? collapseInlineWhitespace(match[1]) : null
}

function extractFirstMeaningfulParagraph(markdown: string): string | null {
  const paragraphs = markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !/^#/.test(block))
    .filter((block) => !/^\*\*[^*]+:\*\*/.test(block))

  for (const paragraph of paragraphs) {
    const collapsed = collapseInlineWhitespace(
      paragraph
        .replace(/^[-*]\s+/gm, '')
        .replace(/`+/g, '')
    )
    if (collapsed.length >= 24) {
      return collapsed
    }
  }

  return null
}

export function synthesizeAgentAiDescription(
  aiDescription?: string,
  generatedFiles?: ProvisionGeneratedFiles
): string | null {
  if (generatedFiles?.identity) {
    const identity = generatedFiles.identity
    const name = extractIdentityField(identity, 'Name')
    const role = extractIdentityField(identity, 'Role')
      || extractIdentityField(identity, 'Creature')
    const mission = extractIdentityField(identity, 'Mission')
      || extractIdentityField(identity, 'Purpose')
      || extractFirstMeaningfulParagraph(identity)
      || extractFirstMeaningfulParagraph(generatedFiles.soul || '')

    const summaryParts = [name, role, mission].filter(Boolean) as string[]
    if (summaryParts.length > 0) {
      const summary = collapseInlineWhitespace(summaryParts.join(' — '))
      if (summary) return summary.slice(0, 240)
    }
  }

  return synthesizePromptOnlyDescription(aiDescription)
}

function getAgentSessionsDir(agentId: string, homeDir: string = process.env.HOME || ''): string {
  return path.join(homeDir, '.openclaw', 'agents', agentId, 'sessions')
}

function getAgentDashboardSessionKey(agentId: string): string {
  return `agent:${agentId}:dashboard-chat`
}

function resolveAgentChatSessionId(agentId: string, homeDir: string = process.env.HOME || ''): string | null {
  const resolvedAgent = resolveAgentExecutionConfig(agentId)
  const sessionKey = getAgentDashboardSessionKey(agentId)
  const preferredSessionId = scopeSessionIdToModel(sessionKey, resolvedAgent.model)
  const persisted = resolvePersistedAgentSessionId(agentId, sessionKey, preferredSessionId, homeDir)
  // claude/droid chats never write openclaw's sessions.json index, so their "current session"
  // pointer is the newest runtime transcript. Prefer the store that matches the agent's runtime
  // so switching runtimes shows that runtime's conversation, with the other store as fallback.
  const latestTranscript = getLatestRuntimeTranscriptSessionId(agentId)
  if (resolvedAgent.runtime && resolvedAgent.runtime !== 'openclaw') {
    return latestTranscript || persisted || null
  }
  return persisted || latestTranscript || null
}

function extractVisibleChatText(content: unknown): string {
  const contentArray = Array.isArray(content) ? content : [content]
  return contentArray
    .map((entry: any) => {
      if (typeof entry === 'string') return entry
      if (!entry || typeof entry !== 'object') return ''
      if (entry.type === 'text' && typeof entry.text === 'string') return entry.text
      if (typeof entry.text === 'string') return entry.text
      if (typeof entry.content === 'string') return entry.content
      if (Array.isArray(entry.content)) return extractVisibleChatText(entry.content)
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function parseVisibleChatMessages(jsonlContent: string): Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> {
  const lines = jsonlContent.trim().split('\n').filter((line) => line.trim())
  const messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> = []

  for (const line of lines) {
    try {
      const entry = JSON.parse(line)
      if (entry.type !== 'message' || !entry.message) continue
      const msg = entry.message
      if (!isVisibleChatRole(msg.role)) continue
      const content = normalizeChatMessage(extractVisibleChatText(msg.content))
      if (!content) continue
      messages.push({
        role: msg.role,
        content,
        timestamp: msg.timestamp || entry.timestamp || Date.now(),
      })
    } catch {
      continue
    }
  }

  return messages
}

function readChatSessionMessages(agentId: string, sessionId: string, homeDir: string = process.env.HOME || '') {
  const jsonlPath = path.join(getAgentSessionsDir(agentId, homeDir), `${sessionId}.jsonl`)
  if (!fs.existsSync(jsonlPath)) {
    return []
  }
  return parseVisibleChatMessages(fs.readFileSync(jsonlPath, 'utf-8'))
}

// Merges openclaw's own session JSONL (read above) with the runtime-transcripts store that
// claude/droid chat turns are appended to (see lib/runtime-transcripts.ts). Both stores are keyed
// by the same scoped session id, so a single agent's history can legitimately span both — e.g. an
// agent chatted with while pinned to openclaw, then re-pinned to droid under the same model. Sorted
// oldest-first (newest-last), matching the chronological order both individual stores already use.
function readMergedChatSessionMessages(agentId: string, sessionId: string, homeDir: string = process.env.HOME || '') {
  const openclawMessages = readChatSessionMessages(agentId, sessionId, homeDir)
  const runtimeMessages = readRuntimeTranscript(agentId, sessionId)
    .map((turn) => ({ role: turn.role, content: turn.content, timestamp: turn.ts }))
  if (runtimeMessages.length === 0) return openclawMessages
  return [...openclawMessages, ...runtimeMessages].sort((a, b) => a.timestamp - b.timestamp)
}

function getArchiveRestoreSessionId(agentId: string, homeDir: string = process.env.HOME || ''): string {
  const resolvedAgent = resolveAgentExecutionConfig(agentId)
  const sessionKey = getAgentDashboardSessionKey(agentId)
  const preferredSessionId = scopeSessionIdToModel(sessionKey, resolvedAgent.model)
  return resolvePersistedAgentSessionId(agentId, sessionKey, preferredSessionId, homeDir) || preferredSessionId
}

// GET /api/agents — list all agents with optional pagination
// Query params: ?limit=20&cursor=agent-id
router.get('/', (req, res) => {
  const { limit: limitStr, cursor } = req.query
  const allAgents = listAgents()

  // If no pagination params, return all agents (backward compatibility)
  if (!limitStr) {
    return res.json({ agents: allAgents })
  }

  const limit = parseInt(limitStr as string, 10) || 20

  // Find cursor position
  let startIndex = 0
  if (cursor && typeof cursor === 'string') {
    const cursorIndex = allAgents.findIndex(a => a.id === cursor)
    if (cursorIndex !== -1) {
      startIndex = cursorIndex + 1 // Start after the cursor
    }
  }

  // Slice agents for this page
  const agents = allAgents.slice(startIndex, startIndex + limit)

  // Determine next cursor (last agent ID in this batch)
  const hasMore = startIndex + limit < allAgents.length
  const nextCursor = hasMore && agents.length > 0 ? agents[agents.length - 1].id : null

  res.json({
    agents,
    hasMore,
    nextCursor,
    total: allAgents.length
  })
})

// GET /api/agents/next — next available ID + free port (must be before /:id)
// Query param: ?cloneFrom=agent_name to suggest {agent_name}N format
router.get('/next', async (req, res) => {
  const cloneFrom = req.query.cloneFrom as string | undefined
  const id = getNextAgentId(cloneFrom)

  // Extract number from ID for port calculation
  const numMatch = id.match(/(\d+)$/)
  const n = numMatch ? parseInt(numMatch[1], 10) : 0
  const port = await findFreePort(18889 + n * 100)

  res.json({ id, port })
})

// GET /api/agents/status — system status with agent counts
router.get('/status', async (req, res) => {
  const agents = listAgents()

  const { execSync } = require('child_process')
  let runningGateways = 0
  let gatewayAvailable = false

  // Check if openclaw CLI is available
  try {
    execSync('which openclaw', { encoding: 'utf-8' })
    gatewayAvailable = true
  } catch (err) {
    // openclaw not in PATH
  }

  // Count running gateways (look for openclaw gateway process)
  try {
    const result = execSync('ps aux | grep "openclaw.*gateway" | grep -v grep', { encoding: 'utf-8' })
    runningGateways = result.trim().split('\n').filter((line: string) => line.trim()).length
  } catch (err) {
    // No gateways running
  }

  const online = agents.filter(a => a.status === 'online').length
  const offline = agents.filter(a => a.status === 'offline').length
  const unknown = agents.filter(a => a.status === 'unknown').length

  res.json({
    total: agents.length,
    online,
    offline,
    unknown,
    runningGateways,
    gatewayAvailable,
    runtimes: detectRuntimeStatuses(resolveWorkspaceRuntime()),
    timestamp: new Date().toISOString(),
  })
})

// POST /api/agents/generate — AI-generate agent files
// If name is omitted, AI will suggest name, tags, and model
router.post('/generate', async (req, res) => {
  const { description, name, tags, suggestMeta, byokKeys, availableModels: requestedModels, modelPreference, runtime, model } = req.body as {
    description?: string
    name?: string
    tags?: string[]
    suggestMeta?: boolean
    availableModels?: string[]
    modelPreference?: ModelFitPreference
    // The runtime and model chosen for the agent being created. Generation runs on them, so the
    // files are written by the same CLI and model that will run the agent.
    runtime?: string
    model?: string
    byokKeys?: { openai?: string; anthropic?: string; gemini?: string; openrouter?: string; xai?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string }
  }

  if (!description) {
    res.status(400).json({ error: 'description is required' })
    return
  }

  const pinnedRuntime = normalizeAgentRuntime(runtime)
  const pinnedModel = String(model || '').trim()
  const generationPin = pinnedRuntime && pinnedRuntime !== 'openclaw'
    ? { runtime: pinnedRuntime, model: pinnedModel || undefined }
    : undefined

  if (generationPin) {
    // Fail here rather than in the generator. A pinned runtime is honored verbatim from this point
    // on, so an unusable pin has to be reported as the unusable pin it is — silently generating on
    // something else is the defect this whole path exists to fix.
    if (!resolveEnabledRuntimes().includes(generationPin.runtime)) {
      res.status(400).json({
        error: `The ${runtimeLabel(generationPin.runtime)} runtime is not enabled for this workspace. Enable it in Integrations first.`,
      })
      return
    }
    const status = detectRuntimeStatuses(resolveWorkspaceRuntime()).find(s => s.id === generationPin.runtime)
    if (!status?.installed) {
      res.status(400).json({
        error: `${runtimeLabel(generationPin.runtime)} is not installed in this deployment. ${status?.installHint || ''}`.trim(),
      })
      return
    }
    if (generationPin.model) {
      const runtimeCatalog = await listRuntimeModels(generationPin.runtime)
      if (!runtimeAcceptsModelId(runtimeCatalog, generationPin.model)) {
        res.status(400).json({
          error: `The ${runtimeLabel(generationPin.runtime)} runtime cannot run '${generationPin.model}'. Choose one of its own models (${runtimeCatalog.slice(0, 4).join(', ')}).`,
        })
        return
      }
    }
  }

  try {
    const session = getAuthenticatedSession(req)
    // Set BYOK keys for this request
    const { setRequestByokKeys } = require('../lib/ai-generator')
    setRequestByokKeys(byokKeys)

    // If suggestMeta or no name, generate suggestions first
    let suggestedName = name || ''
    let suggestedTags = tags || []
    let suggestedModel = ''
    let suggestedSkills: string[] = []

    if (suggestMeta || !name) {
      const meta = await withGenerationRuntimePin(generationPin, () => generateAgentMeta(description))
      if (!name) suggestedName = meta.name || 'new-agent'
      if (!tags || tags.length === 0) suggestedTags = meta.tags || []
      suggestedModel = meta.model || ''
      suggestedSkills = meta.skills || []
    }

    let runtimeModels = getAvailableModels()
    if (byokKeys && Object.values(byokKeys).some(value => typeof value === 'string' && value.trim())) {
      try {
        runtimeModels = (await discoverModels(byokKeys)).models || runtimeModels
      } catch {
        // The recommendation remains useful with system-visible models when a provider is temporarily unavailable.
      }
    }
    if (Array.isArray(requestedModels) && requestedModels.length > 0) {
      const visibleModels = new Set(runtimeModels)
      const requestedVisibleModels = requestedModels
        .map(model => String(model || '').trim())
        .filter(model => visibleModels.has(model))
      if (requestedVisibleModels.length > 0) runtimeModels = requestedVisibleModels
    }
    const modelRecommendation = recommendModelsForDescription({
      description,
      availableModels: runtimeModels,
      preference: ['quality', 'balanced', 'cost'].includes(String(modelPreference))
        ? modelPreference
        : 'balanced',
    })
    suggestedModel = modelRecommendation.recommendedModel || suggestedModel

    // Report who actually generated. Provider choice used to be invisible, so an operator with
    // CLI runtimes enabled could not tell a hosted key was being used until it failed. Attribution
    // is captured in async context so concurrent generations cannot report each other's provider.
    const { value: files, attribution: generatedBy } = await withGenerationAttribution(() =>
      withGenerationRuntimePin(generationPin, () => generateAgentFiles({
        description,
        name: suggestedName,
        tags: suggestedTags,
      })),
    )
    traceAgentChat('ai-generate-agent', description, `Generated agent scaffold for ${suggestedName || 'new agent'}`, {
      model: 'ai-generate-agent',
      provider: 'system',
      sessionId: `ai-generate-agent:${Date.now()}`,
      actorUserId: session?.userId,
      actorLogin: session?.login,
      actorEmail: session?.email || null,
      dashboardInstanceId: getRequestDashboardInstanceId(req),
    })
    res.json({
      ...files,
      suggestedName,
      suggestedTags,
      suggestedModel,
      suggestedSkills,
      modelRecommendation,
      generatedBy,
    })
  } catch (err) {
    console.error('AI generation error:', err)
    const message = summarizeAiGenerationError(err)
    if (/No API key configured/i.test(message)) {
      return res.status(400).json({
        error: 'AI generation needs a configured OpenAI, Anthropic, Gemini, or OpenAI-compatible setup, or a shared preferred model. Open Workspaces Integrations or Keys & Secrets first.',
      })
    }
    if (/developer API key|subscription or app credentials|does not look like/i.test(message)) {
      return res.status(400).json({ error: message })
    }
    res.status(500).json({ error: message })
  } finally {
    const { setRequestByokKeys } = require('../lib/ai-generator')
    setRequestByokKeys(undefined)
  }
})

// POST /api/agents/model-fit — advisory ranking over runtime-visible models.
router.post('/model-fit', async (req, res) => {
  const body = (req.body || {}) as {
    description?: string
    availableModels?: string[]
    runtime?: string
    preference?: ModelFitPreference
    byokKeys?: { openai?: string; anthropic?: string; gemini?: string; openrouter?: string; xai?: string; ollamaBaseUrl?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string }
  }
  const description = String(body.description || '').trim()
  if (!description) {
    res.status(400).json({ error: 'description is required' })
    return
  }
  const preference: ModelFitPreference = ['quality', 'balanced', 'cost'].includes(String(body.preference))
    ? body.preference as ModelFitPreference
    : 'balanced'
  let runtimeModels = getAvailableModels()
  if (body.byokKeys && Object.values(body.byokKeys).some(value => typeof value === 'string' && value.trim())) {
    try {
      runtimeModels = (await discoverModels(body.byokKeys)).models || runtimeModels
    } catch {
      // Use system-visible models and return an advisory result rather than failing the request.
    }
  }
  // A pinned CLI runtime's ids (claude's `sonnet`, droid's bare ids) are not in the provider
  // catalog, so intersecting against it dropped every candidate the client sent and silently fell
  // back to ranking provider models — the client-side scoping looked right while the panel still
  // recommended models the runtime cannot run.
  const fitRuntime = normalizeAgentRuntime((body as any).runtime)
  if (fitRuntime && fitRuntime !== 'openclaw') {
    const cliModels = await listRuntimeModels(fitRuntime)
    if (cliModels.length > 0) runtimeModels = cliModels
  }
  const runtimeModelSet = new Set(runtimeModels)
  const requestedModels = Array.isArray(body.availableModels)
    ? body.availableModels
      .map(model => String(model || '').trim())
      .filter(model => runtimeModelSet.has(model))
    : []
  res.json(recommendModelsForDescription({
    description,
    availableModels: requestedModels.length > 0 ? requestedModels : runtimeModels,
    preference,
  }))
})

// POST /api/agents/validate-provision — validate add-agent inputs before provisioning
router.post('/validate-provision', async (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>
  const byokKeys = {
    openai: typeof body.openai === 'string' ? body.openai : undefined,
    anthropic: typeof body.anthropic === 'string' ? body.anthropic : undefined,
    gemini: typeof body.gemini === 'string' ? body.gemini : undefined,
    openrouter: typeof body.openrouter === 'string' ? body.openrouter : undefined,
    xai: typeof body.xai === 'string' ? body.xai : undefined,
    ollamaBaseUrl: typeof body.ollamaBaseUrl === 'string' ? body.ollamaBaseUrl : undefined,
    openaiCompatibleApiKey: typeof body.openaiCompatibleApiKey === 'string' ? body.openaiCompatibleApiKey : undefined,
    openaiCompatibleBaseUrl: typeof body.openaiCompatibleBaseUrl === 'string' ? body.openaiCompatibleBaseUrl : undefined,
    openaiCompatibleDefaultModel: typeof body.openaiCompatibleDefaultModel === 'string' ? body.openaiCompatibleDefaultModel : undefined,
  }

  let availableModels = getAvailableModels()
  if (byokKeys.openai || byokKeys.anthropic || byokKeys.gemini || byokKeys.openrouter || byokKeys.xai || byokKeys.ollamaBaseUrl || byokKeys.openaiCompatibleBaseUrl) {
    try {
      availableModels = (await discoverModels(byokKeys)).models || availableModels
    } catch {
      // Fall back to cached/system-visible models if BYOK discovery is unavailable.
    }
  }

  // A runtime-pinned agent draws its model from that CLI's catalog, not the provider APIs.
  // Without this the review step warns that a perfectly valid droid model "is not currently
  // advertised" and may fall back — which is wrong and alarming.
  const pinnedRuntime = normalizeAgentRuntime(typeof body.runtime === 'string' ? body.runtime : undefined)
  const runtimeModels = pinnedRuntime ? await listRuntimeModels(pinnedRuntime) : []
  const result = validateProvisionInput(body || {}, {
    existingAgentIds: listAgents().map(agent => agent.id),
    availableModels: runtimeModels.length > 0 ? [...availableModels, ...runtimeModels] : availableModels,
  })
  res.json(result)
})

// GET /api/agents/models — dynamic discovery from provider APIs (cached 1hr)
// Must be defined before /:id routes.
router.get('/models', async (req, res) => {
  try {
    const byokKeys = {
      openai: req.query.openaiKey as string | undefined,
      anthropic: req.query.anthropicKey as string | undefined,
      gemini: req.query.geminiKey as string | undefined,
      openrouter: req.query.openrouterKey as string | undefined,
      xai: req.query.xaiKey as string | undefined,
      ollamaBaseUrl: req.query.ollamaBaseUrl as string | undefined,
      openaiCompatibleApiKey: req.query.openaiCompatibleApiKey as string | undefined,
      openaiCompatibleBaseUrl: req.query.openaiCompatibleBaseUrl as string | undefined,
      openaiCompatibleDefaultModel: req.query.openaiCompatibleDefaultModel as string | undefined,
    }
    const showAll = String(req.query.showAll || '').toLowerCase() === 'true'
    const result = await discoverModels(
      byokKeys.openai || byokKeys.anthropic || byokKeys.gemini || byokKeys.openrouter || byokKeys.xai || byokKeys.ollamaBaseUrl || byokKeys.openaiCompatibleBaseUrl ? byokKeys : undefined,
      { showAll }
    )
    res.json(result)
  } catch (err) {
    console.error('Model discovery failed:', err)
    res.status(500).json({ error: 'Failed to discover models' })
  }
})

// POST /api/agents/models/refresh — force-clear cache and re-fetch
router.post('/models/refresh', async (req, res) => {
  clearModelCache()
  try {
    const body = (req.body || {}) as { openai?: string; anthropic?: string; gemini?: string; openrouter?: string; xai?: string; ollamaBaseUrl?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string; showAll?: boolean }
    const byokKeys = {
      openai: body.openai,
      anthropic: body.anthropic,
      gemini: body.gemini,
      openrouter: body.openrouter,
      xai: body.xai,
      ollamaBaseUrl: body.ollamaBaseUrl,
      openaiCompatibleApiKey: body.openaiCompatibleApiKey,
      openaiCompatibleBaseUrl: body.openaiCompatibleBaseUrl,
      openaiCompatibleDefaultModel: body.openaiCompatibleDefaultModel,
    }
    const result = await discoverModels(
      byokKeys.openai || byokKeys.anthropic || byokKeys.gemini || byokKeys.openrouter || byokKeys.xai || byokKeys.ollamaBaseUrl || byokKeys.openaiCompatibleBaseUrl ? byokKeys : undefined,
      { showAll: body.showAll === true }
    )
    res.json(result)
  } catch (err) {
    console.error('Model refresh failed:', err)
    res.status(500).json({ error: 'Failed to refresh models' })
  }
})

// POST /api/agents/provision — spawn setup.sh and stream output via SSE
router.post('/provision', async (req, res) => {
  const { name, model, backupModel, whatsapp, port, profile, cloneFrom, templateSlug, generatedFiles, tags, aiDescription, skills, modelSelection, modelPreference, runtime } = req.body as {
    name?: string
    model?: string
    backupModel?: string
    whatsapp?: string
    port?: number
    profile?: boolean
    cloneFrom?: string
    templateSlug?: string
    generatedFiles?: { identity: string; soul: string; tools: string }
    tags?: string[]
    aiDescription?: string
    skills?: string[]
    modelSelection?: AgentModelSelectionMode
    modelPreference?: AgentModelPreference
    runtime?: string
  }
  const validatedModelSelection: AgentModelSelectionMode = modelSelection === 'auto' ? 'auto' : 'manual'
  const validatedModelPreference: AgentModelPreference = ['quality', 'balanced', 'cost'].includes(String(modelPreference))
    ? modelPreference as AgentModelPreference
    : 'balanced'
  const synthesizedAiDescription = synthesizeAgentAiDescription(aiDescription, generatedFiles)

  const existingAgents = listAgents()
  const requestedAgentAlreadyExists = typeof name === 'string' && existingAgents.some((agent) => agent.id === name)
  try {
    if (!requestedAgentAlreadyExists) assertTenantResourceCapacity('agents', existingAgents.length)
  } catch (error) {
    const limitResponse = tenantResourceLimitResponse(error)
    if (limitResponse) {
      res.status(limitResponse.statusCode).json(limitResponse.body)
      return
    }
    throw error
  }

  const resolvedModel = resolveDefaultAgentModel({
    explicitModel: model,
    builtIn: Array.isArray(tags) && tags.includes('built-in'),
    availableModels: getAvailableModels(),
    rawEnv: process.env as Record<string, string>,
  })

  if (!resolvedModel) {
    res.status(400).json({
      error: 'No default model could be resolved for this agent. Configure a provider key/runtime or choose a model explicitly.',
    })
    return
  }

  const provisionRuntime = normalizeAgentRuntime(runtime)
  const provisionRuntimeModels = provisionRuntime ? await listRuntimeModels(provisionRuntime) : []
  // Never write an agent whose pinned runtime cannot run its model. The pair was only checked at
  // chat time, so a mismatch reached disk and surfaced later as a runtime error on the agent's
  // first turn. Any API client can post this pair, not just the wizard.
  if (
    provisionRuntime && provisionRuntime !== 'openclaw'
    && provisionRuntimeModels.length > 0
    && !runtimeAcceptsModelId(provisionRuntimeModels, resolvedModel)
  ) {
    res.status(400).json({
      error: `The ${runtimeLabel(provisionRuntime)} runtime cannot run '${resolvedModel}'. Choose one of its own models (${provisionRuntimeModels.slice(0, 4).join(', ')}) or pick a different runtime.`,
    })
    return
  }
  const inputValidation = validateProvisionInput({ ...(req.body || {}), model: resolvedModel }, {
    existingAgentIds: existingAgents.map(agent => agent.id),
    availableModels: [...getAvailableModels(), ...provisionRuntimeModels],
  })

  if (!inputValidation.valid) {
    res.status(400).json({
      error: 'Validation failed',
      details: inputValidation.errors,
      warnings: inputValidation.warnings,
    })
    return
  }

  const validatedName = name!
  const validatedModel = resolvedModel
  const validatedBackupModel = backupModel ? normalizeAgentModelInput(backupModel) : undefined
  const availableSkillIds = new Set(listAvailableSkills().map((skill) => skill.id || skill.name).filter(Boolean))
  const requestedSkills = Array.isArray(skills)
    ? Array.from(new Set(skills.map((skill) => String(skill || '').trim()).filter((skill) => availableSkillIds.has(skill))))
    : []

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (type: string, data: string) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`)
  }

  const applyAssignedSkills = () => {
    if (requestedSkills.length === 0) return
    setAgentSkills(validatedName, requestedSkills)
    send('log', `Assigned selected skills: ${requestedSkills.join(', ')}\n`)
  }

  const writeGeneratedFilesToWorkspace = () => {
    if (!generatedFiles) return
    const dstPath = path.join(getAgentsDir(), validatedName)
    fs.mkdirSync(dstPath, { recursive: true })
    fs.writeFileSync(path.join(dstPath, 'IDENTITY.md'), syncAgentIdentityModels(
      generatedFiles.identity,
      validatedModel,
      validatedBackupModel,
      { selectionMode: validatedModelSelection, preference: validatedModelPreference },
    ))
    fs.writeFileSync(path.join(dstPath, 'SOUL.md'), generatedFiles.soul)
    fs.writeFileSync(path.join(dstPath, 'TOOLS.md'), generatedFiles.tools)
    send('log', `Wrote AI-generated files: IDENTITY.md, SOUL.md, TOOLS.md\n`)
  }

  const applyWorkspaceFiles = () => {
    if (templateSlug) {
      const result = importAgentFromTemplate(templateSlug, {
        newAgentId: validatedName,
        model: validatedModel,
        port,
        whatsapp,
        allowExistingTargetDir: true,
      })
      if (!result.ok) {
        throw new Error(result.error || 'Failed to import from template')
      }
      send('log', `Imported files from template: ${templateSlug}\n`)
      return
    }

    if (cloneFrom && /^[a-z][a-z0-9_-]*$/.test(cloneFrom)) {
      const srcPath = path.join(getAgentsDir(), cloneFrom)
      const dstPath = path.join(getAgentsDir(), validatedName)
      const copied = cloneAgentFiles(srcPath, dstPath, cloneFrom, validatedName)
      if (copied.length > 0) {
        send('log', `Cloned ${copied.length} file(s) from ${cloneFrom}: ${copied.join(', ')}\n`)
      }
      return
    }

    if (generatedFiles) {
      writeGeneratedFilesToWorkspace()
      return
    }

    const seeded = ensureManagedAgentWorkspaceFiles({
      agentId: validatedName,
      model: validatedModel,
      backupModel: validatedBackupModel,
      tags,
      workspacePath: getWorkspacePath(),
    })
    if (seeded.created.length > 0) {
      send('log', `Seeded default agent files: ${seeded.created.join(', ')}\n`)
    }
    if (seeded.updated.length > 0) {
      send('log', `Completed default agent fields: ${seeded.updated.join(', ')}\n`)
    }
  }

  const syncProvisionedAgentModels = () => {
    const identityPath = path.join(getAgentsDir(), validatedName, 'IDENTITY.md')
    const configUpdate = updateAgentModelInConfig(validatedName, validatedModel)
    if (!configUpdate.ok) {
      throw new Error(configUpdate.error || 'Failed to update live model config')
    }
    const backupConfigUpdate = updateAgentBackupModelInConfig(validatedName, validatedBackupModel)
    if (!backupConfigUpdate.ok) {
      throw new Error(backupConfigUpdate.error || 'Failed to update live backup model config')
    }
    if (fs.existsSync(identityPath)) {
      const identityContent = fs.readFileSync(identityPath, 'utf-8')
      fs.writeFileSync(identityPath, syncAgentIdentityModels(
        identityContent,
        configUpdate.model || validatedModel,
        backupConfigUpdate.backupModel,
        { selectionMode: validatedModelSelection, preference: validatedModelPreference },
      ), 'utf-8')
      // Persist the runtime pin chosen at creation. Without this the Add Agent wizard could not
      // set a runtime at all and every new agent silently started on OpenClaw.
      const provisionedRuntime = normalizeAgentRuntime(runtime)
      if (provisionedRuntime) updateAgentIdentityRuntime(identityPath, provisionedRuntime)
    }
    if (configUpdate.changed || backupConfigUpdate.changed) {
      resetAgentRuntimeForModelChange(validatedName)
    }
  }

  // Check if agent is already registered in openclaw.json
  const HOME = process.env.HOME || ''
  const configPath = path.join(HOME, '.openclaw', 'openclaw.json')
  let isRegistered = false
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list || []
    isRegistered = agentList.some((a: any) => a.id === validatedName)
  } catch {}

  if (isRegistered) {
    // Agent already registered - skip openclaw agents add
    send('log', `Agent "${validatedName}" is already registered\n`)
    try {
      applyWorkspaceFiles()
    } catch (err: any) {
      send('error', err.message || 'Failed to prepare agent workspace files')
      res.end()
      return
    }
    try {
      syncProvisionedAgentModels()
    } catch (err: any) {
      send('error', err.message || 'Failed to sync agent model settings')
      res.end()
      return
    }
    applyAssignedSkills()
    send('done', 'ok')
    res.end()
    return
  }

  // Build openclaw agents add command
  const workspaceArg = path.join(getWorkspacePath(), 'AGENTS', validatedName)
  const agentDirArg = path.join(process.env.HOME || '', '.openclaw', 'agents', validatedName, 'agent')

  // Ensure workspace directory exists before registering agent
  try {
    fs.mkdirSync(workspaceArg, { recursive: true })
    send('log', `Created workspace directory: ${workspaceArg}\n`)
  } catch (err: any) {
    send('error', `Failed to create workspace directory: ${err.message}`)
    res.end()
    return
  }

  // Get available models based on API keys
  const availableModels = getAvailableModels()

  // Normalize model name - ensure it has a provider prefix
  let normalizedModel = validatedModel
  // A CLI runtime's own catalog holds bare ids (droid's `glm-5.2`, Claude Code's `sonnet`) that
  // are not provider-qualified and must not be. Prefixing them would send `openai/sonnet` to the
  // CLI, which rejects it. Only normalise models destined for a provider.
  const isRuntimeCatalogModel = !!validatedModel && provisionRuntimeModels.includes(validatedModel)
  if (validatedModel && !validatedModel.includes('/') && !isRuntimeCatalogModel) {
    // Detect provider based on model name
    if (validatedModel.startsWith('claude-') || validatedModel.startsWith('anthropic-')) {
      normalizedModel = `anthropic/${validatedModel}`
    } else if (validatedModel.startsWith('gpt-') || validatedModel.startsWith('o1-') || validatedModel.startsWith('openai-')) {
      normalizedModel = `openai/${validatedModel}`
    } else if (validatedModel.startsWith('gemini-') || validatedModel.startsWith('gemini/') || validatedModel.startsWith('google/')) {
      if (validatedModel.startsWith('google/')) normalizedModel = validatedModel
      else if (validatedModel.startsWith('gemini/')) normalizedModel = validatedModel.replace(/^gemini\//, 'google/')
      else normalizedModel = `google/${validatedModel}`
    } else if (validatedModel.startsWith('ollama/') || validatedModel.includes(':')) {
      normalizedModel = validatedModel.startsWith('ollama/') ? validatedModel : `ollama/${validatedModel}`
    } else {
      // Default to openai for unknown models
      normalizedModel = `openai/${validatedModel}`
    }
    send('log', `Normalized model from "${validatedModel}" to "${normalizedModel}"\n`)
  }

  // Validate model is available - if not, use a sensible fallback
  // A model from the pinned runtime's own catalog is available by definition — it just is not a
  // hosted provider model. Without this guard the fallback below swaps it for a hosted one and
  // the agent is provisioned against a model its CLI cannot run.
  if (!isRuntimeCatalogModel && normalizedModel && availableModels.length > 0 && !availableModels.includes(normalizedModel) && !availableModels.includes(normalizedModel.replace(/^(anthropic|openai|gemini|google|ollama)\//, ''))) {
    const fallbackModel = availableModels.find(m => m.includes('/')) || availableModels[0]
    const availableHostedModels = availableModels.filter((candidate) => isHostedModel(candidate))
    if (isHostedModel(normalizedModel) && availableHostedModels.length === 0) {
      send('log', `Using preferred hosted model: "${normalizedModel}"\n`)
    } else {
      send('log', `⚠️  Model "${normalizedModel}" is not available with system API keys\n`)
      send('log', `Using fallback model: "${fallbackModel}"\n`)
      normalizedModel = fallbackModel
    }
  }
  // When no system keys configured (BYOK-only), trust the client's model choice
  if (availableModels.length === 0 && normalizedModel) {
    send('log', `Using BYOK model: ${normalizedModel}\n`)
  }
  // Ultimate fallback if no model at all
  if (!normalizedModel) {
    normalizedModel = 'anthropic/claude-sonnet-4-20250514'
    send('log', `No model specified, using default: ${normalizedModel}\n`)
  }

  const args: string[] = ['agents', 'add', validatedName, '--workspace', workspaceArg, '--agent-dir', agentDirArg, '--non-interactive']
  if (normalizedModel) args.push('--model', normalizedModel)
  // --port is not supported by openclaw agents add command
  // --whatsapp is not supported by current openclaw agents add builds; WhatsApp is linked later via the pairing route.
  // Profile support removed - not currently used

  send('start', `Creating agent: ${validatedName}`)

  // Helper: save creation metadata to IDENTITY.md
  function saveCreationMetadata() {
    try {
      const identityPath = path.join(getAgentsDir(), validatedName, 'IDENTITY.md')
      let identityContent = fs.readFileSync(identityPath, 'utf-8')

      if (identityContent.includes('## Creation Metadata')) {
        send('log', 'Creation Metadata already exists in IDENTITY.md, skipping\n')
      } else {
        const metadata = `

## Creation Metadata

- **Created:** ${new Date().toISOString()}
- **Created By:** ClawMax Dashboard
- **Model:** ${normalizedModel || model || 'default'}
- **Backup Model:** ${validatedBackupModel || 'N/A'}
- **Tags:** ${tags && tags.length > 0 ? tags.join(', ') : 'N/A'}
- **Cloned From:** ${cloneFrom || 'N/A'}
- **AI Description:** ${synthesizedAiDescription || 'N/A'}
`
        identityContent += metadata
        fs.writeFileSync(identityPath, identityContent)
        send('log', 'Saved creation metadata to IDENTITY.md\n')
      }
    } catch (err: any) {
      send('log', `Warning: Could not save metadata: ${err.message}\n`)
    }
  }

  // Check if openclaw CLI is available
  const openclawCliPath = resolveAgentProvisionCliPath()
  const hasOpenclawCli = !!openclawCliPath

  if (!hasOpenclawCli) {
    // Register agent without CLI — just ensure directory structure exists
    send('log', `Registering agent without openclaw CLI...\n`)

    try {
      // Ensure agent dir exists in ~/.openclaw/agents/<name>/agent/
      fs.mkdirSync(agentDirArg, { recursive: true })

      // Create a minimal config.yaml for the agent
      const configPath = path.join(agentDirArg, '..', 'config.yaml')
      if (!fs.existsSync(configPath)) {
        const configContent = [
          `name: ${validatedName}`,
          `model: ${normalizedModel || 'anthropic/claude-sonnet-4-20250514'}`,
          `workspace: ${workspaceArg}`,
          `created: ${new Date().toISOString()}`,
        ].join('\n')
        fs.writeFileSync(configPath, configContent, 'utf-8')
        send('log', `Wrote agent config: ${configPath}\n`)
      }

      send('log', `Agent ${validatedName} registered successfully (without openclaw CLI)\n`)
      send('log', `ℹ️  Install openclaw CLI for full agent management: brew tap maximilien-ai/openclaw && brew install openclaw\n`)
    } catch (err: any) {
      send('error', `Failed to register agent: ${err.message}`)
      res.end()
      return
    }

    try {
      applyWorkspaceFiles()
      syncProvisionedAgentModels()
    } catch (err: any) {
      send('error', `Failed to prepare agent workspace files: ${err.message}`)
      res.end()
      return
    }

    send('log', `Agent ${validatedName} created successfully\n`)
    applyAssignedSkills()
    saveCreationMetadata()
    send('done', 'ok')
    res.end()
    return
  }

  // openclaw CLI available — use it
  send('log', `Command: ${openclawCliPath} ${args.join(' ')}\n`)

  const child = spawn(openclawCliPath!, args, {
    cwd: getWorkspacePath(),
    env: safeEnv({ TERM: 'dumb' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Send SSE comment pings every 2s to keep the proxy connection alive during long runs
  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch {}
  }, 2000)

  const cleanup = () => clearInterval(keepalive)

  child.stdout!.on('data', (chunk: Buffer) => send('log', chunk.toString()))
  child.stderr!.on('data', (chunk: Buffer) => send('log', chunk.toString()))

  child.on('close', (code, signal) => {
    cleanup()
    if (code === 0) {
      try {
        applyWorkspaceFiles()
        syncProvisionedAgentModels()
      } catch (err: any) {
        send('error', `Failed to prepare agent workspace files: ${err.message}`)
        send('done', 'post-provision file setup failed')
        res.end()
        return
      }
      send('log', `Agent ${validatedName} created successfully\n`)
      applyAssignedSkills()
      saveCreationMetadata()
      send('done', 'ok')
    } else {
      send('done', signal ? `killed by signal ${signal}` : `exit code ${code}`)
    }
    res.end()
  })

  child.on('error', (err) => {
    cleanup()
    send('error', err.message)
    res.end()
  })

  // Don't kill setup.sh if the browser/proxy drops — let it always run to completion
  req.on('close', () => { cleanup() })
})

// POST /api/agents/doctor — comprehensive agent health check and repair
router.post('/doctor', async (req, res) => {
  const { fix = false, probe = false } = req.body || {}
  const results: Array<{ id: string; checks: Array<{ check: string; status: 'pass' | 'fail' | 'fixed' | 'warn'; message: string }> }> = []
  const platformChecks: Array<{ check: string; status: 'pass' | 'fail' | 'fixed' | 'warn'; message: string }> = []

  // Check if openclaw CLI is available
  let hasOpenclawCli = false
  const openclawCliPath = resolveOpenClawCliPath()
  let platformMessage: string | undefined
  let gatewayFixOutput: string | undefined
  let gatewayRecovery: {
    attempted: boolean
    status: 'not-needed' | 'not-attempted' | 'restarted' | 'unavailable' | 'failed'
    message: string
  } | undefined
  let providerExecution: {
    status: 'configured' | 'partial' | 'missing'
    message: string
  } | undefined
  const isManagedRuntime = Object.keys(getDashboardEnvRaw()).length === 0
  const summarizeDoctorGatewayMessage = (text: string | undefined): string | undefined => {
    const raw = String(text || '').trim()
    if (!raw) return undefined
    const disabledMessage = summarizeGatewayDisabledRuntime(raw)
    if (disabledMessage) return disabledMessage
    if (isManagedRuntime) {
      const lines = raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !/^start with:/i.test(line))
        .filter((line) => !/openclaw gateway install/i.test(line))
        .filter((line) => !/openclaw gateway\b/i.test(line))
        .filter((line) => !/systemctl --user\b/i.test(line))
      return lines[0] || 'Gateway is unavailable in this managed runtime. Start or enable it from the instance runtime configuration.'
    }
    return raw
  }
  const summarizeGatewayDisabledRuntime = (text: string): string | null => {
    const normalized = text.toLowerCase()
    if (!normalized) return null
    if (
      normalized.includes('gateway service disabled') ||
      normalized.includes('systemd user services are unavailable') ||
      normalized.includes('run the gateway under your supervisor') ||
      normalized.includes('if you\'re in a container')
    ) {
      return isManagedRuntime
        ? 'Gateway is not active in this managed instance runtime. Auto-Fix cannot keep a long-running gateway alive from the browser; start it from the instance startup or supervisor configuration.'
        : 'Gateway is configured but disabled. Start or enable it in the local runtime before retrying.'
    }
    return null
  }
  try {
    if (!openclawCliPath) throw new Error('missing')
    const { execFileSync } = require('child_process')
    const versionText = String(execFileSync(openclawCliPath, ['--version'], { stdio: 'pipe', env: safeEnv() }) || '').trim()
    if (versionText.includes('openclaw fixture')) {
      platformMessage = 'OpenClaw CLI resolves to a fixture runtime instead of a real build.'
    } else {
      hasOpenclawCli = true
    }
  } catch (err: any) {
    const stderr = String(err?.stderr || err?.stdout || err?.message || '')
    if (stderr.includes('missing dist/entry')) {
      platformMessage = 'OpenClaw is installed but its build output is missing. Rebuild the image with a built runtime.'
    }
  }

  // Per-runtime CLI detection (claude/droid) — informational only; the openclaw-cli check above
  // remains the sole source of truth for hasOpenclawCli/platformMessage. Only warn when a
  // non-openclaw runtime is missing AND it's the workspace's active default (otherwise it's an
  // optional/unused CLI and shouldn't affect doctor's overall healthy status).
  for (const status of detectRuntimeStatuses(resolveWorkspaceRuntime())) {
    if (status.id === 'openclaw') continue
    platformChecks.push({
      check: `runtime-${status.id}`,
      status: status.installed ? 'pass' : (status.active ? 'warn' : 'pass'),
      message: status.installed
        ? `${status.label} CLI installed${status.version ? ` (${status.version})` : ''}${status.active ? ' — active workspace default' : ''}`
        : status.active
          ? `${status.label} CLI not installed, but it is the active workspace runtime default. ${status.installHint}`
          : `${status.label} CLI not installed (not the active runtime, optional). ${status.installHint}`,
    })
  }

  const rawEnv = getDashboardEnvRaw()
  const sharedProviderKeys = resolveSystemExecutionProviderKeys(rawEnv)
  const configuredHostedProviders = [
    sharedProviderKeys.openai ? 'OpenAI' : null,
    sharedProviderKeys.anthropic ? 'Anthropic' : null,
    sharedProviderKeys.gemini ? 'Gemini' : null,
  ].filter(Boolean) as string[]
  const openAiCompatibleBaseUrl = String(sharedProviderKeys.openaiCompatibleBaseUrl || '').trim()
  const openAiCompatibleApiKey = String(sharedProviderKeys.openaiCompatibleApiKey || '').trim()
  const ollamaUiEnabled = isOllamaUiEnabled(rawEnv)
  const ollamaBaseUrl = getDefaultOllamaBaseUrl(rawEnv)

  if (configuredHostedProviders.length > 0) {
    providerExecution = {
      status: 'configured',
      message: `Shared hosted provider execution is configured for ${configuredHostedProviders.join(', ')}.`,
    }
    platformChecks.push({
      check: 'provider-execution',
      status: 'pass',
      message: providerExecution.message,
    })
  } else if (openAiCompatibleBaseUrl) {
    providerExecution = {
      status: openAiCompatibleApiKey ? 'configured' : 'partial',
      message: openAiCompatibleApiKey
        ? `Shared OpenAI-compatible runtime is configured at ${openAiCompatibleBaseUrl}.`
        : `Shared OpenAI-compatible runtime is configured at ${openAiCompatibleBaseUrl}, but no shared API key is set for runtimes that require authentication.`,
    }
    platformChecks.push({
      check: 'provider-execution',
      status: openAiCompatibleApiKey ? 'pass' : 'warn',
      message: providerExecution.message,
    })
  } else if (ollamaUiEnabled && ollamaBaseUrl) {
    providerExecution = {
      status: 'partial',
      message: `No shared hosted provider credentials are configured; this runtime is expected to use the local Ollama path at ${ollamaBaseUrl}.`,
    }
    platformChecks.push({
      check: 'provider-execution',
      status: 'warn',
      message: providerExecution.message,
    })
  } else {
    providerExecution = {
      status: 'missing',
      message: 'No shared model execution path is configured for this runtime. Add hosted provider credentials or configure a local runtime path in BYOK / workspace integrations.',
    }
    platformChecks.push({
      check: 'provider-execution',
      status: 'fail',
      message: providerExecution.message,
    })
  }

  const gatewayStatus = isGatewayRunning()
  const gatewayProbe = await probeGatewayResponsive()
  const gatewayPort = gatewayProbe.port ?? gatewayStatus.port ?? getConfiguredGatewayPort()
  const gatewayRunning = gatewayStatus.running
  let effectiveGatewayRunning = gatewayProbe.running

  if (gatewayProbe.running) {
    const message = `Gateway authenticated on port ${gatewayPort ?? 'unknown'}`
    gatewayRecovery = { attempted: false, status: 'not-needed', message }
    platformChecks.push({ check: 'gateway', status: 'pass', message })
  } else if (gatewayRunning) {
    effectiveGatewayRunning = true
    const probeError = String(gatewayProbe.error || '').trim()
    const authMismatch = /token mismatch|unauthorized/i.test(probeError)
    const message = authMismatch
      ? `Gateway is reachable on port ${gatewayPort ?? 'unknown'}, but the dashboard's admin probe is using a different token than the runtime gateway token`
      : `Gateway is reachable on port ${gatewayPort ?? 'unknown'}, but the dashboard's admin probe could not complete${probeError ? `: ${probeError}` : ''}`
    gatewayRecovery = { attempted: false, status: 'not-needed', message }
    platformChecks.push({
      check: 'gateway',
      status: 'pass',
      message,
    })
  } else if (fix && hasOpenclawCli) {
    try {
      const restartOutput = String(execFileSync(openclawCliPath!, ['gateway', 'restart'], { stdio: 'pipe', timeout: 20000, env: safeEnv() }) || '').trim()
      gatewayFixOutput = restartOutput || 'Gateway restart command completed with no output.'
      const restartedStatus = isGatewayRunning()
      const restartedProbe = await probeGatewayResponsive()
      effectiveGatewayRunning = restartedProbe.running
      if (effectiveGatewayRunning) {
        const message = `Gateway restarted and authenticated on port ${restartedProbe.port ?? restartedStatus.port ?? getConfiguredGatewayPort() ?? 'unknown'}`
        gatewayRecovery = { attempted: true, status: 'restarted', message }
        platformChecks.push({ check: 'gateway', status: 'fixed', message })
      } else {
        const disabledMessage = summarizeGatewayDisabledRuntime(restartOutput)
        const restartedPort = restartedProbe.port ?? restartedStatus.port ?? getConfiguredGatewayPort() ?? 'unknown'
        const restartedAuthMismatch = /token mismatch|unauthorized/i.test(String(restartedProbe.error || ''))
        const message = disabledMessage || (isManagedRuntime
          ? 'Gateway restart was attempted, but the gateway is still unavailable in this runtime.'
          : restartedStatus.running
            ? (restartedAuthMismatch
              ? `Gateway is reachable on port ${restartedPort} after restart, but the dashboard admin probe is using a different token than the runtime gateway token`
              : `Gateway is reachable on port ${restartedPort} after restart, but the dashboard admin probe is still unavailable${restartedProbe.error ? `: ${restartedProbe.error}` : ''}`)
            : `Gateway restart command ran but gateway is still not running on port ${restartedPort}`)
        gatewayRecovery = { attempted: true, status: disabledMessage || isManagedRuntime ? 'unavailable' : (restartedStatus.running ? 'restarted' : 'failed'), message }
        platformChecks.push({
          check: 'gateway',
          status: restartedStatus.running ? 'fixed' : 'warn',
          message,
        })
      }
    } catch (err: any) {
      const reason = String(err?.stderr || err?.stdout || err?.message || '').trim().split('\n')[0] || 'gateway restart failed'
      gatewayFixOutput = String(err?.stderr || err?.stdout || err?.message || '').trim()
      const disabledMessage = summarizeGatewayDisabledRuntime(gatewayFixOutput)
      const message = disabledMessage || (isManagedRuntime
        ? `Gateway restart failed in this runtime: ${reason}`
        : `Gateway restart failed: ${reason}`)
      gatewayRecovery = { attempted: true, status: disabledMessage ? 'unavailable' : 'failed', message }
      platformChecks.push({
        check: 'gateway',
        status: 'warn',
        message
      })
    }
  } else {
    const message = hasOpenclawCli
      ? (isManagedRuntime
        ? 'Gateway is not running in this instance runtime.'
        : `Gateway not running on port ${gatewayPort ?? 'unknown'}`)
      : 'Gateway not running and openclaw CLI is unavailable for auto-fix'
    gatewayRecovery = { attempted: false, status: 'not-attempted', message }
    platformChecks.push({
      check: 'gateway',
      status: hasOpenclawCli ? 'warn' : 'fail',
      message,
    })
  }

  // Read registered agents from openclaw.json
  const registeredIds = new Set<string>()
  const agentConfigs = new Map<string, any>()
  try {
    const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list || []
    for (const agent of agentList) {
      if (agent.id) {
        registeredIds.add(agent.id)
        agentConfigs.set(agent.id, agent)
      }
    }
  } catch {}

  // Scan workspace agents directory
  const agentsDir = getAgentsDir()
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(agentsDir, { withFileTypes: true })
  } catch {
    res.json({
      results,
      platform: { cli: hasOpenclawCli, gateway: effectiveGatewayRunning, gatewayPort, gatewayRecovery, providerExecution },
      summary: {
        total: platformChecks.length,
        pass: platformChecks.filter(c => c.status === 'pass').length,
        fail: platformChecks.filter(c => c.status === 'fail').length,
        warn: platformChecks.filter(c => c.status === 'warn').length,
        fixed: platformChecks.filter(c => c.status === 'fixed').length,
      },
      healthy: platformChecks.every(c => c.status === 'pass' || c.status === 'fixed'),
      message: [platformMessage, summarizeDoctorGatewayMessage(gatewayFixOutput)].filter(Boolean).join('\n\n') || 'No agents directory found'
    })
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.name === 'archive') continue

    const agentId = entry.name
    const agentDir = path.join(agentsDir, agentId)
    const checks: Array<{ check: string; status: 'pass' | 'fail' | 'fixed' | 'warn'; message: string }> = []

    // Check 1: IDENTITY.md exists
    const identityPath = path.join(agentDir, 'IDENTITY.md')
    if (fs.existsSync(identityPath)) {
      checks.push({ check: 'identity', status: 'pass', message: 'IDENTITY.md exists' })
    } else {
      checks.push({ check: 'identity', status: 'fail', message: 'IDENTITY.md missing' })
    }

    // Check 2: Registered with CLI
    if (registeredIds.has(agentId)) {
      checks.push({ check: 'registered', status: 'pass', message: 'Registered in openclaw.json' })
    } else if (fix && hasOpenclawCli) {
      const workspaceArg = path.join(getWorkspacePath(), 'AGENTS', agentId)
      const agentDirArg = path.join(process.env.HOME || '', '.openclaw', 'agents', agentId, 'agent')
      try {
        fs.mkdirSync(agentDirArg, { recursive: true })
        if (!openclawCliPath) throw new Error('OpenClaw CLI unavailable')
        const { execFileSync } = require('child_process')
        execFileSync(
          openclawCliPath,
          ['agents', 'add', agentId, '--workspace', workspaceArg, '--agent-dir', agentDirArg, '--non-interactive'],
          { encoding: 'utf-8', stdio: 'pipe', timeout: 15000, env: safeEnv() }
        )
        checks.push({ check: 'registered', status: 'fixed', message: 'Registered with openclaw CLI' })
      } catch (err: any) {
        checks.push({ check: 'registered', status: 'fail', message: `Registration failed: ${err.message?.split('\n')[0]}` })
      }
    } else {
      checks.push({ check: 'registered', status: 'fail', message: 'Not registered in openclaw.json' + (hasOpenclawCli ? ' — run doctor with fix=true' : ' — install openclaw CLI first') })
    }

    // Check 3: Agent directory in ~/.openclaw/agents/
    const homeAgentDir = path.join(process.env.HOME || '', '.openclaw', 'agents', agentId)
    if (fs.existsSync(homeAgentDir)) {
      checks.push({ check: 'agent-dir', status: 'pass', message: 'Agent directory exists' })
    } else {
      checks.push({ check: 'agent-dir', status: 'warn', message: 'No ~/.openclaw/agents/' + agentId + ' directory' })
    }

    // Check 4: Sessions directory
    const sessionsDir = path.join(homeAgentDir, 'sessions')
    if (fs.existsSync(sessionsDir)) {
      checks.push({ check: 'sessions', status: 'pass', message: 'Sessions directory exists' })
    } else {
      if (fix) {
        try { fs.mkdirSync(sessionsDir, { recursive: true }); checks.push({ check: 'sessions', status: 'fixed', message: 'Created sessions directory' }) }
        catch { checks.push({ check: 'sessions', status: 'warn', message: 'Sessions directory missing' }) }
      } else {
        checks.push({ check: 'sessions', status: 'warn', message: 'Sessions directory missing' })
      }
    }

    // Check 5: Skills assigned
    if (fs.existsSync(identityPath)) {
      try {
        const identity = fs.readFileSync(identityPath, 'utf-8')
        const skillsMatch = identity.match(/skills?[:\s]+([^\n]+)/i)
        if (skillsMatch) {
          checks.push({ check: 'skills', status: 'pass', message: `Skills: ${skillsMatch[1].trim().slice(0, 80)}` })
        } else {
          checks.push({ check: 'skills', status: 'pass', message: 'No extra skills configured' })
        }
      } catch {
        checks.push({ check: 'skills', status: 'warn', message: 'Cannot read skills from IDENTITY.md' })
      }
    }

    // Check 6: Health probe (optional — sends a test message)
    if (probe && hasOpenclawCli && registeredIds.has(agentId)) {
      try {
        const result = execFileSync(
          openclawCliPath!,
          ['agent', '--agent', agentId, '--message', 'health check - respond with OK', '--json', '--local'],
          { encoding: 'utf-8', stdio: 'pipe', timeout: 30000, env: safeEnv() },
        )
        // Check if we got a response (in stdout or stderr-extracted)
        if (result.includes('"payloads"') || result.includes('"text"')) {
          checks.push({ check: 'probe', status: 'pass', message: 'Agent responded to health probe' })
        } else {
          checks.push({ check: 'probe', status: 'warn', message: 'Agent returned empty response' })
        }
      } catch (err: any) {
        checks.push({ check: 'probe', status: 'fail', message: `Health probe failed: ${err.message?.split('\n')[0]?.slice(0, 100)}` })
      }
    }

    results.push({ id: agentId, checks })
  }

  // Summary
  const allChecks = [...platformChecks, ...results.flatMap(r => r.checks)]
  const pass = allChecks.filter(c => c.status === 'pass').length
  const fail = allChecks.filter(c => c.status === 'fail').length
  const warn = allChecks.filter(c => c.status === 'warn').length
  const fixed = allChecks.filter(c => c.status === 'fixed').length

  res.json({
    results,
    platform: {
      cli: hasOpenclawCli,
      gateway: effectiveGatewayRunning,
      gatewayPort,
      gatewayRecovery,
      providerExecution,
    },
    summary: { total: allChecks.length, pass, fail, warn, fixed },
    healthy: fail === 0,
    message: [
      platformMessage,
      summarizeDoctorGatewayMessage(gatewayFixOutput),
      !effectiveGatewayRunning && isManagedRuntime
        ? 'This looks like a managed or container runtime. Start or enable the gateway in the instance runtime configuration instead of using local machine commands.'
        : undefined,
    ].filter(Boolean).join('\n\n') || undefined,
  })
})

// POST /api/agents/bulk-impact — get impact summary for bulk delete
router.post('/bulk-impact', (req, res) => {
  const { agents: agentsToDelete } = req.body as { agents?: Array<{ id: string; archived?: boolean }> }

  if (!agentsToDelete || !Array.isArray(agentsToDelete) || agentsToDelete.length === 0) {
    return res.status(400).json({ error: 'agents array is required' })
  }

  // Validate all agent IDs
  for (const agent of agentsToDelete) {
    if (!/^[a-z][a-z0-9_-]*$/.test(agent.id)) {
      return res.status(400).json({ error: `Invalid agent id: ${agent.id}` })
    }
  }

  const allAgents = listAgents()
  const impacts: Record<string, any> = {}
  const notFound: string[] = []

  for (const agentToDelete of agentsToDelete) {
    const agent = allAgents.find(a => a.id === agentToDelete.id && a.archived === (agentToDelete.archived || false))
    if (!agent) {
      notFound.push(agentToDelete.id)
      continue
    }
    impacts[agentToDelete.id] = getAgentImpact(agentToDelete.id, agent.workspacePath)
  }

  // Calculate totals
  let totalCommunities = 0
  let totalGroups = 0
  let totalTodos = 0
  const allCommunities = new Set<string>()
  const allGroups = new Set<string>()

  for (const impact of Object.values(impacts)) {
    totalTodos += impact.todoCount || 0
    totalCommunities += impact.communityCount || 0
    totalGroups += impact.groupCount || 0
  }

  res.json({
    impacts,
    notFound,
    summary: {
      agentCount: agentsToDelete.length - notFound.length,
      totalCommunities,
      totalGroups,
      totalTodos
    }
  })
})

// DELETE /api/agents/bulk — bulk delete multiple agents
router.delete('/bulk', (req, res) => {
  const { agents: agentsToDelete, removeStateDir } = req.body as { agents?: Array<{ id: string; archived?: boolean }>; removeStateDir?: boolean }

  if (!agentsToDelete || !Array.isArray(agentsToDelete) || agentsToDelete.length === 0) {
    return res.status(400).json({ error: 'agents array is required' })
  }

  // Validate all agent IDs
  for (const agent of agentsToDelete) {
    if (!/^[a-z][a-z0-9_-]*$/.test(agent.id)) {
      return res.status(400).json({ error: `Invalid agent id: ${agent.id}` })
    }
  }

  const results: Record<string, { ok: boolean; steps: string[]; errors: string[] }> = {}
  let successCount = 0
  let failureCount = 0

  for (const agent of agentsToDelete) {
    const result = deleteAgent(agent.id, removeStateDir === true, agent.archived || false)
    results[agent.id] = { ok: result.errors.length === 0, ...result }

    if (result.errors.length === 0) {
      successCount++
    } else {
      failureCount++
    }
  }

  res.json({
    ok: failureCount === 0,
    results,
    summary: {
      total: agentsToDelete.length,
      success: successCount,
      failure: failureCount
    }
  })
})

// DELETE /api/agents/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params
  const { removeStateDir } = req.body as { removeStateDir?: boolean }
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    res.status(400).json({ ok: false, error: 'Invalid agent id' })
    return
  }
  const result = deleteAgent(id, removeStateDir === true)
  res.json({ ok: result.errors.length === 0, ...result })
})

// GET /api/agents/:id/impact — impact summary for delete confirmation
router.get('/:id/impact', (req, res) => {
  const { id } = req.params
  const agents = listAgents()
  const agent = agents.find(a => a.id === id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  const impact = getAgentImpact(id, agent.workspacePath)
  res.json(impact)
})


// GET /api/agents/usage — get token usage for all agents
router.get('/usage', async (req, res) => {
  const days = parseInt(req.query.days as string) || 30

  try {
    const gatewayStatus = isGatewayRunning()
    if (!isGatewayConfigured() || !gatewayStatus.running) {
      return res.json({
        agentUsage: {},
        days,
        error: 'Gateway unavailable or no usage data',
        details: gatewayStatus.port
          ? `Gateway not running on port ${gatewayStatus.port}`
          : 'Gateway not configured',
      })
    }

    const gateway = getGatewayClient()

    // Call sessions.usage with days param
    const result = await gateway.call('sessions.usage', { days })

    // Extract agent usage from aggregates
    const agentUsage: Record<string, any> = {}
    if (result.aggregates?.byAgent) {
      for (const entry of result.aggregates.byAgent) {
        agentUsage[entry.agentId] = {
          totalTokens: entry.totals.totalTokens || 0,
          inputTokens: entry.totals.input || 0,
          outputTokens: entry.totals.output || 0,
          cacheReadTokens: entry.totals.cacheRead || 0,
          cacheWriteTokens: entry.totals.cacheWrite || 0,
          totalCost: entry.totals.totalCost || 0,
        }
      }
    }

    res.json({ agentUsage, days })
  } catch (err: any) {
    // Suppress expected errors: no gateway config, missing admin scope
    if (!err.message?.includes('missing scope: operator.admin') && !err.message?.includes('Gateway not available')) {
      console.error('Failed to fetch agent usage:', err.message)
    }

    // Return empty usage data instead of error to prevent UI breakage
    // Gateway might not be available or usage data might not exist yet
    res.json({
      agentUsage: {},
      days,
      error: 'Gateway unavailable or no usage data',
      details: err.message
    })
  }
})

// GET /api/agents/cost-limits — get all per-agent cost limits (before /:id to avoid route conflict)
router.get('/cost-limits', (_req, res) => {
  res.json({ limits: getAllAgentCostLimits() })
})

// GET /api/agents/:id — single agent
router.get('/:id', (req, res) => {
  const agents = listAgents()
  const agent = agents.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(agent)
})

// GET /api/agents/:id/identity — fetch IDENTITY.md with parsed metadata
router.get('/:id/identity', (req, res) => {
  const { id } = req.params
  const identityPath = path.join(getAgentsDir(), id, 'IDENTITY.md')

  if (!fs.existsSync(identityPath)) {
    return res.status(404).json({ error: 'IDENTITY.md not found' })
  }

  const content = fs.readFileSync(identityPath, 'utf-8')
  const runtimeIdentity = parseIdentity(content)

  // Parse creation metadata if it exists
  const metadata: any = {}

  // Runtime pin (e.g. `- **Runtime:** claude`) lives above Creation Metadata, alongside Model —
  // reuse parseIdentity's regex instead of duplicating it. Absent when the agent has no pin
  // (falls back to the workspace default at execution time via resolveAgentRuntime).
  const parsedIdentityRuntime = normalizeAgentRuntime(parseIdentity(content).runtime)
  if (parsedIdentityRuntime) metadata.runtime = parsedIdentityRuntime

  const metadataMatch = content.match(/## Creation Metadata\s+([\s\S]*?)(?=\n##|\n---|$)/i)
  if (metadataMatch) {
    const metadataSection = metadataMatch[1]

    // Parse each metadata field
    const createdMatch = metadataSection.match(/\*\*Created:\*\*\s+(.+)/i)
    const modelMatch = metadataSection.match(/\*\*Model:\*\*\s+(.+)/i)
    const backupModelMatch = metadataSection.match(/\*\*Backup Model:\*\*\s+(.+)/i)
    const tagsMatch = metadataSection.match(/\*\*Tags:\*\*\s+(.+)/i)
    const clonedFromMatch = metadataSection.match(/\*\*Cloned From:\*\*\s+(.+)/i)
    const aiDescriptionMatch = metadataSection.match(/\*\*AI Description:\*\*\s+(.+)/i)

    if (createdMatch) metadata.created = createdMatch[1].trim()
    if (modelMatch) metadata.model = modelMatch[1].trim()
    if (backupModelMatch) {
      const backupModel = backupModelMatch[1].trim()
      metadata.backupModel = backupModel !== 'N/A' ? backupModel : null
    }
    if (tagsMatch) {
      const tagsStr = tagsMatch[1].trim()
      metadata.tags = tagsStr !== 'N/A' ? tagsStr.split(',').map(t => t.trim()) : []
    }
    if (clonedFromMatch) {
      const clonedFrom = clonedFromMatch[1].trim()
      metadata.clonedFrom = clonedFrom !== 'N/A' ? clonedFrom : null
    }
    if (aiDescriptionMatch) {
      const aiDesc = aiDescriptionMatch[1].trim()
      metadata.aiDescription = aiDesc !== 'N/A' ? aiDesc : null
    }
  }

  // Get live configuration from openclaw.json (authoritative source)
  let liveConfig: any = {}
  try {
    const resolvedAgent = resolveAgentExecutionConfig(id)
    if (resolvedAgent.workspace || resolvedAgent.agentDir || resolvedAgent.model) {
      liveConfig = {
        model: resolvedAgent.model || metadata.model,
        backupModel: resolvedAgent.backupModel || metadata.backupModel || undefined,
        workspace: resolvedAgent.workspace,
        agentDir: resolvedAgent.agentDir
      }
      if (resolvedAgent.model) {
        metadata.model = resolvedAgent.model
      }
      if (resolvedAgent.backupModel) {
        metadata.backupModel = resolvedAgent.backupModel
      }
    }
  } catch (err) {
    // If we can't read live config, fall back to IDENTITY.md metadata
  }

  res.json({
    content,
    metadata,
    liveConfig,
    modelFit: {
      selectionMode: runtimeIdentity.modelSelection === 'auto' ? 'auto' : 'manual',
      preference: ['quality', 'balanced', 'cost'].includes(runtimeIdentity.modelPreference)
        ? runtimeIdentity.modelPreference
        : 'balanced',
    },
  })
})

// POST /api/agents/:id/restart — restart agent gateway process
router.post('/:id/restart', async (req, res) => {
  const { id } = req.params

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ ok: false, error: 'Invalid agent id' })
  }

  const agents = listAgents()
  const agent = agents.find(a => a.id === id)
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  try {
    // Get agent's gateway config to find the process
    const gatewayConfig = getAgentGatewayConfig(id)
    if (!gatewayConfig) {
      return res.status(404).json({ ok: false, error: 'Gateway config not found' })
    }

    const port = validatePort(gatewayConfig.port || 18889)

    // Kill existing process on this port
    try {
      // Find and kill process on port (port validated as numeric above)
      const pid = execFileSync('lsof', [`-ti:${port}`], { encoding: 'utf-8' }).trim()
      if (pid && /^\d+(\n\d+)*$/.test(pid)) {
        for (const processId of pid.split('\n')) execFileSync('kill', ['-9', processId])
      }
    } catch (err) {
      // Process might not be running, that's okay
    }

    // Small delay to ensure port is freed
    await new Promise(resolve => setTimeout(resolve, 500))

    // Start new gateway process
    const HOME = process.env.HOME || ''
    const profileStateDir = path.join(HOME, `.openclaw-${id}`)
    const isProfile = fs.existsSync(profileStateDir)
    const stateDir = isProfile ? profileStateDir : path.join(HOME, '.openclaw')

    const gatewayPath = path.join(stateDir, 'openclaw.json')

    // Start gateway in background using openclaw CLI
    const profileFlag = isProfile ? ['--profile', id] : []
    const child = spawn('openclaw', [...profileFlag, 'gateway', 'install'], {
      cwd: agent.workspacePath,
      env: safeEnv({ OPENCLAW_STATE_DIR: stateDir }),
      detached: true,
      stdio: 'ignore',
    })

    child.unref()

    res.json({ ok: true, message: `Agent ${id} restarted successfully`, port })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/agents/:id/activity — file activity + key docs for the detail panel
router.get('/:id/activity', (req, res) => {
  const agents = listAgents()
  const agent = agents.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  const activity = getAgentActivity(agent.workspacePath, agent.id)
  res.json(activity)
})

// DELETE /api/agents/:id/whatsapp — unlink: delete credentials dir + clear WA line from IDENTITY.md
router.delete('/:id/whatsapp', (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    res.status(400).json({ ok: false, error: 'Invalid agent id' })
    return
  }

  const HOME = process.env.HOME || ''
  const profileStateDir = path.join(HOME, `.openclaw-${id}`)
  const isProfile = fs.existsSync(profileStateDir)
  const stateDir = isProfile ? profileStateDir : path.join(HOME, '.openclaw')
  const credsDir = path.join(stateDir, 'credentials', 'whatsapp', 'default')

  const steps: string[] = []
  const errors: string[] = []

  // Remove credentials directory
  try {
    if (fs.existsSync(credsDir)) {
      fs.rmSync(credsDir, { recursive: true, force: true })
      steps.push(`Removed credentials: ${credsDir}`)
    } else {
      steps.push('No credentials directory found')
    }
  } catch (e) {
    errors.push(`Failed to remove credentials: ${e}`)
  }

  // Remove WhatsApp line from IDENTITY.md
  const identityPath = path.join(getAgentsDir(), id, 'IDENTITY.md')
  try {
    if (fs.existsSync(identityPath)) {
      let content = fs.readFileSync(identityPath, 'utf-8')
      const before = content
      content = content.replace(/^[^\n]*WhatsApp[^\n]*\n?/gim, '')
      if (content !== before) {
        fs.writeFileSync(identityPath, content, 'utf-8')
        steps.push('Removed WhatsApp line from IDENTITY.md')
      }
    }
  } catch (e) {
    errors.push(`Failed to update IDENTITY.md: ${e}`)
  }

  res.json({ ok: errors.length === 0, steps, errors })
})

// POST /api/agents/:id/whatsapp/pair — run whatsapp-pair.mjs and stream output via SSE
router.post('/:id/whatsapp/pair', (req, res) => {
  const { id } = req.params
  const { phone } = req.body as { phone?: string }

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    res.status(400).json({ error: 'Invalid agent id' })
    return
  }
  if (!phone || !/^\d{7,15}$/.test(phone)) {
    res.status(400).json({ error: 'Invalid phone number (digits only, 7-15 chars)' })
    return
  }

  // Detect Baileys/Boom
  const { baileys, boom } = detectWaPaths()
  if (!baileys || !boom) {
    res.status(500).json({ error: 'Could not find Baileys/Boom libraries. Is openclaw installed?' })
    return
  }

  // Determine credentials dir: profile mode (~/.openclaw-<id>) vs default (~/.openclaw)
  const HOME = process.env.HOME || ''
  const profileStateDir = path.join(HOME, `.openclaw-${id}`)
  const isProfile = fs.existsSync(profileStateDir)
  const stateDir = isProfile ? profileStateDir : path.join(HOME, '.openclaw')
  const credsDir = path.join(stateDir, 'credentials', 'whatsapp', 'default')

  const scriptPath = path.join(getWorkspacePath(), 'SYSTEM', 'scripts', 'instances', 'lib', 'whatsapp-pair.mjs')

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (type: string, data: string) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`)
  }

  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch {}
  }, 2000)
  const cleanup = () => clearInterval(keepalive)

  send('log', `Pairing WhatsApp +${phone} for agent ${id}\n`)
  send('log', `Credentials dir: ${credsDir}\n`)

  const child = spawn('node', [scriptPath, phone, credsDir, baileys, boom], {
    cwd: getWorkspacePath(),
    env: safeEnv({ TERM: 'dumb' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let linkedWritten = false
  const handleChunk = (chunk: Buffer) => {
    const text = chunk.toString()
    send('log', text)
    // Detect pairing code: "PAIRING CODE: XXXX-XXXX" or "PAIRING CODE: XXXXXXXX"
    const codeMatch = text.match(/PAIRING CODE[:\s]+([A-Z0-9]{4}[-–]?[A-Z0-9]{4})/i)
    if (codeMatch) {
      send('code', codeMatch[1].replace(/[-–]/, '-').toUpperCase())
    }
    if (/linked!/i.test(text) || /✅/.test(text)) {
      send('linked', 'ok')
      // Write phone number to IDENTITY.md so the dashboard can display it
      if (!linkedWritten) {
        linkedWritten = true
        const identityPath = path.join(getAgentsDir(), id, 'IDENTITY.md')
        try {
          if (fs.existsSync(identityPath)) {
            let content = fs.readFileSync(identityPath, 'utf-8')
            content = content.replace(/^[^\n]*WhatsApp[^\n]*\n?/gim, '')
            content = content.trimEnd() + `\n- **WhatsApp:** +${phone}\n`
            fs.writeFileSync(identityPath, content, 'utf-8')
          }
        } catch {}
      }
    }
  }

  child.stdout!.on('data', handleChunk)
  child.stderr!.on('data', handleChunk)

  child.on('close', (code, signal) => {
    cleanup()
    if (code === 0) {
      send('done', 'ok')
    } else {
      send('done', signal ? `killed by signal ${signal}` : `exit code ${code}`)
    }
    res.end()
  })

  child.on('error', (err) => {
    cleanup()
    send('error', err.message)
    res.end()
  })

  req.on('close', () => { cleanup() })
})

/** Call a single RPC method on the openclaw gateway via the openclaw CLI */
function callGatewayRpc(_port: number, _token: string, method: string, params: unknown = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const args = ['gateway', 'call', method, '--json']
    if (params && Object.keys(params as object).length > 0) {
      args.push('--params', JSON.stringify(params))
    }
    const proc = spawn('openclaw', args, { env: safeEnv() })
    let stdout = ''
    let stderr = ''
    // not-a-turn-deadline: a liveness probe against the openclaw gateway, not an agent turn. It
    // asks "is the daemon answering?" and 10s is already generous for that; nothing an agent does
    // runs inside it.
    const timer = setTimeout(() => { proc.kill(); reject(new Error('gateway timeout')) }, 10000)
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code: number) => {
      clearTimeout(timer)
      if (code !== 0) { reject(new Error(`openclaw gateway call failed (${code}): ${stderr}`)); return }
      try { resolve(JSON.parse(stdout)) }
      catch { reject(new Error(`invalid JSON from openclaw: ${stdout}`)) }
    })
    proc.on('error', (err: Error) => { clearTimeout(timer); reject(err) })
  })
}

// GET /api/agents/:id/wa-groups — fetch live WA groups from the running gateway
router.get('/:id/wa-groups', async (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const cfg = getAgentGatewayConfig(id)
  if (!cfg) {
    return res.status(503).json({ error: 'No gateway config found for agent' })
  }

  try {
    const result = await callGatewayRpc(cfg.port, cfg.token, 'groups.fetchAll', {}) as {
      ts?: number
      groups?: Array<{ id: string; subject: string; isParent?: boolean }>
    }

    const allGroups = result?.groups ?? []

    // Baileys marks community parent groups with isParent:true — use that as primary signal.
    // Fall back to GROUPS.md cross-reference for groups without the flag.
    const groupsPath = path.join(getAgentsDir(), id, 'GROUPS.md')
    let communityNames = new Set<string>()
    let communityDescriptions = new Map<string, string | null>()
    let groupDescriptions = new Map<string, string | null>()
    try {
      const groupsContent = fs.readFileSync(groupsPath, 'utf-8')
      const parsed = parseGroups(groupsContent)
      communityNames = new Set(parsed.communities.map(c => c.name.toLowerCase()))
      // Build description lookup maps (case-insensitive)
      for (const c of parsed.communities) {
        communityDescriptions.set(c.name.toLowerCase(), c.description)
      }
      for (const g of parsed.groups) {
        groupDescriptions.set(g.name.toLowerCase(), g.description)
      }
    } catch {
      // GROUPS.md may not exist yet — use only isParent flag
    }

    const waCommunities = allGroups
      .filter(g => g.isParent || communityNames.has(g.subject.toLowerCase()))
      .map(g => ({
        name: g.subject,
        key: g.id,
        description: communityDescriptions.get(g.subject.toLowerCase()) ?? null
      }))

    const communityNameSet = new Set(waCommunities.map(c => c.name.toLowerCase()))
    const waGroups = allGroups
      .filter(g => !g.isParent && !communityNameSet.has(g.subject.toLowerCase()))
      .map(g => ({
        name: g.subject,
        key: g.id,
        description: groupDescriptions.get(g.subject.toLowerCase()) ?? null
      }))

    // Deduplicate by name (case-insensitive) - keep first occurrence
    const dedupe = <T extends { name: string }>(arr: T[]): T[] => {
      const seen = new Map<string, T>()
      for (const item of arr) {
        const key = item.name.toLowerCase()
        if (!seen.has(key)) seen.set(key, item)
      }
      return Array.from(seen.values())
    }

    const dedupedCommunities = dedupe(waCommunities)
    const dedupedGroups = dedupe(waGroups)

    res.json({ groups: dedupedGroups, communities: dedupedCommunities })
  } catch (err) {
    res.status(503).json({ error: String(err) })
  }
})

// POST /api/agents/:id/groups/sync — write merged groups back to GROUPS.md
router.post('/:id/groups/sync', (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ ok: false, error: 'Invalid agent id' })
  }

  const { communities, groups } = req.body as {
    communities?: Array<{ name: string; description: string | null }>
    groups?: Array<{ name: string; description: string | null }>
  }

  if (!Array.isArray(groups)) {
    return res.status(400).json({ ok: false, error: 'groups must be an array' })
  }

  const groupsPath = path.join(getAgentsDir(), id, 'GROUPS.md')

  const commLines = (communities ?? []).map(c => `- ${c.name}${c.description ? ': ' + c.description : ''}`)
  const groupLines = groups.map(g => `- ${g.name}${g.description ? ': ' + g.description : ''}`)

  const content = [
    '# GROUPS.md - WhatsApp Presence',
    '',
    '## Communities',
    ...commLines,
    '',
    '## Groups',
    ...groupLines,
    '',
  ].join('\n')

  try {
    fs.writeFileSync(groupsPath, content, 'utf-8')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/agents/:id/chat/messages — send a message to the agent via dashboard chat
router.post('/:id/chat/messages', async (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const { message } = req.body as { message?: string }
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }

  const paused = getPausedAgents()
  if (paused.has(id)) {
    return res.status(423).json({ error: 'Agent is paused — resume it before sending messages' })
  }

  const sessionKey = `agent:${id}:dashboard-chat`

  try {
    const HOME = process.env.HOME || ''
    const sessionsPath = path.join(HOME, '.openclaw', 'agents', id, 'sessions', 'sessions.json')
    const resolvedAgent = resolveAgentExecutionConfig(id)
    const preferredSessionId = scopeSessionIdToModel(sessionKey, resolvedAgent.model)
    const persistedSessionId = resolvePersistedAgentSessionId(id, sessionKey, preferredSessionId, HOME)
    const sessionId = scopeSessionIdToModel(persistedSessionId || sessionKey, resolvedAgent.model)

    if (resolvedAgent.runtime !== 'openclaw') {
      // Claude Code / Factory Droid: spawn via the shared runtime adapter instead of the
      // openclaw CLI. No --local flag, no openclaw sessions.json bookkeeping — session
      // continuity is tracked by runtime-sessions.ts (see agent-runtime.ts).
      // withRegisteredTurn registers this turn before executeAgentRuntimeTurn spawns anything, so
      // it shows up in GET /turns/active and is reachable by POST /:id/chat/cancel by turnId (the
      // registry is shared process-wide — it doesn't matter that the route registering it lives
      // here rather than in chat.ts). A bare `new AbortController().signal` here was never wired
      // to anything, so this turn used to be unkillable once started; releasing happens in a
      // `finally` inside withRegisteredTurn, so it can't leak on any exit path below.
      runExclusiveAgentExecution(id, () => withRegisteredTurn(id, (turn) => new Promise<void>((resolve, reject) => {
        executeAgentRuntimeTurn({
          runtime: resolvedAgent.runtime,
          agentId: id,
          agentDir: resolvedAgent.workspace || path.join(getWorkspacePath(), 'AGENTS', id),
          message,
          scopedSessionId: sessionId,
          model: resolvedAgent.model,
          mode: 'json',
          // User-initiated agent execution: use userExecutionEnv() to honor the Separated Key Policy
          // exactly like the sibling chat.ts/channels.ts paths (BYOK/USER_* keys, and SYSTEM_* only
          // when ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION=true). This route carries no BYOK payload
          // (ChatPanel posts { message } only), so there are no request-level overrides to layer on.
          env: userExecutionEnv({}),
          // No deadline, matching every other execution surface. Cancellation (via turn.signal) is
          // the only way this turn ends early now.
          signal: turn.signal,
          // json mode never streams deltas, but tool calls and thinking still produce CLI output —
          // count any of it as alive so a legitimately busy turn never reads as idle.
          onActivity: () => turn.touch(),
        }).then(({ text, errorText, missingCliError }) => {
          if (missingCliError) {
            reject(new Error(missingCliError))
            return
          }
          if (errorText) {
            reject(new Error(errorText === 'timeout' ? 'Agent timeout' : errorText))
            return
          }
          const responseText = normalizeChatMessage(text) || 'No response from agent'
          appendRuntimeTranscriptExchange(id, sessionId, message, responseText)
          res.json({ ok: true, result: { response: responseText } })
          resolve()
        }).catch(reject)
      }))).catch((err) => {
        res.status(500).json({ error: String(err?.message || err) })
      })
      return
    }

    // No deadline: withRegisteredTurn registers this turn (see the claude/droid branch above for
    // why that makes it visible to GET /turns/active and reachable by POST /:id/chat/cancel). This
    // branch used to kill the CLI unconditionally at 10 minutes regardless of whether it was still
    // working — the same bug the rest of this change deletes everywhere else; cancellation is now
    // its only kill switch too.
    runExclusiveAgentExecution(id, () => withRegisteredTurn(id, (turn) => new Promise<void>((resolve, reject) => {
      const useLocal = !isGatewayConfigured()
      const args = ['agent', '--agent', id, '--session-id', sessionId, '--message', message, '--json', ...(useLocal ? ['--local'] : [])]
      // Own process group: openclaw spawns its own children, and signalling only this direct child
      // leaves grandchildren alive holding the stdout pipe open. Mirrors runOnce in agent-runtime.ts.
      const proc = spawn('openclaw', args, { env: safeEnv(), detached: true })

      let stdout = ''
      let stderr = ''
      let settled = false
      let killEscalation: NodeJS.Timeout | undefined

      /**
       * Settle exactly once and stop reading.
       *
       * This promise is nested inside runExclusiveAgentExecution's per-agent lock, so a promise that
       * never settles does not just leak this turn's registry entry -- it holds that lock forever and
       * permanently blocks every later chat, channel and workflow turn for this agent. There is no
       * deadline anywhere that could eventually clear it, by design, so settling has to be guaranteed
       * here rather than left to 'close'.
       */
      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        turn.signal.removeEventListener('abort', onAbort)
        if (killEscalation) clearTimeout(killEscalation)
      detachProcessStreams(proc)
        fn()
      }

      function onAbort() {
        if (settled) return
        // SIGTERM, then an unconditional group SIGKILL, then settle -- see cancelProcessTree.
        killEscalation = cancelProcessTree(proc, () => settle(() => reject(new Error('Agent run was stopped.'))))
      }
      if (turn.signal.aborted) onAbort()
      else turn.signal.addEventListener('abort', onAbort)

      proc.stdout.on('data', (d: Buffer) => { turn.touch(); stdout += d.toString() })
      proc.stderr.on('data', (d: Buffer) => { turn.touch(); stderr += d.toString() })

      proc.on('close', (code: number) => {
        if (code !== 0) {
          settle(() => reject(new Error(`Agent command failed: ${stderr}`)))
          return
        }

        try {
          const result = JSON.parse(stdout)
          const responseText = result?.result?.payloads?.[0]?.text || 'No response from agent'
          const actualSessionId = result?.result?.meta?.agentMeta?.sessionId

          if (actualSessionId) {
            try {
              let sessions: Record<string, any> = {}
              if (fs.existsSync(sessionsPath)) {
                sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
              }
              sessions[sessionKey] = { sessionId: actualSessionId, updatedAt: Date.now() }
              fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2))
            } catch (e) {
              console.error('Failed to update sessions.json:', e)
            }
          }

          settle(() => {
            res.json({ ok: true, result: { response: responseText } })
            resolve()
          })
        } catch {
          settle(() => reject(new Error(`Invalid JSON from agent: ${stdout}`)))
        }
      })

      proc.on('error', (err: Error) => {
        settle(() => reject(err))
      })
    }))).catch((err) => {
      res.status(500).json({ error: String(err?.message || err) })
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

router.post('/pause', (req, res) => {
  const { agentIds } = req.body as { agentIds?: string[] }
  if (!Array.isArray(agentIds) || agentIds.some(id => typeof id !== 'string')) {
    return res.status(400).json({ error: 'agentIds must be an array of strings' })
  }
  const paused = pauseAgents(agentIds)
  res.json({ paused: Array.from(paused) })
})

router.post('/resume', (req, res) => {
  const { agentIds } = req.body as { agentIds?: string[] }
  if (!Array.isArray(agentIds) || agentIds.some(id => typeof id !== 'string')) {
    return res.status(400).json({ error: 'agentIds must be an array of strings' })
  }
  const paused = resumeAgents(agentIds)
  res.json({ paused: Array.from(paused) })
})

router.post('/:id/reset-session', (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  try {
    resetAgentRuntimeSessions(id)
    res.json({ ok: true, agentId: id })
  } catch (err: any) {
    console.error('Failed to reset agent session:', err)
    res.status(500).json({ error: err?.message || 'Failed to reset agent session' })
  }
})

// POST /api/agents/bulk-model — change model for multiple agents
router.post('/bulk-model', async (req, res) => {
  const { agentIds, model } = req.body as { agentIds?: string[]; model?: string }
  if (!Array.isArray(agentIds) || !model || typeof model !== 'string') {
    return res.status(400).json({ error: 'agentIds (array) and model (string) are required' })
  }
  const normalizedModel = normalizeAgentModelInput(model)
  if (!normalizedModel) {
    return res.status(400).json({ error: 'model is required' })
  }

  const results: { id: string; ok: boolean; error?: string }[] = []
  for (const agentId of agentIds) {
    try {
      const configUpdate = updateAgentModelInConfig(agentId, normalizedModel)
      if (!configUpdate.ok) {
        results.push({ id: agentId, ok: false, error: configUpdate.error || 'Failed to update live model config' })
        continue
      }

      // Update IDENTITY.md
      const agentDir = path.join(getWorkspacePath(), 'AGENTS', agentId)
      const identityPath = path.join(agentDir, 'IDENTITY.md')
      if (fs.existsSync(identityPath)) {
        updateAgentIdentityModel(identityPath, normalizedModel)
      }

      if (configUpdate.changed) {
        resetAgentRuntimeForModelChange(agentId)
        recordAgentLifecycleAuditEvent(agentId, {
          type: 'model',
          title: 'Model changed',
          detail: `Primary model changed to ${configUpdate.model || normalizedModel}`,
          model: configUpdate.model || normalizedModel,
        })
      }

      results.push({ id: agentId, ok: true })
    } catch (err: any) {
      results.push({ id: agentId, ok: false, error: err.message })
    }
  }

  const succeeded = results.filter(r => r.ok).length
  res.json({ ok: succeeded === agentIds.length, updated: succeeded, total: agentIds.length, results })
})

// GET /api/agents/:id/cost-limit — get cost limit for a specific agent
router.get('/:id/cost-limit', (req, res) => {
  const limit = getAgentCostLimit(req.params.id)
  res.json({ agentId: req.params.id, limitUsd: limit })
})

// PUT /api/agents/:id/cost-limit — set cost limit for a specific agent
router.put('/:id/cost-limit', (req, res) => {
  const { limitUsd } = req.body
  if (limitUsd !== null && (typeof limitUsd !== 'number' || limitUsd < 0)) {
    return res.status(400).json({ error: 'limitUsd must be a positive number or null to remove' })
  }
  const validationError = validateAgentCostLimit(limitUsd ?? null)
  if (validationError) {
    return res.status(400).json({ error: validationError })
  }
  setAgentCostLimit(req.params.id, limitUsd)
  res.json({ ok: true, agentId: req.params.id, limitUsd: limitUsd || null })
})

// PATCH /api/agents/:id/tags — update agent tags in IDENTITY.md
router.patch('/:id/tags', (req, res) => {
  const { id } = req.params
  const { tags } = req.body

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  if (!Array.isArray(tags)) {
    return res.status(400).json({ error: 'Tags must be an array' })
  }

  const agentDir = path.join(getAgentsDir(), id)
  const identityPath = path.join(agentDir, 'IDENTITY.md')

  try {
    // Read current IDENTITY.md
    const content = fs.readFileSync(identityPath, 'utf-8')

    // Update tags line
    const tagsLine = tags.length > 0 ? tags.join(', ') : 'untagged'
    const updatedContent = content.replace(
      /^-\s+\*\*Tags:\*\*\s+.+$/m,
      `- **Tags:** ${tagsLine}`
    )

    // Write back
    fs.writeFileSync(identityPath, updatedContent, 'utf-8')

    res.json({ ok: true, tags })
  } catch (err) {
    console.error('Failed to update tags:', err)
    res.status(500).json({ error: 'Failed to update tags' })
  }
})

// GET /api/agents/:id/config — get editable agent config files
router.get('/:id/config', (req, res) => {
  const { id } = req.params

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const agentDir = path.join(getAgentsDir(), id)
  if (!fs.existsSync(agentDir)) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  const readFile = (name: string) => {
    const p = path.join(agentDir, name)
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''
  }

  res.json({
    identity: readFile('IDENTITY.md'),
    soul: readFile('SOUL.md'),
    tools: readFile('TOOLS.md')
  })
})

// POST /api/agents/validate-config — validate editable config sections before save
router.post('/validate-config', (req, res) => {
  const { identity, soul, tools, expectedId } = req.body as {
    identity?: string
    soul?: string
    tools?: string
    expectedId?: string
  }

  if (expectedId && !/^[a-z][a-z0-9_-]*$/.test(expectedId)) {
    return res.status(400).json({ error: 'Invalid expected agent id' })
  }

  const result = validateAgentConfigSections({ identity, soul, tools }, expectedId)
  res.json(result)
})

// PUT /api/agents/:id/config — update agent config files
router.put('/:id/config', (req, res) => {
  const { id } = req.params
  const { identity, soul, tools } = req.body

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const agentDir = path.join(getAgentsDir(), id)
  if (!fs.existsSync(agentDir)) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  const validation = validateAgentConfigSections({ identity, soul, tools }, id)
  if (!validation.valid) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors,
      warnings: validation.warnings,
    })
  }

  try {
    let identityToWrite = typeof identity === 'string' ? identity : undefined
    let configUpdate: AgentModelConfigUpdateResult | undefined
    let backupConfigUpdate: AgentModelConfigUpdateResult | undefined
    if (identityToWrite) {
      const parsedIdentity = parseIdentity(identityToWrite)
      const identityModel = normalizeAgentModelInput(parsedIdentity.model || '')
      const identityBackupModel = parsedIdentity.backupModel ? normalizeAgentModelInput(parsedIdentity.backupModel) : undefined
      if (identityModel) {
        configUpdate = updateAgentModelInConfig(id, identityModel)
        if (!configUpdate.ok) {
          return res.status(500).json({ error: configUpdate.error || 'Failed to update live model config' })
        }
        backupConfigUpdate = updateAgentBackupModelInConfig(id, identityBackupModel)
        if (!backupConfigUpdate.ok) {
          return res.status(500).json({ error: backupConfigUpdate.error || 'Failed to update live backup model config' })
        }
        identityToWrite = syncAgentIdentityModels(
          identityToWrite,
          configUpdate.model || identityModel,
          backupConfigUpdate.backupModel,
        )
      }
    }

    if (typeof identity === 'string') {
      fs.writeFileSync(path.join(agentDir, 'IDENTITY.md'), identityToWrite || identity, 'utf-8')
    }
    if (typeof soul === 'string') {
      fs.writeFileSync(path.join(agentDir, 'SOUL.md'), soul, 'utf-8')
    }
    if (typeof tools === 'string') {
      fs.writeFileSync(path.join(agentDir, 'TOOLS.md'), tools, 'utf-8')
    }
    if (configUpdate?.changed || backupConfigUpdate?.changed) {
      resetAgentRuntimeForModelChange(id)
    }
    const modifiedSections = [
      typeof identity === 'string' ? 'IDENTITY.md' : '',
      typeof soul === 'string' ? 'SOUL.md' : '',
      typeof tools === 'string' ? 'TOOLS.md' : '',
    ].filter(Boolean)
    if (modifiedSections.length > 0) {
      recordAgentLifecycleAuditEvent(id, {
        type: 'modified',
        title: 'Agent configuration changed',
        detail: modifiedSections.join(', '),
      })
    }
    if (configUpdate?.changed && configUpdate.model) {
      recordAgentLifecycleAuditEvent(id, {
        type: 'model',
        title: 'Model changed',
        detail: `Primary model changed to ${configUpdate.model}`,
        model: configUpdate.model,
      })
    }
    res.json({ ok: true, warnings: validation.warnings, model: configUpdate?.model, backupModel: backupConfigUpdate?.backupModel })
  } catch (err) {
    console.error('Failed to update agent config:', err)
    res.status(500).json({ error: 'Failed to update agent config' })
  }
})

// PATCH /api/agents/:id/model — update agent model in IDENTITY.md
router.patch('/:id/model', (req, res) => {
  const { id } = req.params
  const { model, backupModel, modelSelection, modelPreference } = req.body

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  if (!model || typeof model !== 'string') {
    return res.status(400).json({ error: 'model is required' })
  }
  const normalizedModel = normalizeAgentModelInput(model)
  if (!normalizedModel) {
    return res.status(400).json({ error: 'model is required' })
  }
  if (modelSelection !== undefined && !['auto', 'manual'].includes(String(modelSelection))) {
    return res.status(400).json({ error: 'modelSelection must be auto or manual' })
  }
  if (modelPreference !== undefined && !['quality', 'balanced', 'cost'].includes(String(modelPreference))) {
    return res.status(400).json({ error: 'modelPreference must be quality, balanced, or cost' })
  }

  const agentDir = path.join(getAgentsDir(), id)
  const identityPath = path.join(agentDir, 'IDENTITY.md')

  try {
    const configUpdate = updateAgentModelInConfig(id, normalizedModel)
    if (!configUpdate.ok) {
      return res.status(500).json({ error: configUpdate.error || 'Failed to update live model config' })
    }
    const backupConfigUpdate = updateAgentBackupModelInConfig(id, typeof backupModel === 'string' ? backupModel : undefined)
    if (!backupConfigUpdate.ok) {
      return res.status(500).json({ error: backupConfigUpdate.error || 'Failed to update live backup model config' })
    }

    const identityContent = fs.readFileSync(identityPath, 'utf-8')
    fs.writeFileSync(identityPath, syncAgentIdentityModels(
      identityContent,
      configUpdate.model || normalizedModel,
      backupConfigUpdate.backupModel,
      {
        selectionMode: modelSelection as AgentModelSelectionMode | undefined,
        preference: modelPreference as AgentModelPreference | undefined,
      },
    ), 'utf-8')
    if (configUpdate.changed || backupConfigUpdate.changed) {
      resetAgentRuntimeForModelChange(id)
    }
    if (configUpdate.changed) {
      recordAgentLifecycleAuditEvent(id, {
        type: 'model',
        title: 'Model changed',
        detail: `Primary model changed to ${configUpdate.model || normalizedModel}`,
        model: configUpdate.model || normalizedModel,
      })
    }
    res.json({
      ok: true,
      model: configUpdate.model || normalizedModel,
      backupModel: backupConfigUpdate.backupModel,
      modelSelection,
      modelPreference,
    })
  } catch (err) {
    console.error('Failed to update model:', err)
    res.status(500).json({ error: 'Failed to update model' })
  }
})

// PATCH /api/agents/:id/runtime — pin (or clear) which CLI runtime executes this agent, in IDENTITY.md
router.patch('/:id/runtime', (req, res) => {
  const { id } = req.params
  const { runtime } = req.body

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  if (typeof runtime !== 'string') {
    return res.status(400).json({ error: 'runtime is required' })
  }
  const normalizedRuntime = runtime === 'default' ? 'default' : normalizeAgentRuntime(runtime)
  if (!normalizedRuntime) {
    return res.status(400).json({ error: `runtime must be one of: default, ${AGENT_RUNTIME_IDS.join(', ')}` })
  }

  const agentDir = path.join(getAgentsDir(), id)
  const identityPath = path.join(agentDir, 'IDENTITY.md')
  if (!fs.existsSync(identityPath)) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  try {
    updateAgentIdentityRuntime(identityPath, normalizedRuntime)
    // No session reset needed here: each runtime keeps its own session store
    // (openclaw's ~/.openclaw/agents/<id>/sessions vs. runtime-sessions.ts for claude/droid).
    res.json({ ok: true, runtime: normalizedRuntime })
  } catch (err) {
    console.error('Failed to update runtime:', err)
    res.status(500).json({ error: 'Failed to update runtime' })
  }
})

// PATCH /api/agents/:id/rename — rename agent and update all references
router.patch('/:id/rename', (req, res) => {
  const { id } = req.params
  const { newId } = req.body

  // Validate old ID
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  // Validate new ID
  if (!newId || typeof newId !== 'string') {
    return res.status(400).json({ error: 'newId is required' })
  }
  if (!/^[a-z][a-z0-9_-]*$/.test(newId)) {
    return res.status(400).json({ error: 'Invalid new ID format (must start with lowercase letter, contain only lowercase letters, numbers, dashes, and underscores)' })
  }
  if (newId === id) {
    return res.status(400).json({ error: 'New ID must be different from current ID' })
  }

  const agentsDir = getAgentsDir()
  const oldPath = path.join(agentsDir, id)
  const newPath = path.join(agentsDir, newId)

  try {
    // Check old agent exists
    if (!fs.existsSync(oldPath)) {
      return res.status(404).json({ error: 'Agent not found' })
    }

    // Check new ID doesn't conflict
    if (fs.existsSync(newPath)) {
      return res.status(409).json({ error: `Agent "${newId}" already exists` })
    }

    // Rename directory
    fs.renameSync(oldPath, newPath)

    // Update references in COMMUNITIES.md
    try {
      const commPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
      if (fs.existsSync(commPath)) {
        let content = fs.readFileSync(commPath, 'utf-8')
        // Replace in members lists (comma-separated)
        content = content.replace(
          new RegExp(`\\b${id}\\b`, 'g'),
          newId
        )
        fs.writeFileSync(commPath, content, 'utf-8')
      }
    } catch (err) {
      console.error('Failed to update COMMUNITIES.md:', err)
    }

    // Update references in GROUPS.md
    try {
      const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')
      if (fs.existsSync(groupsPath)) {
        let content = fs.readFileSync(groupsPath, 'utf-8')
        // Replace in members lists
        content = content.replace(
          new RegExp(`\\b${id}\\b`, 'g'),
          newId
        )
        fs.writeFileSync(groupsPath, content, 'utf-8')
      }
    } catch (err) {
      console.error('Failed to update GROUPS.md:', err)
    }

    res.json({ ok: true, oldId: id, newId })
  } catch (err) {
    console.error('Failed to rename agent:', err)
    // Try to rollback if directory was renamed
    try {
      if (fs.existsSync(newPath) && !fs.existsSync(oldPath)) {
        fs.renameSync(newPath, oldPath)
      }
    } catch {}
    res.status(500).json({ error: 'Failed to rename agent' })
  }
})

// GET /api/agents/:id/chat/messages — fetch dashboard chat history
router.get('/:id/chat/messages', async (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  try {
    const HOME = process.env.HOME || ''
    const sessionsDir = getAgentSessionsDir(id, HOME)
    const sessionsIndexPath = path.join(sessionsDir, 'sessions.json')

    // Check if either store has anything for this agent — openclaw's own session index/dir, or a
    // non-openclaw (claude/droid) runtime transcript. A claude/droid-only agent never gets an
    // openclaw sessions dir at all, so this check must not bail out before consulting the latter.
    if (!fs.existsSync(sessionsIndexPath) && !fs.existsSync(sessionsDir) && !hasRuntimeTranscripts(id)) {
      return res.json({ messages: [] })
    }

    const actualSessionId = resolveAgentChatSessionId(id, HOME)

    if (!actualSessionId) {
      return res.json({ messages: [] })
    }

    res.json({ messages: readMergedChatSessionMessages(id, actualSessionId, HOME) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Clear agent chat messages (archives them first)
router.delete('/:id/chat/messages', async (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  try {
    const HOME = process.env.HOME || ''
    const sessionsDir = getAgentSessionsDir(id, HOME)
    const sessionsIndexPath = path.join(sessionsDir, 'sessions.json')

    if (!fs.existsSync(sessionsIndexPath) && !fs.existsSync(sessionsDir) && !hasRuntimeTranscripts(id)) {
      return res.json({ ok: true, archived: false })
    }

    const sessionsIndex = fs.existsSync(sessionsIndexPath)
      ? JSON.parse(fs.readFileSync(sessionsIndexPath, 'utf-8'))
      : {}
    const actualSessionId = resolveAgentChatSessionId(id, HOME)

    if (!actualSessionId) {
      return res.json({ ok: true, archived: false })
    }

    const jsonlPath = path.join(sessionsDir, `${actualSessionId}.jsonl`)
    const openclawExists = fs.existsSync(jsonlPath)
    const runtimeTurns = readRuntimeTranscript(id, actualSessionId)

    if (openclawExists || runtimeTurns.length > 0) {
      const archiveDir = path.join(sessionsDir, 'archive')
      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true })
      }

      const timestamp = Date.now()
      const date = new Date(timestamp).toISOString().split('T')[0]
      const archiveFile = path.join(archiveDir, `${actualSessionId}_${date}_${timestamp}.jsonl`)

      let archiveContent: string
      if (openclawExists && runtimeTurns.length > 0) {
        // Mixed session (chatted under openclaw, then re-pinned to claude/droid on the same scoped
        // session id): interleave by timestamp so the archive preserves the order the user saw. Keep
        // the OpenClaw lines VERBATIM (parsing only their timestamp for ordering) so nothing that the
        // openclaw-only verbatim-copy path would keep — empty-content rows, non-message rows — is lost.
        const openclawLines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter((line) => line.trim())
        const ordered: Array<{ ts: number; raw: string }> = openclawLines.map((raw) => {
          let ts = 0
          try {
            const parsed = JSON.parse(raw)
            // Match the read path's ordering key (parseVisibleChatMessages: msg.timestamp ||
            // entry.timestamp) so the archive preserves exactly the order the user saw.
            const msgTs = typeof parsed.message?.timestamp === 'number' ? parsed.message.timestamp : undefined
            const entryTs = typeof parsed.timestamp === 'number' ? parsed.timestamp : undefined
            ts = msgTs || entryTs || 0
          } catch {}
          return { ts, raw }
        })
        runtimeTurns.forEach((turn) => {
          ordered.push({ ts: turn.ts, raw: JSON.stringify({ type: 'message', message: { role: turn.role, content: turn.content, timestamp: turn.ts } }) })
        })
        // Stable sort preserves each store's internal order for equal timestamps.
        ordered.sort((a, b) => a.ts - b.ts)
        archiveContent = ordered.map((entry) => entry.raw).join('\n') + '\n'
      } else if (openclawExists) {
        // OpenClaw-only: preserve the raw session file verbatim (unchanged behavior).
        archiveContent = fs.readFileSync(jsonlPath, 'utf-8')
      } else {
        // Runtime-only (claude/droid): render the transcript as archive-format lines.
        archiveContent = readRuntimeTranscriptAsArchiveLines(id, actualSessionId)
      }
      fs.writeFileSync(archiveFile, archiveContent)

      if (openclawExists) fs.unlinkSync(jsonlPath)
      clearRuntimeTranscript(id, actualSessionId)

      // Remove session from index
      const sessionKey = getAgentDashboardSessionKey(id)
      if (sessionsIndex[sessionKey]?.sessionId === actualSessionId) {
        delete sessionsIndex[sessionKey]
      }
      fs.writeFileSync(sessionsIndexPath, JSON.stringify(sessionsIndex, null, 2))

      return res.json({ ok: true, archived: true })
    }

    res.json({ ok: true, archived: false })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Get archived chat sessions
router.get('/:id/chat/archives', async (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  try {
    const HOME = process.env.HOME || ''
    const sessionsDir = getAgentSessionsDir(id, HOME)
    const archiveDir = path.join(sessionsDir, 'archive')

    const activeSessionId = resolveAgentChatSessionId(id, HOME)
    // readMergedChatSessionMessages pulls from both stores, so this entry (and its message count/
    // timestamp below) reflects claude/droid runtime-transcript turns too, not just openclaw's own
    // session file — a claude/droid-only agent never has an openclaw .jsonl to stat at all.
    const activeSessionMessages = activeSessionId ? readMergedChatSessionMessages(id, activeSessionId, HOME) : []
    const activeSessionPath = activeSessionId ? path.join(sessionsDir, `${activeSessionId}.jsonl`) : null
    const activeSessionTimestamp = activeSessionPath && fs.existsSync(activeSessionPath)
      ? fs.statSync(activeSessionPath).mtimeMs
      : (activeSessionMessages[activeSessionMessages.length - 1]?.timestamp ?? Date.now())
    const activeEntry = activeSessionId && activeSessionMessages.length > 0
      ? [{
          filename: `current:${activeSessionId}`,
          timestamp: activeSessionTimestamp,
          messageCount: activeSessionMessages.length,
          messages: activeSessionMessages.map((message) => ({ role: message.role, content: message.content })),
          active: true,
        }]
      : []

    const archivedEntries = fs.existsSync(archiveDir)
      ? fs.readdirSync(archiveDir)
      .filter(isArchiveSessionFile)
      .map(filename => {
        const fullPath = path.join(archiveDir, filename)
        const timestamp = parseArchiveTimestamp(filename, fullPath)

        // Count messages and parse for LLM title generation
        let messageCount = 0
        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

        try {
          const content = fs.readFileSync(fullPath, 'utf-8')
          const lines = content.trim().split('\n').filter(l => l.trim())

          for (const line of lines) {
            try {
              const obj = JSON.parse(line)
              if (obj.type === 'message' && obj.message) {
                const msg = obj.message
                if (!isVisibleChatRole(msg.role)) continue
                let textContent = ''

                if (Array.isArray(msg.content)) {
                  textContent = msg.content
                    .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
                    .map((c: any) => c.text)
                    .join(' ')
                } else if (typeof msg.content === 'string') {
                  textContent = msg.content
                }

                if (textContent && msg.role) {
                  const normalized = normalizeChatMessage(textContent)
                  if (!normalized) continue
                  messageCount++
                  messages.push({ role: msg.role, content: normalized })
                }
              }
            } catch {
              continue
            }
          }
        } catch {
          // ignore
        }

        return { filename, timestamp, messageCount, messages, active: false }
      })
      .filter((entry) => entry.messageCount > 0)
      .sort((a, b) => b.timestamp - a.timestamp)
      : []

    const fileInfos = [...activeEntry, ...archivedEntries]

    // Check for cached titles
    const titlesPath = path.join(archiveDir, '.titles.json')
    let cachedTitles: Record<string, string> = {}
    try {
      if (fs.existsSync(titlesPath)) {
        cachedTitles = JSON.parse(fs.readFileSync(titlesPath, 'utf-8'))
      }
    } catch {
      // ignore
    }

    // Generate titles (using cache when available)
    const archives = await Promise.all(
      fileInfos.map(async info => {
        let title = info.active ? 'Current conversation' : cachedTitles[info.filename]
        if (!info.active && !isUsableArchiveTitle(title)) {
          title = ''
        }

        if (!title) {
          // Generate new title
          title = await generateArchiveTitle(getArchiveTitleMessages(info.messages))
          cachedTitles[info.filename] = title
        }

        return {
          filename: info.filename,
          timestamp: info.timestamp,
          messageCount: info.messageCount,
          title,
          active: info.active,
        }
      })
    )

    // Save updated cache
    if (fs.existsSync(archiveDir) || archivedEntries.length > 0) {
      try {
        fs.writeFileSync(titlesPath, JSON.stringify(cachedTitles, null, 2))
      } catch (err) {
        console.error('Failed to save title cache:', err)
      }
    }

    res.json({ archives })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Get specific archived chat
router.get('/:id/chat/archives/:filename', async (req, res) => {
  const { id, filename } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  try {
    const HOME = process.env.HOME || ''
    const sessionsDir = getAgentSessionsDir(id, HOME)
    const archiveDir = path.join(sessionsDir, 'archive')

    if (filename.startsWith('current:')) {
      const sessionId = filename.slice('current:'.length)
      if (!sessionId) {
        return res.status(400).json({ error: 'Invalid current conversation id' })
      }
      // Must match the archives-list entry, which counts messages from both stores — reading only
      // openclaw's JSONL here would show an empty transcript for a claude/droid-only current chat.
      return res.json({ messages: readMergedChatSessionMessages(id, sessionId, HOME) })
    }

    const filePath = path.join(archiveDir, filename)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archive not found' })
    }

    res.json({ messages: parseVisibleChatMessages(fs.readFileSync(filePath, 'utf-8')) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Restore archived chat as the active dashboard conversation
router.post('/:id/chat/archives/:filename/restore', async (req, res) => {
  const { id, filename } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  if (filename.startsWith('current:')) {
    return res.status(400).json({ error: 'Current conversation is already active' })
  }

  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' })
  }

  try {
    const HOME = process.env.HOME || ''
    const sessionsDir = getAgentSessionsDir(id, HOME)
    const archiveDir = path.join(sessionsDir, 'archive')
    const filePath = path.join(archiveDir, filename)
    const titlesPath = path.join(archiveDir, '.titles.json')

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archive not found' })
    }

    const restoredMessages = parseVisibleChatMessages(fs.readFileSync(filePath, 'utf-8'))
    if (restoredMessages.length === 0) {
      return res.status(400).json({ error: 'Archive has no visible chat messages to restore' })
    }

    fs.mkdirSync(sessionsDir, { recursive: true })
    const sessionId = getArchiveRestoreSessionId(id, HOME)
    const sessionPath = path.join(sessionsDir, `${sessionId}.jsonl`)
    fs.copyFileSync(filePath, sessionPath)
    fs.unlinkSync(filePath)

    try {
      if (fs.existsSync(titlesPath)) {
        const cachedTitles = JSON.parse(fs.readFileSync(titlesPath, 'utf-8'))
        if (cachedTitles && typeof cachedTitles === 'object' && filename in cachedTitles) {
          delete cachedTitles[filename]
          fs.writeFileSync(titlesPath, JSON.stringify(cachedTitles, null, 2))
        }
      }
    } catch {
      // non-fatal cache cleanup
    }

    const sessionsIndexPath = path.join(sessionsDir, 'sessions.json')
    const sessionKey = getAgentDashboardSessionKey(id)
    const sessionsIndex = fs.existsSync(sessionsIndexPath)
      ? JSON.parse(fs.readFileSync(sessionsIndexPath, 'utf-8'))
      : {}
    sessionsIndex[sessionKey] = {
      sessionId,
      updatedAt: Date.now(),
    }
    fs.writeFileSync(sessionsIndexPath, JSON.stringify(sessionsIndex, null, 2))

    res.json({ ok: true, sessionId, messages: restoredMessages })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Delete archived chat
router.delete('/:id/chat/archives/:filename', async (req, res) => {
  const { id, filename } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  try {
    if (filename.startsWith('current:')) {
      return res.status(400).json({ error: 'Current conversation cannot be deleted from history. Clear the active chat instead.' })
    }
    const HOME = process.env.HOME || ''
    const archiveDir = path.join(HOME, '.openclaw', 'agents', id, 'sessions', 'archive')
    const filePath = path.join(archiveDir, filename)

    // Security: ensure filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' })
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archive not found' })
    }

    fs.unlinkSync(filePath)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/agents/:id/logs — Stream live logs via SSE (agent-specific)
router.get('/:id/logs', (req, res) => {
  const { id } = req.params
  const agents = listAgents()
  const agent = agents.find(a => a.id === id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const HOME = process.env.HOME || ''
  const profileStateDir = path.join(HOME, `.openclaw-${id}`)
  const isProfile = fs.existsSync(profileStateDir)

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  const profileFlag = isProfile ? ['--profile', id] : []
  const child = spawn('openclaw', [...profileFlag, 'logs', '--follow', '--limit', '200'], {
    env: safeEnv(),
  })

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter((l: string) => l.trim())
    lines.forEach((line: string) => {
      res.write(`data: ${JSON.stringify({ line })}\n\n`)
    })
  })

  child.stderr.on('data', (data) => {
    res.write(`data: ${JSON.stringify({ error: data.toString() })}\n\n`)
  })

  child.on('close', () => {
    res.end()
  })

  req.on('close', () => {
    child.kill()
  })
})

// GET /api/agents/:id/health — Get agent health status
router.get('/:id/health', async (req, res) => {
  const { id } = req.params
  const agents = listAgents()
  const agent = agents.find(a => a.id === id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const HOME = process.env.HOME || ''
  const profileStateDir = path.join(HOME, `.openclaw-${id}`)
  const isProfile = fs.existsSync(profileStateDir)

  try {
    const profileFlag = isProfile ? ['--profile', id] : []
    const args = [...profileFlag, 'health', '--json']
    const result = execFileSync('openclaw', args, {
      encoding: 'utf-8',
      timeout: 10000,
      env: safeEnv(),
    })
    const health = JSON.parse(result)
    res.json(health)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/agents/:id/gateway-status — Get gateway status
router.get('/:id/gateway-status', async (req, res) => {
  const { id } = req.params

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const agents = listAgents()
  const agent = agents.find(a => a.id === id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const HOME = process.env.HOME || ''
  const profileStateDir = path.join(HOME, `.openclaw-${id}`)
  const isProfile = fs.existsSync(profileStateDir)

  try {
    const profileFlag = isProfile ? ['--profile', id] : []
    const args = [...profileFlag, 'gateway', 'status']
    const result = execFileSync('openclaw', args, {
      encoding: 'utf-8',
      timeout: 10000,
      env: safeEnv(),
    })
    res.json({ status: result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/agents/:id/communities — get agent's current community and group memberships
router.get('/:id/communities', (req, res) => {
  const { id } = req.params
  const agents = listAgents()
  const agent = agents.find(a => a.id === id)

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  res.json({
    communities: agent.communities.map(c => c.name),
    groups: agent.groups.map(g => g.name),
  })
})

// GET /api/agents/:id/workflows — get workflows targeting this agent
router.get('/:id/workflows', (req, res) => {
  const { id } = req.params
  const agents = listAgents()
  const agent = agents.find(a => a.id === id)

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  try {
    const allWorkflows = listWorkflows()
    const agentWorkflows = allWorkflows.filter(workflow => {
      const participants = resolveParticipants(workflow, agents)
      return participants.some(p => p.agentId === id)
    }).map(wf => ({
      id: wf.id,
      name: wf.name,
      description: wf.description,
      enabled: wf.enabled,
      schedule: wf.schedule,
    }))

    res.json({ workflows: agentWorkflows })
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get agent workflows', message: error.message })
  }
})

// POST /api/agents/:id/archive — archive an agent (move to archive directory)
router.post('/:id/archive', async (req, res) => {
  const { id } = req.params
  const { reason } = req.body as { reason?: string }

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const agentDir = path.join(getAgentsDir(), id)
  const archiveDir = path.join(getAgentsDir(), 'archive')
  const archivedAgentDir = path.join(archiveDir, id)

  try {
    if (!fs.existsSync(agentDir)) {
      return res.status(404).json({ error: 'Agent not found' })
    }

    // Stop the agent if it's running
    const pidFile = path.join(agentDir, '.pid')
    if (fs.existsSync(pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10)
        if (pid > 0) {
          process.kill(pid, 'SIGTERM')
          // Wait a bit for graceful shutdown
          // not-a-turn-deadline: a settle delay while the gateway process shuts down, so the port
          // is free before the next start. It ends nothing.
          await new Promise(resolve => setTimeout(resolve, 500))
          // Force kill if still running
          try { process.kill(pid, 'SIGKILL') } catch {}
        }
        fs.unlinkSync(pidFile)
      } catch (err) {
        // Process may already be stopped, continue with archive
      }
    }

    // Create archive directory if it doesn't exist
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true })
    }

    // Remove agent from all communities and groups
    const communitiesPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
    const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')

    // Remove from communities
    if (fs.existsSync(communitiesPath)) {
      let communitiesContent = fs.readFileSync(communitiesPath, 'utf-8')
      const lines = communitiesContent.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Match Members line (with or without leading dash)
        if (line.match(/^\s*-?\s*\*\*Members:\*\*/i)) {
          const membersMatch = line.match(/^(\s*-?\s*\*\*Members:\*\*\s*)(.*)/)
          if (membersMatch) {
            const prefix = membersMatch[1]
            const membersList = membersMatch[2].split(',').map(m => m.trim()).filter(m => m && m !== id)
            lines[i] = prefix + membersList.join(', ')
          }
        }
      }

      fs.writeFileSync(communitiesPath, lines.join('\n'), 'utf-8')
    }

    // Remove from groups
    if (fs.existsSync(groupsPath)) {
      let groupsContent = fs.readFileSync(groupsPath, 'utf-8')
      const lines = groupsContent.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Match Members line (with or without leading dash)
        if (line.match(/^\s*-?\s*\*\*Members:\*\*/i)) {
          const membersMatch = line.match(/^(\s*-?\s*\*\*Members:\*\*\s*)(.*)/)
          if (membersMatch) {
            const prefix = membersMatch[1]
            const membersList = membersMatch[2].split(',').map(m => m.trim()).filter(m => m && m !== id)
            lines[i] = prefix + membersList.join(', ')
          }
        }
      }

      fs.writeFileSync(groupsPath, lines.join('\n'), 'utf-8')
    }

    // Add archive metadata to IDENTITY.md before moving
    const identityPath = path.join(agentDir, 'IDENTITY.md')
    if (fs.existsSync(identityPath)) {
      let content = fs.readFileSync(identityPath, 'utf-8')
      const timestamp = new Date().toISOString()
      const archiveSection = `

## Archive Metadata

- **Archived:** ${timestamp}
- **Reason:** ${reason || 'No reason provided'}
`
      // Remove existing archive metadata if present
      content = content.replace(/##\s+Archive\s+Metadata\s+[\s\S]*?(?=\n##|\n---|\Z)/i, '')
      content = content.trimEnd() + archiveSection
      fs.writeFileSync(identityPath, content, 'utf-8')
    }

    // Move agent directory to archive
    fs.renameSync(agentDir, archivedAgentDir)

    res.json({ ok: true, timestamp: new Date().toISOString(), reason: reason || 'No reason provided' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/agents/:id/unarchive — unarchive an agent (move back from archive directory)
router.post('/:id/unarchive', (req, res) => {
  const { id } = req.params

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const archiveDir = path.join(getAgentsDir(), 'archive')
  const archivedAgentDir = path.join(archiveDir, id)
  const agentDir = path.join(getAgentsDir(), id)

  try {
    if (!fs.existsSync(archivedAgentDir)) {
      return res.status(404).json({ error: 'Archived agent not found' })
    }

    // If target directory already exists, remove it first (safety check for duplicates)
    if (fs.existsSync(agentDir)) {
      fs.rmSync(agentDir, { recursive: true, force: true })
    }

    // Remove archive metadata from IDENTITY.md before moving
    const identityPath = path.join(archivedAgentDir, 'IDENTITY.md')
    if (fs.existsSync(identityPath)) {
      let content = fs.readFileSync(identityPath, 'utf-8')
      // Remove Archive Metadata section (match the heading and everything after it to end of file)
      content = content.replace(/\n##\s+Archive\s+Metadata[\s\S]*$/i, '')
      content = content.trimEnd() + '\n'
      fs.writeFileSync(identityPath, content, 'utf-8')
    }

    // Move agent directory back from archive
    fs.renameSync(archivedAgentDir, agentDir)

    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/agents/:id/communities — update agent's community and group memberships
router.post('/:id/communities', (req, res) => {
  const { id } = req.params
  const { communities, groups } = req.body as { communities?: string[]; groups?: string[] }

  if (!Array.isArray(communities) && !Array.isArray(groups)) {
    return res.status(400).json({ error: 'Must provide communities or groups array' })
  }

  const agents = listAgents()
  const agent = agents.find(a => a.id === id)

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  try {
    // Read COMMUNITIES.md and GROUPS.md
    const communitiesPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
    const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')

    let communitiesContent = ''
    let groupsContent = ''

    try {
      communitiesContent = fs.readFileSync(communitiesPath, 'utf-8')
    } catch {}
    try {
      groupsContent = fs.readFileSync(groupsPath, 'utf-8')
    } catch {}

    // Parse current communities and groups
    const { communities: allCommunities, groups: allGroups } = parseGroups(communitiesContent + '\n' + groupsContent)

    // Update communities if provided
    if (Array.isArray(communities)) {
      // For each community in the new list, ensure agent is in members
      // For each community NOT in the new list, ensure agent is NOT in members

      const updatedCommunities = communitiesContent.split('\n')
      let currentCommunity: string | null = null
      let currentCommunityHasMembers = false
      let currentCommunityIndex = -1

      for (let i = 0; i < updatedCommunities.length; i++) {
        const line = updatedCommunities[i]
        const trimmed = line.trim()

        // Track which community we're in
        if (trimmed.startsWith('###')) {
          // Before switching to new community, add Members line if needed
          if (currentCommunity && !currentCommunityHasMembers && communities.includes(currentCommunity) && currentCommunityIndex >= 0) {
            // Insert Members line after the community header (and other metadata)
            updatedCommunities.splice(i, 0, `- **Members:** ${id}`)
            i++ // Adjust index since we inserted a line
          }
          currentCommunity = trimmed.replace(/^###\s+/, '').trim()
          currentCommunityHasMembers = false
          currentCommunityIndex = i
        }

        // Exit current community if we hit a section header
        if (trimmed.startsWith('##')) {
          if (currentCommunity && !currentCommunityHasMembers && communities.includes(currentCommunity) && currentCommunityIndex >= 0) {
            updatedCommunities.splice(i, 0, `- **Members:** ${id}`)
            i++
          }
          currentCommunity = null
          currentCommunityHasMembers = false
        }

        // Update members line if it exists
        if (currentCommunity && trimmed.match(/^-\s+\*\*Members:\*\*/i)) {
          currentCommunityHasMembers = true
          const membersMatch = line.match(/^(\s*-\s+\*\*Members:\*\*\s*)(.*)/)
          if (membersMatch) {
            const prefix = membersMatch[1]
            const membersList = membersMatch[2].split(',').map(m => m.trim()).filter(m => m && m !== id)

            // Add agent if this community is in the new list
            if (communities.includes(currentCommunity)) {
              membersList.push(id)
            }

            updatedCommunities[i] = prefix + membersList.join(', ')
          }
        }
      }

      // Handle last community if it didn't have members
      if (currentCommunity && !currentCommunityHasMembers && communities.includes(currentCommunity)) {
        updatedCommunities.push(`- **Members:** ${id}`)
      }

      fs.writeFileSync(communitiesPath, updatedCommunities.join('\n'), 'utf-8')
    }

    // Update groups if provided
    if (Array.isArray(groups)) {
      const updatedGroups = groupsContent.split('\n')
      let currentGroup: string | null = null
      let currentGroupHasMembers = false
      let lastMetadataLineIndex = -1

      for (let i = 0; i < updatedGroups.length; i++) {
        const line = updatedGroups[i]
        const trimmed = line.trim()

        // Track which group we're in
        if (trimmed.startsWith('###')) {
          // Before switching to new group, add Members line if needed
          if (currentGroup && !currentGroupHasMembers && groups.includes(currentGroup) && lastMetadataLineIndex >= 0) {
            // Insert Members line after the last metadata line
            updatedGroups.splice(lastMetadataLineIndex + 1, 0, `- **Members:** ${id}`)
            i++ // Adjust index since we inserted a line
          }
          currentGroup = trimmed.replace(/^###\s+/, '').trim()
          currentGroupHasMembers = false
          lastMetadataLineIndex = i // Start tracking from the group header
        }

        // Exit current group if we hit a section header
        if (trimmed.startsWith('##')) {
          if (currentGroup && !currentGroupHasMembers && groups.includes(currentGroup) && lastMetadataLineIndex >= 0) {
            updatedGroups.splice(lastMetadataLineIndex + 1, 0, `- **Members:** ${id}`)
            i++
          }
          currentGroup = null
          currentGroupHasMembers = false
          lastMetadataLineIndex = -1
        }

        // Track metadata lines (lines starting with -)
        if (currentGroup && trimmed.startsWith('-')) {
          lastMetadataLineIndex = i

          // Check if this is the Members line
          if (trimmed.match(/^-\s+\*\*Members:\*\*/i)) {
            currentGroupHasMembers = true
            const membersMatch = line.match(/^(\s*-\s+\*\*Members:\*\*\s*)(.*)/)
            if (membersMatch) {
              const prefix = membersMatch[1]
              const membersList = membersMatch[2].split(',').map(m => m.trim()).filter(m => m && m !== id)

              // Add agent if this group is in the new list
              if (groups.includes(currentGroup)) {
                membersList.push(id)
              }

              updatedGroups[i] = prefix + membersList.join(', ')
            }
          }
        }
      }

      // Handle last group if it didn't have members
      if (currentGroup && !currentGroupHasMembers && groups.includes(currentGroup) && lastMetadataLineIndex >= 0) {
        updatedGroups.splice(lastMetadataLineIndex + 1, 0, `- **Members:** ${id}`)
      }

      fs.writeFileSync(groupsPath, updatedGroups.join('\n'), 'utf-8')
    }

    res.json({ ok: true, communities, groups })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Export agent as ZIP
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params
    console.log('[Export API] Request received for agent:', id)

    const agentsDir = getAgentsDir()
    console.log('[Export API] Agents directory:', agentsDir)

    const agentDir = path.join(agentsDir, id)
    console.log('[Export API] Agent directory:', agentDir)

    if (!fs.existsSync(agentDir)) {
      console.error('[Export API] Agent directory not found:', agentDir)
      return res.status(404).json({ error: 'Agent not found' })
    }

    console.log('[Export API] Setting headers...')
    const agentName = listAgents().find((agent) => agent.id === id)?.name || id
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${buildNamedExportFilename(agentName, 'agent', 'zip')}"`)

    console.log('[Export API] Creating archive...')
    const archive = archiver('zip', { zlib: { level: 9 } })

    archive.on('error', (err) => {
      console.error('[Export API] Archive error:', err)
      throw err
    })

    archive.on('end', () => {
      console.log('[Export API] Archive finalized successfully')
    })

    console.log('[Export API] Piping archive to response...')
    archive.pipe(res)
    archive.directory(agentDir, id)
    archive.append(JSON.stringify(getAgentTransferMetadata(id), null, 2), { name: `${id}/clawmax-export.json` })
    await archive.finalize()
    console.log('[Export API] Finalize called')
  } catch (err: any) {
    console.error('[Export API] Error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Import agent bundle from a local directory path
router.post('/import-directory', async (req, res) => {
  try {
    assertTenantResourceCapacity('agents', listAgents().length)
    const { sourcePath, targetId } = req.body as { sourcePath?: string; targetId?: string }
    if (!sourcePath || typeof sourcePath !== 'string') {
      return res.status(400).json({ error: 'sourcePath is required' })
    }
    if (targetId && !/^[a-zA-Z0-9_-]+$/.test(targetId)) {
      return res.status(400).json({ error: 'Invalid targetId' })
    }

    const result = importAgentFromBundleDirectory(sourcePath, targetId)
    res.json({ ok: true, ...result })
  } catch (err: any) {
    const limitResponse = tenantResourceLimitResponse(err)
    if (limitResponse) return res.status(limitResponse.statusCode).json(limitResponse.body)
    res.status(500).json({ error: err.message })
  }
})

// Import agent bundle from ZIP upload
router.post('/import-zip', express.raw({ type: 'application/zip', limit: '25mb' }), async (req, res) => {
  try {
    assertTenantResourceCapacity('agents', listAgents().length)
    const targetId = typeof req.query.targetId === 'string' ? req.query.targetId : undefined
    if (targetId && !/^[a-zA-Z0-9_-]+$/.test(targetId)) {
      return res.status(400).json({ error: 'Invalid targetId' })
    }

    const body = req.body as Buffer
    if (!body || !Buffer.isBuffer(body) || body.length === 0) {
      return res.status(400).json({ error: 'ZIP body is required' })
    }

    const tmpDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'clawmax-import-zip-'))
    const zipPath = path.join(tmpDir, 'import.zip')
    fs.writeFileSync(zipPath, body)

    const result = importAgentFromZipArchive(zipPath, targetId)
    res.json({ ok: true, ...result })
  } catch (err: any) {
    const limitResponse = tenantResourceLimitResponse(err)
    if (limitResponse) return res.status(limitResponse.statusCode).json(limitResponse.body)
    res.status(500).json({ error: err.message })
  }
})

// List importable OpenClaw agents from ~/.openclaw/agents
router.get('/openclaw/importable', async (_req, res) => {
  try {
    res.json({ agents: listImportableOpenClawAgents() })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Import OpenClaw agent into current workspace
router.post('/openclaw/import', async (req, res) => {
  try {
    assertTenantResourceCapacity('agents', listAgents().length)
    const { sourceId, targetId } = req.body as { sourceId?: string; targetId?: string }
    if (!sourceId || !/^[a-zA-Z0-9_-]+$/.test(sourceId)) {
      return res.status(400).json({ error: 'Valid sourceId is required' })
    }
    if (targetId && !/^[a-zA-Z0-9_-]+$/.test(targetId)) {
      return res.status(400).json({ error: 'Invalid targetId' })
    }

    const result = importAgentFromOpenClaw(sourceId, targetId)
    res.json({ ok: true, ...result })
  } catch (err: any) {
    const limitResponse = tenantResourceLimitResponse(err)
    if (limitResponse) return res.status(limitResponse.statusCode).json(limitResponse.body)
    res.status(500).json({ error: err.message })
  }
})

// Export workspace agent into ~/.openclaw/agents
router.post('/:id/export-openclaw', async (req, res) => {
  try {
    const { id } = req.params
    const { targetId, includeSkills, includeMemberships } = req.body as {
      targetId?: string
      includeSkills?: boolean
      includeMemberships?: boolean
    }
    if (targetId && !/^[a-zA-Z0-9_-]+$/.test(targetId)) {
      return res.status(400).json({ error: 'Invalid targetId' })
    }

    const result = exportAgentToOpenClaw(id, targetId, { includeSkills, includeMemberships })
    res.json({ ok: true, ...result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
function isVisibleChatRole(role: unknown): role is 'user' | 'assistant' {
  return role === 'user' || role === 'assistant'
}
