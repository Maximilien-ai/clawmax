import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { REPO_ROOT } from './paths'

function isExecutable(filePath: string): boolean {
  if (process.platform === 'win32') {
    return fs.existsSync(filePath) && /\.(?:exe|cmd|bat|com)$/i.test(filePath)
  }
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function resolveFromPath(): string | null {
  if (process.platform === 'win32') {
    const extensions = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    for (const entry of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
      for (const extension of extensions) {
        const candidate = path.join(entry, `openclaw${extension.toLowerCase()}`)
        if (fs.existsSync(candidate)) return candidate
        const upperCandidate = path.join(entry, `openclaw${extension.toUpperCase()}`)
        if (fs.existsSync(upperCandidate)) return upperCandidate
      }
    }
  }
  try {
    const lookup = process.platform === 'win32' ? 'where.exe' : 'which'
    const resolved = String(execFileSync(lookup, ['openclaw'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }) || '').trim()
    return resolved.split(/\r?\n/).map((entry) => entry.trim()).find(Boolean) || null
  } catch {
    return null
  }
}

export function resolveOpenClawCliPath(): string | null {
  const override = String(process.env.OPENCLAW_BIN || '').trim()
  if (override && isExecutable(override)) return override

  const fromPath = resolveFromPath()
  if (fromPath && isExecutable(fromPath)) return fromPath

  const execDir = path.dirname(process.execPath)
  const candidates = [
    path.join(REPO_ROOT, 'SYSTEM', 'bin', 'openclaw'),
    path.join(REPO_ROOT, 'bin', 'openclaw'),
    path.join(REPO_ROOT, 'openclaw'),
    path.join(execDir, 'openclaw'),
    path.join(execDir, '..', 'bin', 'openclaw'),
    path.join(os.homedir(), '.local', 'bin', 'openclaw'),
  ]

  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate
  }
  return null
}

export interface OpenClawCliInvocation {
  command: string
  args: string[]
}

/**
 * Node cannot spawn npm's Windows .cmd shim directly without enabling a shell.
 * Enabling a shell would make chat prompt arguments vulnerable to shell parsing,
 * so execute the shim's package entry point with the current Node binary instead.
 */
export function resolveOpenClawCliInvocation(args: string[] = []): OpenClawCliInvocation | null {
  const cliPath = resolveOpenClawCliPath()
  if (!cliPath) return null

  if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(cliPath)) {
    const packageEntry = path.join(path.dirname(cliPath), 'node_modules', 'openclaw', 'openclaw.mjs')
    if (fs.existsSync(packageEntry)) {
      return { command: process.execPath, args: [packageEntry, ...args] }
    }
  }

  return { command: cliPath, args }
}

export function hasOpenClawCli(): boolean {
  return !!resolveOpenClawCliPath()
}
