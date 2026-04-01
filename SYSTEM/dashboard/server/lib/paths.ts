import path from 'path'
import fs from 'fs'

/**
 * Resolve the repository root directory.
 *
 * Works in both dev (`ts-node server/...`) and prod (`node dist/server/...`)
 * by walking up from __dirname until we find the repo marker (`.git` directory
 * or the root `README.md` + `SYSTEM/` combo).
 *
 * Falls back to the legacy __dirname arithmetic so we never silently break.
 */
function findRepoRoot(): string {
  const override = process.env.CLAWMAX_REPO_ROOT?.trim()
  if (override) {
    return override
  }

  // Walk up from this file's directory looking for repo markers
  let dir = __dirname
  const root = path.parse(dir).root

  while (dir !== root) {
    // Primary marker: .git directory at repo root
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir
    }
    // Secondary marker: SYSTEM/schemas directory (our schema home)
    if (
      fs.existsSync(path.join(dir, 'SYSTEM', 'schemas')) &&
      fs.existsSync(path.join(dir, 'AGENTS'))
    ) {
      return dir
    }
    dir = path.dirname(dir)
  }

  // Fallback: support both dev and production layouts.
  // - dev: SYSTEM/dashboard/server/lib -> repo root in 4 levels
  // - prod: SYSTEM/dashboard/dist/server/lib -> repo root in 5 levels
  console.warn('[paths] Could not locate repo root via markers — falling back to __dirname arithmetic')
  const candidates = [
    path.resolve(__dirname, '../../../..'),
    path.resolve(__dirname, '../../../../..'),
  ]
  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, 'SYSTEM', 'schemas')) &&
      fs.existsSync(path.join(candidate, 'TEMPLATES'))
    ) {
      return candidate
    }
  }
  return candidates[0]
}

/** Absolute path to the repository root */
export const REPO_ROOT = findRepoRoot()

/** Absolute path to SYSTEM/schemas/ (validation schemas for workspace docs) */
export const SCHEMAS_DIR = path.join(REPO_ROOT, 'SYSTEM', 'schemas')

/** Absolute path to SYSTEM/dashboard/server/schemas/ (template schemas) */
export const TEMPLATE_SCHEMAS_DIR = path.join(REPO_ROOT, 'SYSTEM', 'dashboard', 'server', 'schemas')

/** Absolute path to TEMPLATES/ (global system templates) */
export const TEMPLATES_DIR = path.join(REPO_ROOT, 'TEMPLATES')
