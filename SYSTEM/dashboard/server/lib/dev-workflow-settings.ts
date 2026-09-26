import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import * as cron from 'node-cron'
import { templateStoragePath } from './template-storage-path'

export interface DevWorkflowSettings {
  name: string; description: string; content: string
  schedule: string; timezone: string; enabled: boolean
}
export function validateDevWorkflowSettings(value: any): DevWorkflowSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid workflow settings')
  for (const field of ['name', 'description', 'content', 'schedule', 'timezone']) {
    if (typeof value[field] !== 'string' || !value[field].trim() || Buffer.byteLength(value[field]) > (field === 'content' ? 16384 : 1024)) throw new Error(`Invalid ${field}`)
  }
  if (typeof value.enabled !== 'boolean') throw new Error('Invalid enabled setting')
  if (value.schedule !== 'manual' && !cron.validate(value.schedule)) throw new Error('Invalid cron expression')
  try { new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format() } catch { throw new Error('Invalid timezone') }
  return { name: value.name.trim(), description: value.description.trim(), content: value.content.trim(), schedule: value.schedule.trim(), timezone: value.timezone, enabled: value.enabled }
}
function settingsPath(root: string, id: string) {
  if (!/^tr-[a-f0-9]{16}-workflow-[a-f0-9]{12}$/.test(id)) throw new Error('Invalid workflow identity')
  return templateStoragePath(root, `SYSTEM/dev-workflow-settings/${id}.json`)
}
export function readDevWorkflowSettings(root: string, id: string, revisionId: string, actorId: string): DevWorkflowSettings | null {
  const file = settingsPath(root, id)
  let fd: number
  try { fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK) } catch (error: any) { if (error.code === 'ENOENT') return null; throw error }
  try {
    const stat = fs.fstatSync(fd)
    if (!stat.isFile() || stat.size > 32768) throw new Error('Workflow settings unavailable')
    const saved = JSON.parse(fs.readFileSync(fd, 'utf8'))
    if (saved.schemaVersion !== 1 || saved.revisionId !== revisionId || saved.actorId !== actorId) throw new Error('Workflow settings authority changed')
    return validateDevWorkflowSettings(saved.settings)
  } finally { fs.closeSync(fd) }
}
export function writeDevWorkflowSettings(root: string, id: string, revisionId: string, actorId: string, value: unknown) {
  const settings = validateDevWorkflowSettings(value)
  const file = settingsPath(root, id)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temp = `${file}.${crypto.randomUUID()}.tmp`
  try {
    fs.writeFileSync(temp, JSON.stringify({ schemaVersion: 1, revisionId, actorId, settings, updatedAt: new Date().toISOString() }), { mode: 0o600, flag: 'wx' })
    fs.renameSync(temp, file)
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
  return settings
}
