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
import { appendBoundedOutput } from './stream-bounds'
import { cancelProcessTree, detachProcessStreams, signalProcessTree } from './process-tree'

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
 * A copy of `env` with runtime-specific credentials removed.
 *
 * Enforced here, at the one place every runtime spawn passes through, because callers vary: some
 * build a curated env via safeEnv(), others forward `process.env` wholesale.
 */
export function withoutRuntimeCredentials(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!('CLAUDE_CODE_OAUTH_TOKEN' in env) && !('FACTORY_API_KEY' in env)) return env
  const { CLAUDE_CODE_OAUTH_TOKEN, FACTORY_API_KEY, ...rest } = env
  void CLAUDE_CODE_OAUTH_TOKEN
  void FACTORY_API_KEY
  return rest
}

export function claudeSubscriptionToken(): string | undefined {
  const value = String(process.env.CLAUDE_CODE_OAUTH_TOKEN || '').trim()
  return value || undefined
}

export function factoryApiKey(): string | undefined {
  const value = String(process.env.FACTORY_API_KEY || '').trim()
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

/**
 * Claude Code tools whose payoff arrives after the turn that armed them has ended.
 *
 * A turn is one process. These tools are contracts the harness cannot honour: the model arms one,
 * says so, ends its turn, and the process exits -- taking the pending work with it. Measured: asked
 * for forty timed steps, the agent replied "Monitor armed -- it'll notify me once per number...
 * I'll relay each", the stream closed on `complete` at 37.9s, and the CLI was gone 15s later.
 * Nothing ever relays, and because the turn ended cleanly it is reported to the user as a success.
 *
 * Blocking them in code rather than asking the model not to use them is deliberate. A prompt is
 * advisory and this exact failure IS the model believing it can defer; the flag is enforceable, and
 * the model then does the work inline, which is what the user wanted. Verified against the CLI:
 * these nine are the difference between a 26-tool and a 17-tool grant.
 *
 * `Task` is deliberately NOT here. Subagents resolve inside the turn -- the process genuinely waits
 * for them -- which is how a measured 21-minute, 8-subagent research turn completed successfully.
 */
export const CLAUDE_POST_TURN_TOOLS = [
  'Monitor',
  'ScheduleWakeup',
  'CronCreate',
  'CronDelete',
  'CronList',
  'RemoteTrigger',
  'SendMessage',
  'PushNotification',
  'DesignSync',
] as const

/**
 * Droid's own tools with the same after-the-turn-ends failure mode as CLAUDE_POST_TURN_TOOLS
 * above, confirmed against droid 0.158.0's own catalog (`droid exec --list-tools --auto high`).
 * Cron* schedules a future run and *Automation* persists a standing trigger -- both outlive the
 * process, keyed to the deterministic droidSessionId(), so a later turn's freshly spawned process
 * can see and act on state this turn armed and forgot. Reproduced directly: a CronCreate call in
 * one `droid exec` process was visible to a CronList call in a second, unrelated process sharing
 * only the session id, and the cron itself survives until someone finds and cancels it by hand.
 *
 * Task/TaskOutput/TaskStop are deliberately excluded, mirroring the Task exemption above -- it is
 * droid's own subagent tool, which the process genuinely waits on rather than arms and abandons.
 *
 * Unlike claude's --disallowed-tools, droid's --disabled-tools takes exactly one comma-joined
 * value, not repeated/space-separated args -- verified directly against the CLI: passing these as
 * separate argv entries silently blocked only the first one and left the rest allowed.
 */
export const DROID_POST_TURN_TOOLS = [
  'CronCreate',
  'CronDelete',
  'CronList',
  'CreateAutomation',
  'EditAutomation',
  'DeleteAutomation',
] as const

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
      '--disallowed-tools', ...CLAUDE_POST_TURN_TOOLS,
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
    '--disabled-tools', DROID_POST_TURN_TOOLS.join(','),
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
  /** True when the turn ended because someone asked it to stop, rather than finishing on its own. */
  cancelled: boolean
  /** True when the turn was stopped for emitting an absurd volume of output, not by a person. */
  runawayOutput?: boolean
}

/**
 * Sentinel `errorText` for a turn that was stopped on request rather than failing.
 *
 * A sentinel rather than prose because four call sites branch on it, and each renders its own
 * user-facing wording. The predicate exists so splitting or renaming this cannot silently turn
 * every one of those comparisons into a false, leaking the raw sentinel to a user as their
 * error message -- which is exactly what happened when the old timeout sentinel was split.
 */
export const RUNTIME_CANCELLED = 'cancelled' as const

/** Sentinel for a turn stopped because its output volume was absurd, not because anyone asked. */
export const RUNTIME_RUNAWAY_OUTPUT = 'runaway-output' as const

export function isRuntimeRunawayOutputError(errorText?: string): boolean {
  return errorText === RUNTIME_RUNAWAY_OUTPUT
}

export function isRuntimeCancelledError(errorText?: string): boolean {
  return errorText === RUNTIME_CANCELLED
}

/**
 * Runs one CLI turn to completion. There is no deadline of any kind, by design.
 *
 * Every previous bound measured time, and time does not distinguish a working turn from a wedged
 * one: agent work is legitimately bursty and silent for long stretches -- a measured 21-minute
 * research turn went quiet for 316s while its subagents ran, and tasks routinely run far longer.
 * Any clock chosen here is therefore either short enough to kill real work or long enough to be
 * useless as a wedge detector, and raising the number only moves which of the two you get.
 *
 * A turn now ends for exactly two reasons: the process exits, or someone cancels it. `signal` is
 * that cancellation -- the only kill switch there is, which is why the chat route must expose it
 * to the user rather than relying on a timeout to clean up after a wedged turn.
 */
/**
 * Output bounds for a runtime turn, matching the chat route's OpenClaw path.
 *
 * These are volume limits, not deadlines: nothing here ends a turn because time passed. They exist
 * because a turn has no duration limit at all, so an agent stuck emitting output has nothing else
 * standing between it and the dashboard's memory -- and this process holds every other in-flight
 * turn, so one runaway CLI takes them all down with it.
 */
const MAX_RETAINED_RUNTIME_OUTPUT = 2 * 1024 * 1024
const MAX_RETAINED_RUNTIME_STDERR = 64 * 1024
const MAX_TOTAL_RUNTIME_OUTPUT = 64 * 1024 * 1024

function runOnce(
  plan: RuntimePlan,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  onChunk?: (text: string) => void,
  /**
   * Fires on every byte the CLI produces, including tool calls and thinking that never become
   * visible text. Callers use it to show the user that a long turn is alive -- a turn doing
   * fifteen minutes of tool work emits almost no assistant prose.
   */
  onActivity?: () => void,
): Promise<RunOnceResult> {
  return new Promise((resolve) => {
    if (!plan.cliPath) {
      resolve({ stdout: '', stderr: plan.missingCliError, exitCode: null, cancelled: false })
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
    let cancelled = false
    let settled = false
    let totalOutputBytes = 0
    let runawayOutput = false
    let killEscalation: NodeJS.Timeout | undefined

    const settle = (result: RunOnceResult) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onCancel)
      if (killEscalation) clearTimeout(killEscalation)
      // Detach from both streams here, in the one place every exit path (normal close, spawn
      // error, stream error, or the SIGKILL escalation below) already funnels through. Without
      // this, the 'data' listeners attached below outlive the promise: a grandchild that escaped
      // the process group (see the escalation comment) keeps writing to the still-open pipe, and
      // each write re-enters this closure to grow `stdout`/`stderr` and fire onChunk/onActivity
      // forever, even though the caller believes the turn is over. destroy() additionally closes
      // our end of the pipe so this process's own fd isn't held open by a stream nothing reads.
      detachProcessStreams(child)
      resolve(result)
    }

    function onCancel() {
      // The child can exit between the abort being queued and this running; killing a reaped pid
      // is harmless but arming an escalation timer after settle() leaks a handle for no reason.
      if (settled) return
      cancelled = true
      // SIGTERM, then an unconditional group SIGKILL, then settle -- see cancelProcessTree.
      //
      // A grandchild that called its own setsid() has already left this process group, so neither
      // signal can reach it: Node holds no handle to it, and finding it would mean walking the OS
      // process table by pid -- fragile, platform-specific, and a new failure mode rather than a fix
      // for this one. Not solved here, and logged rather than left silent so an operator can find it.
      killEscalation = cancelProcessTree(child, () => {
        console.warn(`[Agent Runtime] pid ${child.pid} was SIGKILLed on cancel; if it spawned a detached grandchild (its own setsid), that process is not reachable from here and may still be running`)
        // Settle from what was captured rather than waiting for 'close': 'close' needs every stdio
        // pipe closed, and that escaped grandchild holds stdout open forever -- so waiting would
        // hang this promise, wedge the request, and strand the turn in the registry with nothing
        // able to clear it. SIGKILL is the last thing we can do.
        settle({ stdout, stderr, exitCode: null, cancelled: true })
      })
    }

    if (signal.aborted) {
      // Cancelled between spawn and listener attach. Handle it directly: 'abort' has already
      // fired and will never fire again, so an addEventListener here would never run.
      onCancel()
    } else {
      signal.addEventListener('abort', onCancel, { once: true })
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      // Retain a bounded window (head + tail), and stop the turn outright past a hard ceiling. The
      // deltas still stream in full -- only what this closure holds is bounded.
      stdout = appendBoundedOutput(stdout, text, MAX_RETAINED_RUNTIME_OUTPUT)
      totalOutputBytes += chunk.byteLength
      onActivity?.()
      if (onChunk) onChunk(text)
      if (totalOutputBytes > MAX_TOTAL_RUNTIME_OUTPUT && !settled) {
        runawayOutput = true
        // Same shape as a cancel: kill the group, then settle from what we captured rather than
        // waiting on a 'close' the runaway producer is actively preventing.
        killEscalation = cancelProcessTree(child, () => {
          settle({ stdout, stderr, exitCode: null, cancelled: true, runawayOutput: true })
        })
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendBoundedOutput(stderr, chunk.toString(), MAX_RETAINED_RUNTIME_STDERR)
      onActivity?.()
    })
    // A Readable with no 'error' listener turns a stream fault (EPIPE, EBADF, a destroyed fd) into
    // an uncaughtException -- and the dashboard's global handler (server/index.ts) exits the whole
    // process on any uncaughtException, killing every other turn in flight, not just this one's.
    // child.on('error') below only covers the ChildProcess itself (e.g. spawn failing); it does not
    // catch errors emitted by the stdout/stderr stream objects.
    child.stdout.on('error', (err) => {
      signalProcessTree(child, 'SIGTERM')
      settle({ stdout, stderr: stderr || `stdout stream error: ${err.message || String(err)}`, exitCode: null, cancelled })
    })
    child.stderr.on('error', (err) => {
      signalProcessTree(child, 'SIGTERM')
      settle({ stdout, stderr: stderr || `stderr stream error: ${err.message || String(err)}`, exitCode: null, cancelled })
    })
    child.on('error', (err) => {
      settle({ stdout, stderr: stderr || err.message || String(err), exitCode: null, cancelled })
    })
    child.on('close', (code) => {
      settle({ stdout, stderr, exitCode: code, cancelled })
    })
  })
}

/**
 * Whether a claude session should be cleared after a turn was cancelled having produced nothing.
 *
 * A resumed session can stop responding entirely. The session id is deterministic per agent+model,
 * so every later turn resumes the same wedged transcript and hangs the same way -- the agent stays
 * dead until someone clears it by hand. Clearing it here means the user's next message starts fresh
 * instead of re-entering the same hole.
 *
 * Only when we actually resumed, and only when the turn produced nothing: a fresh session, or one
 * that streamed real text before being cancelled, was working as far as we can tell.
 *
 * Note this is strictly weaker than the deadline it replaces. It fires only when a human cancels,
 * so a silently wedged turn is no longer recovered automatically -- someone has to notice it. That
 * is the deliberate cost of having no clock, and it is why the UI must show elapsed time and last
 * activity: those are now the only way a wedged turn becomes visible.
 */
export function shouldClearSessionOnZeroOutputCancel(o: {
  runtime: AgentRuntimeId
  cancelled: boolean
  text: string
  resumed: boolean
}): boolean {
  return o.runtime === 'claude' && o.cancelled && !o.text && o.resumed
}

export async function runRuntimeCli(o: {
  plan: RuntimePlan
  env: NodeJS.ProcessEnv
  /** Cancellation. There is no deadline; this is the only way a turn ends early. */
  signal: AbortSignal
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
  // Runtime credentials are injected only for their target CLI, never through safe-env's shared
  // allowlist, so autonomous runtimes cannot exfiltrate another runtime's credential.
  const runtimeSafeEnv = withoutRuntimeCredentials(o.env)
  const effectiveEnv: NodeJS.ProcessEnv = o.runtime === 'claude'
    ? {
        ...runtimeSafeEnv,
        ...(runningAsRoot ? { IS_SANDBOX: '1' } : {}),
        ...(claudeSubscriptionToken() ? { CLAUDE_CODE_OAUTH_TOKEN: claudeSubscriptionToken() as string } : {}),
      }
    : o.runtime === 'droid'
      ? {
          ...runtimeSafeEnv,
          ...(factoryApiKey() ? { FACTORY_API_KEY: factoryApiKey() as string } : {}),
        }
      : runtimeSafeEnv


  const attempt = async (plan: RuntimePlan) => {
    // claude chat streams JSON events, not prose: translate them before they reach the UI.
    const rawDelta = plan.streamsDeltas && o.onDelta ? o.onDelta : undefined
    const onChunk = rawDelta && o.runtime === 'claude'
      ? createClaudeStreamDeltaTransformer(rawDelta)
      : rawDelta
    const result = await runOnce(plan, effectiveEnv, o.signal, onChunk, o.onActivity)
    if (result.runawayOutput) {
      // Distinct from a cancel: nobody asked for this, and "stopped" alone would read as though
      // someone had. Keep the partial text -- it is usually where the repetition is visible.
      const partial = parseRuntimeResult(o.runtime, o.mode, result.stdout, result.stderr, result.exitCode)
      return { result, text: partial.text || '', errorText: RUNTIME_RUNAWAY_OUTPUT as typeof RUNTIME_RUNAWAY_OUTPUT }
    }
    if (result.cancelled) {
      // Keep whatever the CLI streamed before the cancel. Discarding it made a cancelled turn look
      // like "no output at all", which is also what a wedged session looks like -- and the two need
      // to be told apart to decide whether the session is worth keeping.
      const partial = parseRuntimeResult(o.runtime, o.mode, result.stdout, result.stderr, result.exitCode)
      return { result, text: partial.text || '', errorText: RUNTIME_CANCELLED as typeof RUNTIME_CANCELLED }
    }
    const parsed = parseRuntimeResult(o.runtime, o.mode, result.stdout, result.stderr, result.exitCode)
    if (!parsed.errorText && !plan.streamsDeltas && o.onDelta) {
      // droid/others don't stream — deliver the final text once so callers get a uniform delta+complete shape.
      o.onDelta(parsed.text)
    }
    return { result, text: parsed.text, errorText: parsed.errorText }
  }

  const first = await attempt(o.plan)

  if (shouldClearSessionOnZeroOutputCancel({
    runtime: o.runtime,
    cancelled: first.result.cancelled,
    text: first.text,
    resumed: o.plan.args.includes('--resume'),
  })) {
    // Clear, but do NOT retry: the caller cancelled, so starting a fresh turn against their wishes
    // is the one thing they explicitly asked not to happen.
    console.warn(`[Agent Runtime] claude session for ${o.agentId} produced nothing before cancel; clearing it so the next turn starts fresh`)
    clearRuntimeSession(o.runtime, o.agentId, o.scopedSessionId)
    return { text: first.text, errorText: first.errorText }
  }

  if (o.runtime === 'claude' && first.errorText && !first.result.cancelled) {
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
  /**
   * Cancellation for this turn. Required, not optional: a turn has no deadline, so a caller that
   * cannot cancel has built something unkillable. Pass `new AbortController().signal` only where
   * the caller genuinely owns the process lifetime some other way.
   */
  signal: AbortSignal
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
    signal: o.signal,
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
