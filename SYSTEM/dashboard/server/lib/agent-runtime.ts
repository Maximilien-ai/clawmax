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
import { execFileSync, spawn } from 'child_process'
import { resolveOpenClawCliPath } from './openclaw-cli'
import { readWorkspaceIntegrationConfig } from './workspace-integrations'
import { safeEnv } from './safe-env'
import { markRuntimeSession } from './runtime-sessions'

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

export function resolveAgentRuntime(agentId: string, identityRuntime?: string): AgentRuntimeId {
  // agentId is accepted (not just identityRuntime) so future per-agent overrides beyond
  // IDENTITY.md parsing can slot in here without changing every call site's signature.
  void agentId
  return normalizeAgentRuntime(identityRuntime) || resolveWorkspaceRuntime()
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
    '-s', o.scopedSessionId,
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
  const attempt = async (plan: RuntimePlan) => {
    const onChunk = plan.streamsDeltas && o.onDelta ? o.onDelta : undefined
    const result = await runOnce(plan, o.env, o.timeoutMs, onChunk)
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
