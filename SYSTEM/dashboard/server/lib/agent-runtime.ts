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
import { clearRuntimeSession, hasRuntimeSession, markRuntimeSession } from './runtime-sessions'

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

// CLI locations do not change while the process runs, but resolution shells out to `which`.
// Four paths added by the runtime feature call this per request (spawn plan, status detection,
// model catalog, generation runtime pick), so memoize with a short TTL.
const CLI_PATH_TTL_MS = 60 * 1000
const cliPathCache = new Map<string, { path: string | null; expiresAt: number }>()

export function resolveRuntimeCliPath(rt: AgentRuntimeId): string | null {
  if (rt === 'openclaw') return resolveOpenClawCliPath()
  // Keyed on every input the lookup reads, so changing an override, PATH or HOME resolves afresh
  // rather than serving a stale hit.
  const key = [rt, process.env[RUNTIME_BIN_ENV[rt]] || '', process.env.PATH || '', process.env.HOME || ''].join('\u0000')
  const cached = cliPathCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.path
  const resolved = resolveRuntimeCliPathUncached(rt)
  if (cliPathCache.size > 64) cliPathCache.clear()
  cliPathCache.set(key, { path: resolved, expiresAt: Date.now() + CLI_PATH_TTL_MS })
  return resolved
}

function resolveRuntimeCliPathUncached(rt: Exclude<AgentRuntimeId, 'openclaw'>): string | null {
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

export function runtimeLabel(rt: AgentRuntimeId): string {
  return RUNTIME_LABELS[rt] || rt
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

/**
 * The runtime an agent is pinned to in IDENTITY.md, whether or not it is currently enabled.
 * resolveAgentRuntime() deliberately falls back to openclaw for a disabled pin; callers use this
 * to tell "runs on openclaw by choice" apart from "pin silently ignored", which otherwise
 * surfaces as a confusing provider-credential error.
 */
export function pinnedAgentRuntime(identityRuntime?: string): AgentRuntimeId | undefined {
  const pinned = normalizeAgentRuntime(identityRuntime)
  return pinned && pinned !== 'openclaw' ? pinned : undefined
}

export function isPinnedRuntimeDisabled(identityRuntime?: string): AgentRuntimeId | undefined {
  const pinned = pinnedAgentRuntime(identityRuntime)
  return pinned && !resolveEnabledRuntimes().includes(pinned) ? pinned : undefined
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

function splitModelProvider(model: string): { provider: string; rest: string } {
  const idx = model.indexOf('/')
  if (idx === -1) return { provider: '', rest: model }
  return { provider: model.slice(0, idx), rest: model.slice(idx + 1) }
}

/** Model a runtime falls back to when the agent's configured one is not one it can run. */
export const RUNTIME_DEFAULT_MODELS: Record<AgentRuntimeId, string | undefined> = {
  openclaw: undefined,
  claude: 'sonnet',
  droid: undefined, // droid selects its own current default when handed none
}

/**
 * Whether a runtime's own catalog accepts a model id. Mirrors runtimeAcceptsModel() on the
 * client: ClawMax stores `provider/model` while the CLIs take a bare id, and an empty catalog
 * means the runtime could not enumerate one, so nothing can be ruled out.
 */
export function runtimeAcceptsModelId(runtimeModels: string[], model?: string): boolean {
  if (runtimeModels.length === 0) return true
  const value = String(model || '').trim()
  if (!value) return false
  const bare = value.includes('/') ? value.slice(value.indexOf('/') + 1) : value
  return runtimeModels.includes(value) || runtimeModels.includes(bare)
}

/**
 * The Claude Code subscription token, when the deployment supplies one.
 *
 * Produced by `claude setup-token` on a machine with a browser and set on the container. It is a
 * distinct credential from an interactive host login, which is the point: a host login's refresh
 * token rotates, so a copy shared with the container invalidates whichever side refreshes second.
 * This token does not participate in that rotation.
 *
 * Read at spawn time rather than captured at import, so recreating the container with a new value
 * takes effect on the next turn without any in-process caching to invalidate.
 */
/**
 * A copy of `env` with the Claude-specific credential removed.
 *
 * Enforced here, at the one place every runtime spawn passes through, because callers vary: some
 * build a curated env via safeEnv(), others forward `process.env` wholesale.
 */
export function withoutClaudeCredentials(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!('CLAUDE_CODE_OAUTH_TOKEN' in env)) return env
  const { CLAUDE_CODE_OAUTH_TOKEN, ...rest } = env
  void CLAUDE_CODE_OAUTH_TOKEN
  return rest
}

export function claudeSubscriptionToken(): string | undefined {
  const value = String(process.env.CLAUDE_CODE_OAUTH_TOKEN || '').trim()
  return value || undefined
}

export function runtimeModelArg(rt: AgentRuntimeId, model?: string): string | undefined {
  if (rt === 'claude') {
    // Aliases carry no provider prefix and are what the picker now offers.
    if (model && CLAUDE_MODEL_ALIASES.includes(model.trim())) return model.trim()
    const { provider, rest } = model ? splitModelProvider(model) : { provider: '', rest: '' }
    if (provider !== 'anthropic' || !rest) {
      // Agents exist on disk with a CLI runtime and a provider model — the suggestion panel used
      // to rank the provider catalog for a pinned runtime and write the winner in. Refusing the
      // turn made those agents permanently unusable until hand-edited, so run them on the
      // runtime's own default instead and say so in the log rather than to the user.
      console.warn(
        `[Agent Runtime] claude cannot run model '${model || 'none'}'; using '${RUNTIME_DEFAULT_MODELS.claude}' for this turn`,
      )
      return RUNTIME_DEFAULT_MODELS.claude
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
      // Chat streams events instead of buffering. `claude -p` prints nothing at all until the
      // whole turn is finished, so a real task -- research that reads files, runs tools and
      // spawns work -- looked identical to a hung process: no output for minutes, then the
      // dashboard killed it at its deadline and reported a timeout while the agent was working.
      // stream-json gives per-event output, which drives both the live UI and the idle deadline.
      ...(o.mode === 'json' ? ['--output-format', 'json'] : ['--output-format', 'stream-json', '--verbose']),
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

/**
 * These CLIs can fail with no output at all — droid does exactly that when it is unauthenticated
 * and given a session id. "droid exited with code 1" leaves an operator with nowhere to go, so
 * name the most likely cause instead.
 */
function silentExitMessage(rt: AgentRuntimeId, exitCode: number | null): string {
  const label = runtimeLabel(rt)
  return `The ${label} CLI exited with code ${exitCode} and produced no output. It is most likely not authenticated in this environment — set ANTHROPIC_API_KEY / FACTORY_API_KEY, or log the CLI in.`
}


/**
 * Collapse a claude `--output-format stream-json` event log into the assistant's reply.
 *
 * Each line is one JSON event. Only assistant text is kept: tool calls, tool results and thinking
 * are progress, not the answer. A `result` event carries the final text when present. Anything
 * unparseable is ignored rather than failing the turn, since a partial log is normal when the
 * deadline cuts a turn short.
 */

/**
 * Turn a claude stream-json byte stream into readable deltas.
 *
 * The raw stream is one JSON event per line; forwarding it verbatim would print JSON into the
 * chat window. Emits assistant text only, and keeps a buffer because a chunk can split a line.
 */
export function createClaudeStreamDeltaTransformer(emit: (text: string) => void): (chunk: string) => void {
  let buffer = ''
  return (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) continue
      let event: any
      try { event = JSON.parse(trimmed) } catch { continue }
      if (event?.type !== 'assistant') continue
      for (const block of event?.message?.content || []) {
        if (block?.type === 'text' && typeof block.text === 'string' && block.text) emit(block.text)
      }
    }
  }
}

export function parseClaudeStreamJson(
  stdout: string,
  stderr: string,
  exitCode: number | null,
): { text: string; errorText?: string } {
  const parts: string[] = []
  let finalResult = ''
  let errorFromEvents = ''
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    let event: any
    try { event = JSON.parse(trimmed) } catch { continue }
    if (event?.type === 'result') {
      // A failing result carries its message in the same `result` field; treating it as the
      // answer would surface an error to the user as if the agent had replied it. A failure with
      // a non-string payload (null, or an object) must still register as a failure -- otherwise
      // the partial text streamed before it is returned as a successful reply.
      if (event.is_error) {
        errorFromEvents = typeof event.result === 'string' && event.result.trim()
          ? event.result
          : `${runtimeLabel('claude')} reported an error without a message${event.subtype ? ` (${event.subtype})` : ''}.`
      } else if (typeof event.result === 'string') {
        finalResult = event.result
      }
      continue
    }
    if (event?.type !== 'assistant') continue
    for (const block of event?.message?.content || []) {
      if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    }
  }
  // A failing result outranks anything already streamed. A turn that emits partial text and then
  // fails (quota, model error, tool failure) must not be persisted and shown as a successful reply.
  if (errorFromEvents) return { text: '', errorText: errorFromEvents }
  const text = (finalResult || parts.join('')).trim()
  if (text) return { text }
  const failure = (stderr || '').trim()
  return { text: '', errorText: failure || silentExitMessage('claude', exitCode) }
}

export function parseRuntimeResult(
  rt: AgentRuntimeId,
  mode: 'chat' | 'json',
  stdout: string,
  stderr: string,
  exitCode: number | null
): { text: string; errorText?: string } {
  const rawFailureText = () => (stderr || stdout).trim() || silentExitMessage(rt, exitCode)

  if (rt === 'claude' && mode === 'chat') {
    return parseClaudeStreamJson(stdout, stderr, exitCode)
  }

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
    // These CLIs report real failures inside their own JSON envelope (auth, unknown model, quota)
    // with a human-readable `result`. Surface that rather than a raw JSON blob or a bare exit
    // code — "droid exited with code 1" tells an operator nothing, while the envelope says
    // exactly what to fix.
    const envelopeMessage = parsed && typeof parsed.result === 'string' ? parsed.result.trim() : ''
    return { text: '', errorText: envelopeMessage || rawFailureText() }
  }

  // claude plain-text chat mode (also the fallback for any other non-json case)
  if (exitCode !== 0) {
    return { text: '', errorText: rawFailureText() }
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
  /** True when the deadline fired before the CLI produced anything at all, rather than after it
   *  streamed and then went quiet. The two are different failures and read differently to a user. */
  timedOutWithoutOutput?: boolean
}

/**
 * How long a runtime CLI may produce *nothing at all* before it is treated as wedged.
 *
 * Separate from the idle allowance on purpose. With `--output-format stream-json` the CLI emits an
 * init event within seconds, so total silence past this point means it is not going to speak --
 * typically a resumed session that will never respond. Failing fast here is what lets the
 * fresh-session recovery run while the caller is still waiting, instead of after the full
 * idle allowance has burned.
 */
/**
 * Idle allowance for one runtime attempt: how long a turn may stay silent after it has started
 * speaking. Exported so the chat route can derive a strictly longer backstop -- if the two are
 * equal they race, and the route can end the response while a fresh-session retry is still running
 * server-side, which is invisible to the user.
 */
export const RUNTIME_IDLE_TIMEOUT_MS = 600000

export const FIRST_OUTPUT_TIMEOUT_MS = 90000

/**
 * How long a plan may produce nothing before it is treated as wedged.
 *
 * Only a plan that streams is expected to speak early. Buffered JSON modes (generation, workflows,
 * channels) legitimately emit nothing until the final result, so the short first-output cap must
 * not apply to them or a healthy multi-minute turn is killed at 90s. Extracted so that rule is
 * assertable directly: a test that merely runs a fast buffered turn cannot distinguish the two.
 */
/**
 * Whether a runtime turn ended on a deadline, in either class.
 *
 * Callers used to compare against the bare string 'timeout'. Splitting the classes would have made
 * every one of those comparisons silently miss, leaking the raw sentinel to users as their error
 * message, so the check lives here instead of being repeated at four call sites.
 */
export function isRuntimeTimeoutError(errorText?: string): boolean {
  return errorText === 'timeout' || errorText === 'timeout-no-output'
}

export function effectiveFirstOutputTimeoutMs(streamsDeltas: boolean, timeoutMs: number): number {
  return streamsDeltas ? Math.min(timeoutMs, FIRST_OUTPUT_TIMEOUT_MS) : timeoutMs
}

function runOnce(
  plan: RuntimePlan,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  onChunk?: (text: string) => void,
  /**
   * Fires on every byte the CLI produces, including tool calls and thinking that never become
   * visible text. Callers use it for liveness: a turn doing fifteen minutes of tool work emits
   * almost no assistant prose, so a watchdog fed only by visible deltas kills a healthy turn.
   */
  onActivity?: () => void,
): Promise<RunOnceResult> {
  return new Promise((resolve) => {
    if (!plan.cliPath) {
      resolve({ stdout: '', stderr: plan.missingCliError, exitCode: null, timedOut: false })
      return
    }

    // Own process group: these CLIs spawn their own children, and signalling only the direct
    // child leaves those grandchildren alive holding the stdout pipe open.
    const child = spawn(plan.cliPath, plan.args, { env, cwd: plan.cwd, detached: true })
    // The prompt is passed via CLI args, never stdin. Close stdin so claude/droid don't block
    // waiting on it (claude otherwise stalls ~3s and emits a "no stdin data received" warning).
    child.stdin?.end()
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    /** Signal the whole group, falling back to the child if the group is already gone. */
    const killTree = (signal: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, signal)
      } catch {
        try { child.kill(signal) } catch { /* already exited */ }
      }
    }

    const settle = (result: RunOnceResult, opts: { keepEscalation?: boolean } = {}) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // On the timeout path the SIGKILL escalation was armed moments ago and must outlive this
      // resolve, or a CLI that traps SIGTERM survives forever: settling used to clear the very
      // timer that was going to kill it.
      if (killEscalation && !opts.keepEscalation) clearTimeout(killEscalation)
      resolve(result)
    }

    // Two different deadlines, because "has not spoken yet" and "has gone quiet" are different
    // failures. A turn that has produced nothing at all is very likely wedged -- with stream-json
    // the CLI emits its init event within seconds -- so it must fail fast. A turn that has been
    // streaming and then pauses is doing tool work and deserves the full idle allowance. Using one
    // generous deadline for both meant a wedged session took the whole allowance to fail: a bare
    // "ping" sat for ten minutes before erroring.
    const firstOutputMs = effectiveFirstOutputTimeoutMs(plan.streamsDeltas, timeoutMs)
    let sawOutput = false
    const armDeadline = () => setTimeout(onDeadline, sawOutput ? timeoutMs : firstOutputMs)
    let timer: NodeJS.Timeout
    const bumpDeadline = () => {
      if (settled) return
      sawOutput = true
      clearTimeout(timer)
      timer = armDeadline()
    }

    // SIGTERM alone is a request, not a guarantee — a CLI that traps or ignores it keeps running
    // and outlives the caller. Escalate to SIGKILL if it has not exited shortly after.
    let killEscalation: NodeJS.Timeout | undefined
    function onDeadline() {
      timedOut = true
      killTree('SIGTERM')
      killEscalation = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) killTree('SIGKILL')
      }, 2000)
      killEscalation.unref?.()
      // Settle on the deadline itself rather than waiting for 'close'. 'close' needs every stdio
      // pipe closed, and a surviving grandchild holds stdout open indefinitely — so waiting for it
      // meant the turn never returned, the caller's recovery never ran, and the request stayed
      // wedged server-side while the user only saw the route's own timeout message.
      settle({ stdout, stderr, exitCode: null, timedOut: true, timedOutWithoutOutput: !sawOutput }, { keepEscalation: true })
    }
    timer = armDeadline()

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      bumpDeadline()
      onActivity?.()
      if (onChunk) onChunk(text)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      bumpDeadline()
      onActivity?.()
    })
    child.on('error', (err) => {
      settle({ stdout, stderr: stderr || err.message || String(err), exitCode: null, timedOut })
    })
    child.on('close', (code) => {
      settle({ stdout, stderr, exitCode: code, timedOut })
    })
  })
}

/**
 * Whether a claude turn should be retried on a brand-new session.
 *
 * A resumed session can stop responding entirely: the CLI emits nothing and the turn hits its
 * deadline. The session id is deterministic per agent+model, so every later turn resumes the same
 * wedged transcript and times out again — the agent stays dead until someone clears it by hand.
 * The session-error recovery below cannot cover this because it is gated on a non-timeout error.
 *
 * Only when we actually resumed: a fresh session that times out is a slow prompt, and retrying it
 * would just make the user wait twice.
 */
export function shouldRestartClaudeSessionAfterTimeout(o: {
  runtime: AgentRuntimeId
  timedOut: boolean
  text: string
  resumed: boolean
}): boolean {
  return o.runtime === 'claude' && o.timedOut && !o.text && o.resumed
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
  onActivity?: () => void
}): Promise<{ text: string; errorText?: string }> {
  // Claude Code refuses --dangerously-skip-permissions when running as root (e.g. inside the
  // container image, which runs as root) unless IS_SANDBOX marks a controlled environment. The
  // dashboard always runs claude non-interactively with that flag, so opt in when we are root.
  const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0
  // Claude Code's credential is injected HERE, where the runtime is already known — deliberately
  // not via safe-env's allowlist. That allowlist takes no runtime parameter (safe-env.ts returns
  // one merged object for every CLI), so anything added there also reaches Factory Droid, which
  // runs fully autonomous tool execution: a single "print your environment" turn would exfiltrate
  // the Claude subscription token as a side effect of an unrelated task.
  const effectiveEnv: NodeJS.ProcessEnv = o.runtime === 'claude'
    ? {
        ...o.env,
        ...(runningAsRoot ? { IS_SANDBOX: '1' } : {}),
        ...(claudeSubscriptionToken() ? { CLAUDE_CODE_OAUTH_TOKEN: claudeSubscriptionToken() as string } : {}),
      }
    // Strip it for every other runtime rather than trusting callers to hand over a clean env.
    // Not all of them do: ai-generator passes `process.env` straight through, so a container-level
    // token would otherwise be inherited by a Droid generation. Droid runs fully autonomous tool
    // execution, so a single "print your environment" turn would exfiltrate the Claude credential.
    : withoutClaudeCredentials(o.env)


  // A claude turn may need a second attempt on a fresh session. Both must fit inside the budget
  // the caller advertised: the chat route arms its own watchdog for the same duration, so a retry
  // that started after the first full timeout ran invisibly, after the user had already been told
  // the turn timed out. Give the first attempt most of the budget and the retry the rest.
  // Both attempts get the full idle allowance. Splitting a total budget starved the retry: a
  // wedged first attempt burned most of it before the retry -- the one doing the user's actual
  // work -- began. Idleness bounds each attempt instead, so a working turn is never cut short.
  const firstAttemptTimeoutMs = o.timeoutMs
  const retryTimeoutMs = o.timeoutMs

  const attempt = async (plan: RuntimePlan, timeoutMs = o.timeoutMs) => {
    // claude chat streams JSON events, not prose: translate them before they reach the UI.
    const rawDelta = plan.streamsDeltas && o.onDelta ? o.onDelta : undefined
    const onChunk = rawDelta && o.runtime === 'claude'
      ? createClaudeStreamDeltaTransformer(rawDelta)
      : rawDelta
    const result = await runOnce(plan, effectiveEnv, timeoutMs, onChunk, o.onActivity)
    if (result.timedOut) {
      // Keep whatever the CLI streamed before the deadline. Discarding it made every timeout look
      // like "no output at all", so the partial-output case could never reach the retry decision.
      const partial = parseRuntimeResult(o.runtime, o.mode, result.stdout, result.stderr, result.exitCode)
      return {
        result,
        text: partial.text || '',
        errorText: (result.timedOutWithoutOutput ? 'timeout-no-output' : 'timeout') as 'timeout' | 'timeout-no-output',
      }
    }
    const parsed = parseRuntimeResult(o.runtime, o.mode, result.stdout, result.stderr, result.exitCode)
    if (!parsed.errorText && !plan.streamsDeltas && o.onDelta) {
      // droid/others don't stream — deliver the final text once so callers get a uniform delta+complete shape.
      o.onDelta(parsed.text)
    }
    return { result, text: parsed.text, errorText: parsed.errorText }
  }

  const first = await attempt(o.plan, firstAttemptTimeoutMs)

  if (shouldRestartClaudeSessionAfterTimeout({
    runtime: o.runtime,
    timedOut: first.result.timedOut,
    text: first.text,
    resumed: o.plan.args.includes('--resume'),
  })) {
    console.warn(`[Agent Runtime] claude session for ${o.agentId} timed out on resume; retrying with a fresh session`)
    clearRuntimeSession(o.runtime, o.agentId, o.scopedSessionId)
    const retry = await attempt(o.rebuildPlan(false), retryTimeoutMs)
    if (!retry.errorText) markRuntimeSession(o.runtime, o.agentId, o.scopedSessionId)
    return { text: retry.text, errorText: retry.errorText }
  }

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
  /**
   * Fires on every byte the CLI produces, including tool calls and thinking that never become
   * visible text. Callers use it for liveness. A watchdog fed only by visible deltas kills a
   * healthy turn: an agent doing a long stretch of tool work emits almost no assistant prose.
   */
  onActivity?: () => void
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
    onActivity: o.onActivity,
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

/**
 * Claude Code accepts aliases that always resolve to the newest model in each tier ("Provide an
 * alias for the latest model (e.g. 'fable', 'opus', or 'sonnet')" — `claude --help`). It has no
 * command to enumerate a catalog, and dated ids go stale and get rejected, so the aliases are both
 * the only list we can offer and the safest thing to send.
 */
export const CLAUDE_MODEL_ALIASES = ['sonnet', 'opus', 'haiku', 'fable']

/** Models a runtime CLI accepts, or [] when the catalog cannot be enumerated. */
export async function listRuntimeModels(runtime: AgentRuntimeId): Promise<string[]> {
  if (runtime === 'openclaw') return []
  const cached = runtimeModelCache.get(runtime)
  if (cached && cached.expiresAt > Date.now()) return cached.models
  // Collapse concurrent misses onto one probe instead of spawning a CLI per request.
  const inFlight = runtimeModelProbes.get(runtime)
  if (inFlight) return await inFlight

  const probe = (async () => {
    // droid prints its catalog when handed an unknown model; claude has no such command but
    // accepts stable aliases. Anything else cannot be enumerated.
    let models: string[] = []
    if (runtime === 'droid') {
      const cliPath = resolveRuntimeCliPath(runtime)
      models = cliPath ? await probeDroidModels(cliPath) : []
    } else if (runtime === 'claude') {
      models = resolveRuntimeCliPath(runtime) ? [...CLAUDE_MODEL_ALIASES] : []
    }
  // Claude Code takes any Anthropic model id and has no enumerable catalog; runtimeModelArg()
  // already rejects non-Anthropic models, so leave this empty and let the provider list stand.

    runtimeModelCache.set(runtime, { models, expiresAt: Date.now() + RUNTIME_MODEL_CACHE_TTL_MS })
    return models
  })().finally(() => { runtimeModelProbes.delete(runtime) })

  runtimeModelProbes.set(runtime, probe)
  return await probe
}
