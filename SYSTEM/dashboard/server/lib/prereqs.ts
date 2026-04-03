/**
 * Template prerequisites checker.
 * Validates that required skills, auth, and infrastructure are available
 * before deploying a template.
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getConfiguredGatewayPort, isGatewayConfigured, isGatewayRunning } from './gateway-rpc'
import { getSystemProviderKeys, getUserDefaultProviderKeys } from './dashboard-env'
import { readWorkspaceIntegrationConfig } from './workspace-integrations'
import { listAvailableSkills } from './skills'

export interface PrereqCheck {
  id: string
  label: string
  status: 'pass' | 'fail' | 'warn'
  message: string
  fixHint?: string
  category: 'infrastructure' | 'auth' | 'skill' | 'keys' | 'tooling'
}

export interface PrereqExpectation {
  id: string
  label: string
  status: 'ready' | 'limited'
  message: string
}

export interface PrereqResult {
  ready: boolean
  checks: PrereqCheck[]
  expectations: PrereqExpectation[]
  summary: { pass: number; fail: number; warn: number }
}

interface TemplatePrereqOptions {
  useGithub?: boolean
  githubRepo?: string
  useSenso?: boolean
  sensoContextLabel?: string
  useWorkspaceFs?: boolean
}

function commandExists(command: string): boolean {
  try {
    execSync(`command -v ${command}`, { stdio: 'pipe', shell: '/bin/bash' })
    return true
  } catch {
    return false
  }
}

function getGhAuthStatusOutput(): { ok: boolean; output: string } {
  try {
    const output = execSync('gh auth status 2>&1', { encoding: 'utf-8', stdio: 'pipe', shell: '/bin/bash' }).toString()
    return { ok: true, output }
  } catch (err: any) {
    const output = `${err?.stdout?.toString?.() || ''}\n${err?.stderr?.toString?.() || ''}`.trim()
    return { ok: false, output }
  }
}

function isGhAuthenticated(output: string): boolean {
  const normalized = output.toLowerCase()
  return (
    normalized.includes('logged in') ||
    normalized.includes('account ') ||
    normalized.includes('github.com') ||
    normalized.includes('token') ||
    normalized.includes('gh_token')
  )
}

function hasRepoScope(output: string): boolean {
  const normalized = output.toLowerCase()
  return normalized.includes("'repo'") || normalized.includes(' repo') || normalized.includes('scopes: repo')
}

// Skills that require specific auth or infrastructure
const SKILL_REQUIREMENTS: Record<string, { label: string; check: () => PrereqCheck }> = {
  'github': {
    label: 'GitHub CLI',
    check: () => {
      if (!commandExists('gh')) {
        return { id: 'github-auth', label: 'GitHub CLI', status: 'fail', message: 'gh CLI not installed', fixHint: 'Run: brew install gh && gh auth login', category: 'auth' }
      }

      const authStatus = getGhAuthStatusOutput()
      if (isGhAuthenticated(authStatus.output)) {
        return { id: 'github-auth', label: 'GitHub CLI authenticated', status: 'pass', message: 'gh CLI installed and authenticated', category: 'auth' }
      }

      return { id: 'github-auth', label: 'GitHub CLI authenticated', status: 'warn', message: 'gh CLI installed but authentication could not be confirmed', fixHint: 'Run: gh auth login', category: 'auth' }
    }
  },
  'gh-issues': {
    label: 'GitHub Issues',
    check: () => {
      if (!commandExists('gh')) {
        return { id: 'gh-issues', label: 'GitHub Issues', status: 'fail', message: 'gh CLI not installed', fixHint: 'Run: brew install gh && gh auth login', category: 'auth' }
      }

      const authStatus = getGhAuthStatusOutput()
      if (!isGhAuthenticated(authStatus.output)) {
        return { id: 'gh-issues', label: 'GitHub Issues (repo scope)', status: 'warn', message: 'gh CLI installed but authentication could not be confirmed', fixHint: 'Run: gh auth login', category: 'auth' }
      }

      if (hasRepoScope(authStatus.output)) {
          return { id: 'gh-issues', label: 'GitHub Issues (repo scope)', status: 'pass', message: 'gh CLI has repo scope for issue management', category: 'auth' }
      }

      return { id: 'gh-issues', label: 'GitHub Issues (repo scope)', status: 'warn', message: 'gh CLI authenticated, but repo scope could not be confirmed', fixHint: 'Run: gh auth refresh -s repo', category: 'auth' }
    }
  },
}

export function checkTemplatePrereqs(template: {
  agents?: Array<{ id: string; skills?: string[] }>
  workflows?: Array<{ id: string }>
}, options: TemplatePrereqOptions = {}): PrereqResult {
  const checks: PrereqCheck[] = []
  const seen = new Set<string>()
  const expectations: PrereqExpectation[] = []
  const integrationConfig = readWorkspaceIntegrationConfig()
  const availableSkillNames = new Set(listAvailableSkills().map((skill) => skill.name))

  // ── Infrastructure checks ──
  // OpenClaw CLI
  try {
    execSync('command -v openclaw', { stdio: 'pipe', shell: '/bin/bash' })
    checks.push({ id: 'openclaw-cli', label: 'OpenClaw CLI', status: 'pass', message: 'Installed', category: 'infrastructure' })
  } catch {
    checks.push({ id: 'openclaw-cli', label: 'OpenClaw CLI', status: 'fail', message: 'Not installed — agents cannot be started', fixHint: 'Run: npm install -g openclaw', category: 'infrastructure' })
  }

  // Gateway
  if (isGatewayConfigured()) {
    const gatewayStatus = isGatewayRunning()
    if (gatewayStatus.running) {
      checks.push({ id: 'gateway', label: 'Gateway', status: 'pass', message: `Running on port ${gatewayStatus.port} (skills enabled)`, category: 'infrastructure' })
    } else {
      checks.push({ id: 'gateway', label: 'Gateway', status: 'warn', message: `Configured on port ${gatewayStatus.port ?? getConfiguredGatewayPort() ?? 'unknown'} but not running — skills will not work`, fixHint: 'Run: openclaw gateway restart', category: 'infrastructure' })
    }
  } else {
    checks.push({ id: 'gateway', label: 'Gateway', status: 'warn', message: 'Not configured — agents will chat but cannot use skills', fixHint: 'Run: openclaw config set gateway.mode local && openclaw gateway restart', category: 'infrastructure' })
  }

  // ── API Keys ──
  const systemKeys = getSystemProviderKeys()
  const userKeys = getUserDefaultProviderKeys()
  const hasSystemKeys = !!(systemKeys.openai || systemKeys.anthropic || systemKeys.gemini)
  const hasUserKeys = !!(userKeys.openai || userKeys.anthropic || userKeys.gemini)
  const hasOllamaPath = !!(integrationConfig.ollamaBaseUrl?.trim() && integrationConfig.ollamaDefaultModel?.trim())
  const hasExecutionPath = hasSystemKeys || hasUserKeys || hasOllamaPath

  if (hasOllamaPath) {
    checks.push({
      id: 'execution-path',
      label: 'Execution Model Path',
      status: 'pass',
      message: `Ollama default ready (${integrationConfig.ollamaDefaultModel})`,
      category: 'keys'
    })
  } else if (hasSystemKeys) {
    checks.push({ id: 'execution-path', label: 'Execution Model Path', status: 'pass', message: 'System keys configured', category: 'keys' })
  } else if (hasUserKeys) {
    checks.push({ id: 'execution-path', label: 'Execution Model Path', status: 'pass', message: 'User default keys configured', category: 'keys' })
  } else {
    checks.push({
      id: 'execution-path',
      label: 'Execution Model Path',
      status: 'warn',
      message: 'No server-side or workspace-default execution path configured — browser BYOK may still work for template apply and manual runs',
      fixHint: 'Configure a preferred model in Workspaces Integrations or add provider keys to SYSTEM/dashboard/.env',
      category: 'keys'
    })
  }

  // ── Per-skill checks ──
  const allSkills = new Set<string>()
  for (const agent of template.agents || []) {
    for (const skill of agent.skills || []) {
      allSkills.add(skill)
    }
  }

  if (options.useGithub) {
    allSkills.add('github')
    allSkills.add('gh-issues')
    if (!options.githubRepo?.trim()) {
      checks.push({
        id: 'github-repo',
        label: 'GitHub repository',
        status: 'warn',
        message: 'GitHub coordination is enabled, but no repo is configured for this apply',
        fixHint: 'Set owner/repo in the Context step before applying',
        category: 'tooling'
      })
    } else {
      checks.push({
        id: 'github-repo',
        label: 'GitHub repository',
        status: 'pass',
        message: `GitHub repo ready: ${options.githubRepo.trim()}`,
        category: 'tooling'
      })
    }
  }

  if (options.useSenso) {
    const contextLabel = options.sensoContextLabel?.trim() || integrationConfig.sensoContextLabel?.trim()
    checks.push({
      id: 'senso-context',
      label: 'Senso shared context',
      status: contextLabel ? 'pass' : 'warn',
      message: contextLabel
        ? `Senso context ready: ${contextLabel}`
        : 'Senso enabled, but no preferred context label is set',
      fixHint: contextLabel ? undefined : 'Add a Senso folder/context in the Context step or Workspaces Integrations',
      category: 'tooling'
    })
    checks.push({
      id: 'senso-auth-preview',
      label: 'Senso auth',
      status: 'warn',
      message: 'Senso auth is browser-local in this preview flow — verify it in Workspaces Integrations before running workflows',
      fixHint: 'Open Workspaces Integrations and validate Senso before applying',
      category: 'auth'
    })
  }

  if (options.useWorkspaceFs) {
    checks.push({
      id: 'workspace-files',
      label: 'Workspace file coordination',
      status: commandExists('openclaw') ? 'pass' : 'fail',
      message: commandExists('openclaw')
        ? 'Workspace files will be available to agents through the shared workspace'
        : 'OpenClaw CLI is not installed, so shared workspace file coordination will not work',
      fixHint: commandExists('openclaw') ? undefined : 'Install openclaw before applying file-heavy templates',
      category: 'tooling'
    })
  }

  for (const skillId of allSkills) {
    if (!availableSkillNames.has(skillId)) {
      checks.push({
        id: `skill-available:${skillId}`,
        label: `Skill available: ${skillId}`,
        status: 'warn',
        message: `Skill "${skillId}" is not currently installed in this workspace catalog`,
        fixHint: 'Install or sync the skill before applying if the workflow depends on it',
        category: 'skill'
      })
    }
  }

  for (const skillId of allSkills) {
    const req = SKILL_REQUIREMENTS[skillId]
    if (req && !seen.has(req.check().id)) {
      const check = req.check()
      seen.add(check.id)
      checks.push(check)
    }
  }

  const usesSkills = allSkills.size > 0
  expectations.push({
    id: 'agent-execution',
    label: 'Agent execution',
    status: hasExecutionPath ? 'ready' : 'limited',
    message: hasExecutionPath
      ? 'Agents should be able to run with the current model/auth configuration'
      : 'Agents may apply successfully but block when they try to execute'
  })
  if (usesSkills) {
    const gatewayStatus = isGatewayRunning()
    expectations.push({
      id: 'tool-using-agents',
      label: 'Tool-using agents',
      status: gatewayStatus.running ? 'ready' : 'limited',
      message: gatewayStatus.running
        ? 'Skill-enabled agents should be able to use their tools'
        : 'Agents can still respond, but tool actions are likely to fail until the gateway is running'
    })
  }
  if (options.useGithub) {
    const githubReady = checks.some((check) => check.id === 'github-auth' && check.status === 'pass')
    expectations.push({
      id: 'github-coordination',
      label: 'GitHub coordination',
      status: githubReady && !!options.githubRepo?.trim() ? 'ready' : 'limited',
      message: githubReady && !!options.githubRepo?.trim()
        ? `Issues/PR coordination should work in ${options.githubRepo?.trim()}`
        : 'GitHub is enabled, but issue/PR coordination is likely to degrade until gh auth and repo setup are complete'
    })
  }
  if (options.useSenso) {
    const contextLabel = options.sensoContextLabel?.trim() || integrationConfig.sensoContextLabel?.trim()
    expectations.push({
      id: 'senso-memory',
      label: 'Senso memory & evidence',
      status: contextLabel ? 'ready' : 'limited',
      message: contextLabel
        ? `Senso context will be seeded under ${contextLabel}`
        : 'Senso is enabled, but users should expect context setup friction until a folder/context is chosen'
    })
  }
  if (options.useWorkspaceFs) {
    expectations.push({
      id: 'workspace-files-summary',
      label: 'Workspace file coordination',
      status: commandExists('openclaw') ? 'ready' : 'limited',
      message: commandExists('openclaw')
        ? 'Agents should be able to write drafts and intermediate artifacts into the shared workspace'
        : 'Shared workspace file tasks are likely to fail until the local runtime is installed'
    })
  }

  // ── Summary ──
  const pass = checks.filter(c => c.status === 'pass').length
  const fail = checks.filter(c => c.status === 'fail').length
  const warn = checks.filter(c => c.status === 'warn').length

  return {
    ready: fail === 0,
    checks,
    expectations,
    summary: { pass, fail, warn },
  }
}
