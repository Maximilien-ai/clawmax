import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { REPO_ROOT } from './paths'

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function resolveFromPath(): string | null {
  try {
    const resolved = String(execFileSync('which', ['openclaw'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }) || '').trim()
    return resolved || null
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

export function hasOpenClawCli(): boolean {
  return !!resolveOpenClawCliPath()
}
