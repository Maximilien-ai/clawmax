import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { resolveOpenClawCliPath } from './openclaw-cli'
import { openClawStatePath } from './openclaw-profile-paths'
import { safeEnv } from './safe-env'

const execFileAsync = promisify(execFile)
export interface RuntimePlugin { id: string; name: string; version: string; origin: string; enabled: boolean; status: string }
export interface PluginChange { id: string; pluginId: string; enabled: boolean; at: string; status: 'pending' | 'saved' | 'failed' }
export class RuntimePluginError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._@/-]{0,159}$/.test(id) && !id.includes('..')
const text = (value: unknown) => typeof value === 'string' ? value.slice(0,200) : ''

export class OpenClawPlugins {
  private changing = false
  constructor(private run: (args: string[]) => Promise<string>, private stateDir: () => string) {}
  private historyPath() { return path.join(this.stateDir(), 'clawmax-plugin-changes.json') }
  history(): PluginChange[] {
    if (!fs.existsSync(this.historyPath())) return []
    const records = JSON.parse(fs.readFileSync(this.historyPath(), 'utf8'))
    if (!Array.isArray(records)) throw new Error('Invalid plugin change history')
    return records
  }
  private save(records: PluginChange[]) {
    fs.mkdirSync(this.stateDir(), { recursive: true, mode: 0o700 })
    const target = this.historyPath()
    const temporary = `${target}.${randomUUID()}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(records.slice(-100)), { mode: 0o600 })
    fs.renameSync(temporary, target)
  }
  async list(): Promise<RuntimePlugin[]> {
    const result = JSON.parse(await this.run(['plugins', 'list', '--json']))
    if (!Array.isArray(result.plugins)) throw new Error('Unsupported OpenClaw inventory response')
    return result.plugins.filter((plugin: any) => validId(plugin?.id)).map((plugin: any) => ({
      id: plugin.id, name: text(plugin.name) || plugin.id, version: text(plugin.version), origin: text(plugin.origin),
      enabled: plugin.enabled === true, status: text(plugin.status) || 'unknown',
    }))
  }
  async change(id: unknown, enabled: unknown, confirmed: unknown) {
    if (!validId(id) || typeof enabled !== 'boolean' || confirmed !== true) throw new RuntimePluginError(400, 'An installed plugin, enabled boolean and restart confirmation are required.')
    if (this.changing) throw new RuntimePluginError(409, 'Another plugin change is in progress. Refresh before retrying.')
    this.changing = true
    try {
      const installed = (await this.list()).find(plugin => plugin.id === id)
      if (!installed) throw new RuntimePluginError(404, 'Plugin is not installed.')
      if (installed.enabled === enabled) return { changed: false, restartRequired: false }
      const records = this.history()
      const record: PluginChange = { id: randomUUID(), pluginId: id, enabled, at: new Date().toISOString(), status: 'pending' }
      records.push(record)
      // Persist intent before touching runtime config. A crash leaves visible pending evidence.
      this.save(records)
      try {
        await this.run(['plugins', enabled ? 'enable' : 'disable', id])
        record.status = 'saved'
        this.save(records)
      } catch {
        record.status = 'failed'
        this.save(records)
        throw new RuntimePluginError(502, 'Plugin change could not be confirmed. Refresh inventory and check System logs before retrying.')
      }
      return { changed: true, restartRequired: true }
    } finally { this.changing = false }
  }
}

export const openClawPlugins = new OpenClawPlugins(async args => {
  const cli = resolveOpenClawCliPath()
  if (!cli) throw new RuntimePluginError(503, 'OpenClaw CLI is unavailable in this runtime.')
  const result = await execFileAsync(cli, args, { env: safeEnv(), timeout: 30000, maxBuffer: 8 * 1024 * 1024 })
  return result.stdout
}, openClawStatePath)
