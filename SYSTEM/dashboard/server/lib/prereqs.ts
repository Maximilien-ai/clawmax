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

export interface PrereqCheck {
  id: string
  label: string
  status: 'pass' | 'fail' | 'warn'
  message: string
  fixHint?: string
  category: 'infrastructure' | 'auth' | 'skill' | 'keys'
}

export interface PrereqResult {
  ready: boolean
  checks: PrereqCheck[]
  summary: { pass: number; fail: number; warn: number }
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
}): PrereqResult {
  const checks: PrereqCheck[] = []
  const seen = new Set<string>()

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
  const hasSystemKeys = !!(systemKeys.openai || systemKeys.anthropic)
  const hasUserKeys = !!(userKeys.openai || userKeys.anthropic)

  if (hasSystemKeys) {
    checks.push({ id: 'api-keys', label: 'LLM API Keys', status: 'pass', message: 'System keys configured', category: 'keys' })
  } else if (hasUserKeys) {
    checks.push({ id: 'api-keys', label: 'LLM API Keys', status: 'pass', message: 'User default keys configured', category: 'keys' })
  } else {
    checks.push({
      id: 'api-keys',
      label: 'LLM API Keys',
      status: 'warn',
      message: 'No server-side LLM keys configured — browser BYOK may still work for template apply and manual runs',
      fixHint: 'Configure keys via Workspaces Integrations / BYOK, or add server keys to SYSTEM/dashboard/.env',
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

  for (const skillId of allSkills) {
    const req = SKILL_REQUIREMENTS[skillId]
    if (req && !seen.has(req.check().id)) {
      const check = req.check()
      seen.add(check.id)
      checks.push(check)
    }
  }

  // ── Summary ──
  const pass = checks.filter(c => c.status === 'pass').length
  const fail = checks.filter(c => c.status === 'fail').length
  const warn = checks.filter(c => c.status === 'warn').length

  return {
    ready: fail === 0,
    checks,
    summary: { pass, fail, warn },
  }
}
