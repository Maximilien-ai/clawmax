import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { REPO_ROOT } from './paths'
import { safeEnv } from './safe-env'

const execFileAsync = promisify(execFile)

function resolvePinnedOpenClawWorkspaceStateBridge(): { helperPath: string; packageRoot: string } | null {
  const helperPath = path.join(REPO_ROOT, 'SYSTEM', 'dashboard', 'openclaw-workspace-state.mjs')
  const packageRoot = [
    process.env.OPENCLAW_PACKAGE_ROOT,
    '/usr/local/lib/node_modules/openclaw',
    '/opt/homebrew/lib/node_modules/openclaw',
  ].find((root) => root && fs.existsSync(path.join(root, 'dist')))
  return fs.existsSync(helperPath) && packageRoot ? { helperPath, packageRoot } : null
}

export async function clearPinnedOpenClawWorkspaceState(workspaceDir: string): Promise<void> {
  const resolvedWorkspaceDir = path.resolve(workspaceDir)
  if (resolvedWorkspaceDir === path.parse(resolvedWorkspaceDir).root) {
    throw new Error('Refusing to clear OpenClaw state for a filesystem root')
  }

  const bridge = resolvePinnedOpenClawWorkspaceStateBridge()
  if (!bridge) {
    throw new Error('Pinned OpenClaw workspace state bridge is unavailable')
  }

  try {
    const { stdout } = await execFileAsync(process.execPath, [bridge.helperPath, resolvedWorkspaceDir], {
      encoding: 'utf8',
      env: safeEnv({
        OPENCLAW_PACKAGE_ROOT: bridge.packageRoot,
        OPENCLAW_STATE_DIR: process.env.OPENCLAW_STATE_DIR,
      }),
      maxBuffer: 1024 * 1024,
    })
    const result = JSON.parse(String(stdout || ''))
    if (result?.cleared !== true || path.resolve(String(result?.workspaceDir || '')) !== resolvedWorkspaceDir) {
      throw new Error('OpenClaw workspace state bridge returned an invalid result')
    }
  } catch (error: any) {
    const detail = String(error?.stderr || error?.stdout || error?.message || error || '').trim()
    throw new Error(`Failed to clear OpenClaw workspace state: ${detail || 'unknown error'}`)
  }
}

export const __test = { resolvePinnedOpenClawWorkspaceStateBridge }
