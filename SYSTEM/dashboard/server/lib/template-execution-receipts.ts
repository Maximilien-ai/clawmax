import fs from 'fs'
import { sha256 } from './portable-template'
import { PortableTemplateError } from './portable-template-zip'
import { templateStoragePath } from './template-storage-path'
import { writeAtomicJson } from './instance-template-catalog'

interface Receipt { requestHash: string; status: 'pending' | 'completed'; result?: { runId: string; text: string } }
type Ledger = Record<string, Receipt>
const unavailable = () => new PortableTemplateError('template_execution_unavailable', 'Template execution evidence requires inspection', 409)
function file(root: string, revisionId: string) { return templateStoragePath(root, `.clawmax/template-runs/${sha256(revisionId)}.json`) }
function read(root: string, revisionId: string): Ledger {
  let fd: number | undefined
  try {
    fd = fs.openSync(file(root, revisionId), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
    const stat = fs.fstatSync(fd)
    if (!stat.isFile() || stat.size > 3 * 1024 * 1024) throw unavailable()
    const ledger = JSON.parse(fs.readFileSync(fd, 'utf8'))
    if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger) || Object.keys(ledger).length > 128) throw unavailable()
    for (const [key, entry] of Object.entries(ledger) as Array<[string, Receipt]>) {
      if (!/^[a-f0-9]{64}$/.test(key) || !entry || !/^[a-f0-9]{64}$/.test(entry.requestHash)
        || !['pending', 'completed'].includes(entry.status) || Object.keys(entry).some(field => !['requestHash', 'status', 'result'].includes(field))
        || (entry.status === 'pending' && entry.result !== undefined)
        || (entry.status === 'completed' && (!entry.result || typeof entry.result.runId !== 'string' || !entry.result.runId || typeof entry.result.text !== 'string' || !entry.result.text.trim() || Object.keys(entry.result).some(field => !['runId', 'text'].includes(field))))) throw unavailable()
    }
    return ledger
  } catch (error: any) {
    if (error.code === 'ENOENT') return {}
    throw unavailable()
  } finally { if (fd !== undefined) fs.closeSync(fd) }
}
function write(root: string, revisionId: string, ledger: Ledger) {
  if (Buffer.byteLength(JSON.stringify(ledger)) > 3 * 1024 * 1024) throw unavailable()
  writeAtomicJson(file(root, revisionId), ledger)
}
export function assertTemplateExecutionsSettled(root: string, revisionId: string): void {
  if (Object.values(read(root, revisionId)).some(entry => entry.status === 'pending')) throw new PortableTemplateError('template_execution_pending', 'Inspect the pending Template execution before cleanup or another run', 409)
}

/** Requires the coordinator's single-writer workspace lock throughout. A
 * pending claim survives process/response loss and is never redispatched.
 * Replies remain private local data; no prompt is duplicated in this ledger.
 */
export async function recordTemplateExecution(root: string, revisionId: string, key: string, requestHash: string, execute: (runKey: string) => Promise<{ runId: string; text: string }>) {
  const ledger = read(root, revisionId)
  const keyHash = sha256(key)
  const previous = ledger[keyHash]
  if (previous && previous.requestHash !== requestHash) throw new PortableTemplateError('idempotency_conflict', 'Execution key was used for a different request', 409)
  if (previous?.status === 'completed') return { replayed: true, ...previous.result! }
  assertTemplateExecutionsSettled(root, revisionId)
  if (Object.keys(ledger).length >= 128) throw unavailable()
  ledger[keyHash] = { requestHash, status: 'pending' }
  write(root, revisionId, ledger)
  const result = await execute(`template-${sha256(`${revisionId}:${keyHash}`)}`)
  if (!result || typeof result.runId !== 'string' || !result.runId || typeof result.text !== 'string' || !result.text.trim() || Buffer.byteLength(result.text) > 2 * 1024 * 1024) throw unavailable()
  ledger[keyHash] = { requestHash, status: 'completed', result: { runId: result.runId, text: result.text } }
  write(root, revisionId, ledger)
  return { replayed: false, ...ledger[keyHash].result! }
}
