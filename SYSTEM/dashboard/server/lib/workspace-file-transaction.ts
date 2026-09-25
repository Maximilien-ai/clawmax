import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { PortableTemplateError } from './portable-template-zip'
import { writeAtomicJson } from './instance-template-catalog'
import { templateStoragePath } from './template-storage-path'

export interface WorkspaceFileMutation { path: string; expectedSha256: string | null; content: string | Buffer | null; mode?: 0o600 | 0o700 }
interface JournalEntry { path: string; before: string | null; after: string | null; beforeMode?: number | null; afterMode?: number | null }
interface Journal { version: 1 | 2; id: string; state: 'prepared' | 'committed'; entries: JournalEntry[] }
const digest = (content: Buffer) => crypto.createHash('sha256').update(content).digest('hex')
const journalPath = (root: string) => templateStoragePath(root, '.clawmax/template-transaction.json')
const locks = new Set<string>()

function target(root: string, relative: string): string {
  // Only canonical resource directories, never runtime credentials or host config.
  if (typeof relative !== 'string' || !/^(?:AGENTS|ORG|WORKFLOWS|SYSTEM|SKILLS\/custom)\/[A-Za-z0-9._/-]+$/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new PortableTemplateError('invalid_plan', 'Unsafe resource path')
  return templateStoragePath(root, relative)
}
const maxBytes = (relative: string) => relative.startsWith('SKILLS/custom/') ? 16 * 1024 * 1024 : 2 * 1024 * 1024
function read(file: string, relative: string): Buffer | null {
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size > maxBytes(relative)) throw new PortableTemplateError('resource_conflict', 'Resource is not a bounded regular file', 409)
    return fs.readFileSync(file)
  } catch (error: any) { if (error.code === 'ENOENT') return null; throw error }
}
function write(file: string, bytes: Buffer | null, mode = 0o600): void {
  if (bytes === null) {
    if (fs.existsSync(file)) { fs.unlinkSync(file); syncDirectory(path.dirname(file)) }
    return
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  const fd = fs.openSync(temporary, 'wx', mode)
  try { fs.writeFileSync(fd, bytes); fs.fchmodSync(fd, mode); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  try { fs.renameSync(temporary, file) } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
  syncDirectory(path.dirname(file))
}
function syncDirectory(folder: string) {
  const directory = fs.openSync(folder, 'r')
  try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
}
const encoded = (bytes: Buffer | null) => bytes === null ? null : bytes.toString('base64')
const decoded = (value: string | null) => value === null ? null : Buffer.from(value, 'base64')

/** Roll back an interrupted apply before any workspace reader resumes.
 * Changed files are never silently overwritten: unexpected external changes
 * block recovery for operator inspection. One Dashboard writer per volume.
 */
export function recoverWorkspaceFileTransaction(root: string): void {
  const file = journalPath(root)
  if (!fs.existsSync(file)) return
  if (locks.has(root)) throw new PortableTemplateError('workspace_busy', 'Workspace transaction is in progress', 503)
  const bytes = fs.readFileSync(file)
  if (bytes.length > 40 * 1024 * 1024) throw new PortableTemplateError('workspace_recovery_required', 'Transaction journal is oversized', 503)
  let journal: Journal
  try { journal = JSON.parse(bytes.toString('utf8')) } catch { throw new PortableTemplateError('workspace_recovery_required', 'Transaction journal is unreadable', 503) }
  if (![1, 2].includes(journal.version) || !['prepared', 'committed'].includes(journal.state) || !Array.isArray(journal.entries) || journal.entries.length > 1024 || journal.entries.some(entry => typeof entry.path !== 'string' || (entry.before !== null && typeof entry.before !== 'string') || (entry.after !== null && typeof entry.after !== 'string') || (entry.beforeMode !== undefined && entry.beforeMode !== null && (!Number.isInteger(entry.beforeMode) || entry.beforeMode < 0 || entry.beforeMode > 0o777)) || (entry.afterMode !== undefined && entry.afterMode !== null && ![0o600, 0o700].includes(entry.afterMode)))) throw new PortableTemplateError('workspace_recovery_required', 'Invalid transaction journal', 503)
  if (journal.entries.some(entry => (entry.before !== null && decoded(entry.before)!.length > maxBytes(entry.path)) || (entry.after !== null && decoded(entry.after)!.length > maxBytes(entry.path)))) throw new PortableTemplateError('workspace_recovery_required', 'Transaction journal contains an oversized resource', 503)
  for (const entry of journal.entries) {
    const current = encoded(read(target(root, entry.path), entry.path))
    if (current !== entry.after && (journal.state === 'committed' || current !== entry.before)) throw new PortableTemplateError('workspace_recovery_required', 'A transaction resource changed outside the recorded revision', 503)
  }
  if (journal.state === 'prepared') for (const entry of [...journal.entries].reverse()) write(target(root, entry.path), decoded(entry.before), entry.beforeMode ?? 0o600)
  fs.unlinkSync(file)
  syncDirectory(path.dirname(file))
}

/** No await is permitted inside the commit section. Readers in this Dashboard
 * process see either before or after; the durable journal handles process loss.
 * A future multi-writer deployment needs a shared transactional storage adapter.
 */
export function commitWorkspaceFiles(rootInput: string, mutations: WorkspaceFileMutation[], afterWrite?: (index: number) => void): void {
  const root = path.resolve(rootInput)
  recoverWorkspaceFileTransaction(root)
  if (mutations.length === 0 || mutations.length > 1024 || new Set(mutations.map(item => item.path)).size !== mutations.length) throw new PortableTemplateError('invalid_plan', 'Invalid resource mutation inventory')
  const entries = mutations.map(item => {
    const file = target(root, item.path)
    const before = read(file, item.path)
    if ((before === null ? null : digest(before)) !== item.expectedSha256) throw new PortableTemplateError('stale_plan', 'Workspace resources changed after planning', 409)
    if (item.content !== null && Buffer.byteLength(item.content) > maxBytes(item.path)) throw new PortableTemplateError('invalid_plan', 'Resource content is oversized')
    if (item.mode !== undefined && ![0o600, 0o700].includes(item.mode)) throw new PortableTemplateError('invalid_plan', 'Invalid resource mode')
    const beforeMode = before === null ? null : fs.statSync(file).mode & 0o777
    const afterMode = item.content === null ? null : item.mode ?? (beforeMode === 0o700 ? 0o700 : 0o600)
    return { path: item.path, before: encoded(before), after: item.content === null ? null : Buffer.from(item.content).toString('base64'), beforeMode, afterMode }
  })
  const journal: Journal = { version: 2, id: crypto.randomUUID(), state: 'prepared', entries }
  if (Buffer.byteLength(JSON.stringify(journal)) > 40 * 1024 * 1024) throw new PortableTemplateError('invalid_plan', 'Template transaction exceeds the resource limit')
  writeAtomicJson(journalPath(root), journal)
  locks.add(root)
  try {
    entries.forEach((entry, index) => { write(target(root, entry.path), decoded(entry.after), entry.afterMode ?? 0o600); afterWrite?.(index) })
    writeAtomicJson(journalPath(root), { ...journal, state: 'committed' })
    fs.unlinkSync(journalPath(root))
    syncDirectory(path.dirname(journalPath(root)))
  } catch (error) {
    locks.delete(root)
    recoverWorkspaceFileTransaction(root)
    throw error
  } finally { locks.delete(root) }
}
