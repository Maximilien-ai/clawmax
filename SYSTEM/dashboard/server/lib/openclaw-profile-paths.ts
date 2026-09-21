import os from 'os'
import path from 'path'

/** Explicit profile selections must never fall back to the installed profile. */
export function openClawStatePath(home?: string): string {
  if (home !== undefined) return path.join(home, '.openclaw')
  const selected = process.env.OPENCLAW_STATE_DIR?.trim()
  return selected ? path.resolve(selected) : path.join(os.homedir(), '.openclaw')
}

export function openClawConfigPath(): string {
  const selected = process.env.OPENCLAW_CONFIG_PATH?.trim()
  return selected ? path.resolve(selected) : path.join(openClawStatePath(), 'openclaw.json')
}
