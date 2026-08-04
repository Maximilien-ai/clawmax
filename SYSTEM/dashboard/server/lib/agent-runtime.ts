/**
 * Runtime adapter: resolves which agent CLI (openclaw / claude / droid) executes an agent,
 * and builds the spawn plan + shared executor for the non-openclaw runtimes.
 *
 * OpenClaw remains the default and its existing spawn call sites are untouched — this module
 * only centralizes *resolution* for openclaw (so callers stop hand-rolling CLI detection) and
 * owns the full spawn plan for claude/droid.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { execFile, execFileSync, spawn } from 'child_process'
import { resolveOpenClawCliPath } from './openclaw-cli'
import { readWorkspaceIntegrationConfig } from './workspace-integrations'
import { safeEnv } from './safe-env'
import { hasRuntimeSession, markRuntimeSession } from './runtime-sessions'

export type AgentRuntimeId = 'openclaw' | 'claude' | 'droid'

export const AGENT_RUNTIME_IDS: AgentRuntimeId[] = ['openclaw', 'claude', 'droid']

export function normalizeAgentRuntime(v: unknown): AgentRuntimeId | undefined {
  if (typeof v !== 'string') return undefined
  const trimmed = v.trim().toLowerCase()
  return (AGENT_RUNTIME_IDS as string[]).includes(trimmed) ? (trimmed as AgentRuntimeId) : undefined
}

// ── CLI resolution ──

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function resolveBinFromPath(bin: string): string | null {
  try {
    const resolved = String(execFileSync('which', [bin], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }) || '').trim()
    return resolved || null
  } catch {
    return null
  }
}

const RUNTIME_BIN_ENV: Record<'claude' | 'droid', string> = {
  claude: 'CLAUDE_BIN',
  droid: 'DROID_BIN',
}

export function resolveRuntimeCliPath(rt: AgentRuntimeId): string | null {
  if (rt === 'openclaw') return resolveOpenClawCliPath()

  const bin = rt
  const envVar = RUNTIME_BIN_ENV[rt]
  const override = String(process.env[envVar] || '').trim()
  if (override && isExecutable(override)) return override

  const fromPath = resolveBinFromPath(bin)
  if (fromPath && isExecutable(fromPath)) return fromPath

  const homeCandidate = path.join(os.homedir(), '.local', 'bin', bin)
  if (isExecutable(homeCandidate)) return homeCandidate

  return null
}

// ── Status detection (for doctor/prereqs + BYOK Runtime step) ──

export interface RuntimeStatus {
  id: AgentRuntimeId
  label: string
  installed: boolean
  version?: string
  cliPath?: string
  installHint: string
  active: boolean
}

const RUNTIME_LABELS: Record<AgentRuntimeId, string> = {
  openclaw: 'OpenClaw',
  claude: 'Claude Code',
  droid: 'Factory Droid',
}

const RUNTIME_INSTALL_HINTS: Record<AgentRuntimeId, string> = {
  openclaw: 'Run: npm install -g openclaw',
  claude: 'Run: npm install -g @anthropic-ai/claude-code (or set CLAUDE_BIN to the executable path)',
  droid: 'Install the Factory Droid CLI and ensure it is on PATH (or set DROID_BIN to the executable path)',
}

export function detectRuntimeStatuses(active: AgentRuntimeId): RuntimeStatus[] {
  return AGENT_RUNTIME_IDS.map((id) => {
    const cliPath = resolveRuntimeCliPath(id)
    let version: string | undefined
    let installed = false

    if (cliPath) {
      try {
        const raw = String(execFileSync(cliPath, ['--version'], {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 5000,
          windowsHide: true,
          env: safeEnv(),
        }) || '').trim()
        if (raw) {
          version = raw.split('\n')[0].trim()
          installed = true
        }
      } catch {
        installed = false
      }
    }

    return {
      id,
      label: RUNTIME_LABELS[id],
      installed,
      version,
      cliPath: cliPath || undefined,
      installHint: RUNTIME_INSTALL_HINTS[id],
      active: id === active,
    }
  })
}

// ── Workspace / per-agent resolution ──

export function resolveWorkspaceRuntime(): AgentRuntimeId {
  return normalizeAgentRuntime(readWorkspaceIntegrationConfig().agentRuntime) || 'openclaw'
}

function parseRuntimeEnvList(raw: string | undefined): string[] {
  return (raw || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
}

/**
 * CLI runtimes enabled for the workspace (multi-select). OpenClaw is always available and not listed.
 * Per-workspace config wins — an explicit empty list means "all CLIs off". When a workspace has never
 * configured runtimes, fall back to the WORKSPACES_INTEGRATIONS_RUNTIMES env default, the same
 * deployment-default shape partners use with WORKSPACES_INTEGRATIONS_THIRD_PARTIES.
 */
export function resolveEnabledRuntimes(): AgentRuntimeId[] {
  const config = readWorkspaceIntegrationConfig().enabledRuntimes
  const raw = Array.isArray(config) ? config : parseRuntimeEnvList(process.env.WORKSPACES_INTEGRATIONS_RUNTIMES)
  return raw
    .map((item) => normalizeAgentRuntime(item))
    .filter((rt): rt is AgentRuntimeId => rt === 'claude' || rt === 'droid')
}

export function resolveAgentRuntime(agentId: string, identityRuntime?: string): AgentRuntimeId {
  // agentId is accepted (not just identityRuntime) so future per-agent overrides beyond
  // IDENTITY.md parsing can slot in here without changing every call site's signature.
  void agentId
  const pinned = normalizeAgentRuntime(identityRuntime)
  // Unpinned agents (and openclaw pins) run on OpenClaw. A claude/droid pin is honored only when
  // that CLI is enabled for the workspace; a pin to a disabled CLI falls back to OpenClaw.
  if (!pinned || pinned === 'openclaw') return 'openclaw'
  return resolveEnabledRuntimes().includes(pinned) ? pinned : 'openclaw'
}

// ── Model notation translation ──

export class RuntimeModelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RuntimeModelError'
  }
}

function splitModelProvider(model: string): { provider: string; rest: string } {
  const idx = model.indexOf('/')
  if (idx === -1) return { provider: '', rest: model }
  return { provider: model.slice(0, idx), rest: model.slice(idx + 1) }
}

export function runtimeModelArg(rt: AgentRuntimeId, model?: string): string | undefined {
  if (rt === 'claude') {
    const { provider, rest } = model ? splitModelProvider(model) : { provider: '', rest: '' }
    if (provider !== 'anthropic' || !rest) {
      throw new RuntimeModelError(
        `Claude Code runtime supports Anthropic models only. Agent model is '${model || 'none'}'. Pick an Anthropic model or switch the agent's runtime.`
      )
    }
    return rest
  }

  if (rt === 'droid') {
    if (!model) return undefined
    const { rest } = splitModelProvider(model)
    return rest || model
  }

  return model
}

// ── Deterministic claude session UUID ──

export function claudeSessionUuid(scopedSessionId: string, agentId: string): string {
  const hash = crypto.createHash('sha256').update(`clawmax:${agentId}:${scopedSessionId}`).digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

// ── Deterministic droid session id ──

const DROID_SESSION_ID_MAX_LENGTH = 48

export function droidSessionId(scopedSessionId: string, agentId: string): string {
  // Droid's `-s` value is looked up in a flat, workspace-wide session store with zero validation
  // (droid-probe.md probe 2c: an unrecognized id silently starts a brand-new session keyed off
  // that literal string). Mixing agentId into the hash — same reasoning as claudeSessionUuid
  // above — guarantees two different agents can never collide on the same underlying droid
  // session even when handed an identical raw scopedSessionId (e.g. agents sharing a DM key).
  // Hex output is already droid-safe ([0-9a-f]) and the slice keeps it well under droid's
  // documented ~48-char safe session-id length.
  const hash = crypto.createHash('sha256').update(`clawmax:droid:${agentId}:${scopedSessionId}`).digest('hex')
  return hash.slice(0, DROID_SESSION_ID_MAX_LENGTH)
}

// ── Spawn plan ──

export interface RuntimePlan {
  cliPath: string | null
  args: string[]
  cwd?: string
  missingCliError: string
  streamsDeltas: boolean
}

const MISSING_CLI_ERRORS: Record<AgentRuntimeId, string> = {
  openclaw: 'OpenClaw CLI is not available in this runtime. Install or bundle the CLI, or set OPENCLAW_BIN to the executable path.',
  claude: 'Claude Code CLI is not available in this runtime. Install it or set CLAUDE_BIN to the executable path.',
  droid: 'Factory Droid CLI is not available in this runtime. Install it or set DROID_BIN to the executable path.',
}

export function buildRuntimePlan(o: {
  runtime: AgentRuntimeId
  mode: 'chat' | 'json'
  agentId: string
  scopedSessionId: string
  message: string
  model?: string
  agentDir: string
  systemPrompt?: string
  resume: boolean
}): RuntimePlan {
  const cliPath = resolveRuntimeCliPath(o.runtime)
  const missingCliError = MISSING_CLI_ERRORS[o.runtime]

  if (o.runtime === 'openclaw') {
    const args = ['agent', '--agent', o.agentId, '--session-id', o.scopedSessionId, '--message', o.message]
    if (o.mode === 'json') args.push('--json')
    return { cliPath, args, missingCliError, streamsDeltas: o.mode === 'chat' }
  }

  if (o.runtime === 'claude') {
    const sessionUuid = claudeSessionUuid(o.scopedSessionId, o.agentId)
    const args = [
      '-p', o.message,
      '--model', runtimeModelArg('claude', o.model) as string,
      o.resume ? '--resume' : '--session-id', sessionUuid,
      '--dangerously-skip-permissions',
      ...(o.systemPrompt ? ['--append-system-prompt', o.systemPrompt] : []),
      ...(o.mode === 'json' ? ['--output-format', 'json'] : []),
    ]
    return { cliPath, args, cwd: o.agentDir, missingCliError, streamsDeltas: o.mode === 'chat' }
  }

  // droid
  const droidModel = runtimeModelArg('droid', o.model)
  const args = [
    'exec', o.message,
    ...(droidModel ? ['-m', droidModel] : []),
    '-s', droidSessionId(o.scopedSessionId, o.agentId),
    '--auto', 'high',
    '-o', 'json',
    '--cwd', o.agentDir,
    ...(o.systemPrompt ? ['--append-system-prompt', o.systemPrompt] : []),
  ]
  return { cliPath, args, missingCliError, streamsDeltas: false }
}

// ── Result parsing ──

export function parseRuntimeResult(
  rt: AgentRuntimeId,
  mode: 'chat' | 'json',
  stdout: string,
  stderr: string,
  exitCode: number | null
): { text: string; errorText?: string } {
  // droid always emits its `-o json` envelope regardless of mode; claude only in json mode.
  const usesJson = rt === 'droid' || (rt === 'claude' && mode === 'json')

  if (usesJson) {
    let parsed: any
    try {
      parsed = JSON.parse(stdout.trim())
    } catch {
      parsed = undefined
    }
    if (parsed && parsed.is_error === false && typeof parsed.result === 'string' && exitCode === 0) {
      return { text: parsed.result }
    }
    const errorText = (stderr || stdout).trim() || `${rt} exited with code ${exitCode}`
    return { text: '', errorText }
  }

  // claude plain-text chat mode (also the fallback for any other non-json case)
  if (exitCode !== 0) {
    return { text: '', errorText: (stderr || stdout).trim() || `${rt} exited with code ${exitCode}` }
  }
  return { text: stdout.trim() }
}

export function classifyClaudeSessionError(stderr: string, stdout: string): 'already-in-use' | 'not-found' | null {
  const combined = `${stderr}\n${stdout}`
  if (/Session ID .* is already in use\./i.test(combined)) return 'already-in-use'
  if (/No conversation found with session ID/i.test(combined)) return 'not-found'
  return null
}

// ── Identity system prompt ──

export function readAgentIdentitySystemPrompt(agentDir: string): string | undefined {
  try {
    const identityPath = path.join(agentDir, 'IDENTITY.md')
    if (!fs.existsSync(identityPath)) return undefined
    const content = fs.readFileSync(identityPath, 'utf-8')
    const metadataIndex = content.search(/^##\s+Creation Metadata\b/im)
    const runtimeSection = (metadataIndex === -1 ? content : content.slice(0, metadataIndex)).trim()
    if (!runtimeSection) return undefined
    return runtimeSection.length > 16000 ? runtimeSection.slice(0, 16000) : runtimeSection
  } catch {
    return undefined
  }
}

// ── Shared executor for non-openclaw runtimes ──

interface RunOnceResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
}

function runOnce(
  plan: RuntimePlan,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  onChunk?: (text: string) => void
): Promise<RunOnceResult> {
  return new Promise((resolve) => {
    if (!plan.cliPath) {
      resolve({ stdout: '', stderr: plan.missingCliError, exitCode: null, timedOut: false })
      return
    }

    const child = spawn(plan.cliPath, plan.args, { env, cwd: plan.cwd })
    // The prompt is passed via CLI args, never stdin. Close stdin so claude/droid don't block
    // waiting on it (claude otherwise stalls ~3s and emits a "no stdin data received" warning).
    child.stdin?.end()
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      if (onChunk) onChunk(text)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ stdout, stderr: stderr || err.message || String(err), exitCode: null, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: code, timedOut })
    })
  })
}

export async function runRuntimeCli(o: {
  plan: RuntimePlan
  env: NodeJS.ProcessEnv
  timeoutMs: number
  rebuildPlan: (resume: boolean) => RuntimePlan
  runtime: AgentRuntimeId
  mode: 'chat' | 'json'
  agentId: string
  scopedSessionId: string
  onDelta?: (text: string) => void
}): Promise<{ text: string; errorText?: string }> {
  // Claude Code refuses --dangerously-skip-permissions when running as root (e.g. inside the
  // container image, which runs as root) unless IS_SANDBOX marks a controlled environment. The
  // dashboard always runs claude non-interactively with that flag, so opt in when we are root.
  const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0
  const effectiveEnv: NodeJS.ProcessEnv = o.runtime === 'claude' && runningAsRoot
    ? { ...o.env, IS_SANDBOX: '1' }
    : o.env

  const attempt = async (plan: RuntimePlan) => {
    const onChunk = plan.streamsDeltas && o.onDelta ? o.onDelta : undefined
    const result = await runOnce(plan, effectiveEnv, o.timeoutMs, onChunk)
    if (result.timedOut) {
      return { result, text: '', errorText: 'timeout' as const }
    }
    const parsed = parseRuntimeResult(o.runtime, o.mode, result.stdout, result.stderr, result.exitCode)
    if (!parsed.errorText && !plan.streamsDeltas && o.onDelta) {
      // droid/others don't stream — deliver the final text once so callers get a uniform delta+complete shape.
      o.onDelta(parsed.text)
    }
    return { result, text: parsed.text, errorText: parsed.errorText }
  }

  const first = await attempt(o.plan)

  if (o.runtime === 'claude' && first.errorText && !first.result.timedOut) {
    const classification = classifyClaudeSessionError(first.result.stderr, first.result.stdout)
    if (classification === 'not-found' || classification === 'already-in-use') {
      const retryPlan = o.rebuildPlan(classification === 'not-found' ? false : true)
      const retry = await attempt(retryPlan)
      if (!retry.errorText) {
        markRuntimeSession(o.runtime, o.agentId, o.scopedSessionId)
      }
      return { text: retry.text, errorText: retry.errorText }
    }
  }

  if (!first.errorText && o.runtime === 'claude') {
    markRuntimeSession(o.runtime, o.agentId, o.scopedSessionId)
  }

  return { text: first.text, errorText: first.errorText }
}

// ── Single entry point for running one non-openclaw agent turn ──
//
// Every execution surface (direct chat, group/channel chat, workflows, dashboard agent chat)
// previously repeated the same sequence: read the identity system prompt, build a plan, decide
// whether to resume, check the CLI exists, then call runRuntimeCli. Four copies meant four
// chances to drift, and every release that touched chat/workflow plumbing conflicted with all
// of them. Adding a runtime should only touch buildRuntimePlan() and the tables above.
//
// Note: the call sites used to wrap this in withTemporaryAgentAuthProfiles(). That wrapper
// returns fn() immediately for any non-openclaw runtime (see agent-execution.ts), so the
// provider-key mapping it was given was dead code on these paths. If that ever changes, this
// is the one place to reinstate it.
export interface AgentRuntimeTurnOptions {
  runtime: AgentRuntimeId
  agentId: string
  agentDir: string
  message: string
  scopedSessionId: string
  model?: string
  mode: 'chat' | 'json'
  env: NodeJS.ProcessEnv
  timeoutMs: number
  /** Streamed incremental text, when the runtime and mode support it. */
  onDelta?: (text: string) => void
  /** Called once the spawn plan is resolved and the CLI is known to exist (for logging). */
  onPlan?: (plan: RuntimePlan) => void
}

export interface AgentRuntimeTurnResult {
  text: string
  errorText?: string
  /** Set when the runtime's CLI is not installed; callers surface this instead of a reply. */
  missingCliError?: string
}

export async function executeAgentRuntimeTurn(o: AgentRuntimeTurnOptions): Promise<AgentRuntimeTurnResult> {
  const systemPrompt = readAgentIdentitySystemPrompt(o.agentDir)
  const rebuildPlan = (resume: boolean) => buildRuntimePlan({
    runtime: o.runtime,
    mode: o.mode,
    agentId: o.agentId,
    scopedSessionId: o.scopedSessionId,
    message: o.message,
    model: o.model,
    agentDir: o.agentDir,
    systemPrompt,
    resume,
  })

  const plan = rebuildPlan(hasRuntimeSession(o.runtime, o.agentId, o.scopedSessionId))
  if (!plan.cliPath) return { text: '', missingCliError: plan.missingCliError }
  o.onPlan?.(plan)

  const { text, errorText } = await runRuntimeCli({
    plan,
    env: o.env,
    timeoutMs: o.timeoutMs,
    rebuildPlan,
    runtime: o.runtime,
    mode: o.mode,
    agentId: o.agentId,
    scopedSessionId: o.scopedSessionId,
    onDelta: o.onDelta,
  })
  return { text, errorText }
}

// ── Model catalog per runtime ──
//
// The agent editor's Model dropdown is populated from provider APIs (OpenAI, Anthropic, ...),
// whose identifiers do not always match what a runtime CLI accepts. Droid, for example, rejects
// `claude-sonnet-4-5` but accepts `claude-sonnet-4-5-20250929` for the same model. Pinning an
// agent to a runtime should therefore offer that runtime's own catalog, not the provider list.
//
// Droid has no "list models" command, but naming an unknown model makes it print its built-in
// catalog and exit immediately (~1s), so that is the probe. Results are cached; an unavailable
// or unparseable CLI yields an empty list, which callers treat as "cannot enumerate — allow
// anything" rather than "no models exist".
const RUNTIME_MODEL_CACHE_TTL_MS = 10 * 60 * 1000
const runtimeModelCache = new Map<AgentRuntimeId, { models: string[]; expiresAt: number }>()
const runtimeModelProbes = new Map<AgentRuntimeId, Promise<string[]>>()

async function probeDroidModels(cliPath: string): Promise<string[]> {
  // Async on purpose: the dashboard is single-threaded, and execFileSync here would block every
  // other request (including SSE chat streams) for the whole timeout if the CLI hangs.
  const output = await new Promise<string>((resolve) => {
    execFile(cliPath, ['exec', 'x', '-m', '__clawmax_model_probe__'], {
      encoding: 'utf-8',
      timeout: 10000,
      windowsHide: true,
      env: safeEnv(),
    }, (err: any, stdout, stderr) => {
      // Naming an unknown model is an error exit; the catalog is on stdout/stderr either way.
      resolve(String(stdout || '') + String(stderr || '') + String(err?.stdout || '') + String(err?.stderr || ''))
    })
  })
  const marker = output.indexOf('Available built-in models:')
  if (marker === -1) return []
  return output
    .slice(marker + 'Available built-in models:'.length)
    .split('\n')
    .slice(0, 2)
    .join(' ')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry))
}

/** Models a runtime CLI accepts, or [] when the catalog cannot be enumerated. */
export async function listRuntimeModels(runtime: AgentRuntimeId): Promise<string[]> {
  if (runtime === 'openclaw') return []
  const cached = runtimeModelCache.get(runtime)
  if (cached && cached.expiresAt > Date.now()) return cached.models
  // Collapse concurrent misses onto one probe instead of spawning a CLI per request.
  const inFlight = runtimeModelProbes.get(runtime)
  if (inFlight) return await inFlight

  const probe = (async () => {
    const cliPath = resolveRuntimeCliPath(runtime)
    let models: string[] = []
    if (cliPath && runtime === 'droid') models = await probeDroidModels(cliPath)
  // Claude Code takes any Anthropic model id and has no enumerable catalog; runtimeModelArg()
  // already rejects non-Anthropic models, so leave this empty and let the provider list stand.

    runtimeModelCache.set(runtime, { models, expiresAt: Date.now() + RUNTIME_MODEL_CACHE_TTL_MS })
    return models
  })().finally(() => { runtimeModelProbes.delete(runtime) })

  runtimeModelProbes.set(runtime, probe)
  return await probe
}
