import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { templateStoragePath } from './template-storage-path'

export interface BriefDeliveryConfig {
  version: 1; enabled: boolean; recipient: string; reporterId: string
  enabledAt: string; workflowIds: string[]
}
type BriefRun = { runId: string; workflowId: string; status: string; createdAt: string; completedAt?: string; brief?: { title: string; content: string } }
export type DeliveryReceipt = { version: 1; id: string; runIds: string[]; recipient: string; reporterId: string; status: 'sending' | 'sent' | 'uncertain'; createdAt: string; providerId?: string }

function read(root: string, relative: string): any {
  const fd = fs.openSync(templateStoragePath(root, relative), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
  try {
    const stat = fs.fstatSync(fd)
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('Delivery data unavailable')
    return JSON.parse(fs.readFileSync(fd, 'utf8'))
  } finally { fs.closeSync(fd) }
}
export function readBriefDeliveryConfig(root: string): BriefDeliveryConfig | null {
  let c: BriefDeliveryConfig
  try { c = read(root, 'SYSTEM/brief-delivery.json') } catch (error: any) { if (error.code === 'ENOENT') return null; throw error }
  if (c.version !== 1 || typeof c.enabled !== 'boolean' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.recipient)
    || !/^[a-z][a-z0-9-]+$/.test(c.reporterId) || !Number.isFinite(Date.parse(c.enabledAt))
    || !Array.isArray(c.workflowIds) || !c.workflowIds.length || !c.workflowIds.every(id => /^tr-[a-f0-9]{16}-workflow-[a-f0-9]{12}$/.test(id))) throw new Error('Invalid brief delivery configuration')
  return c
}
function entries(root: string, dir: string): any[] {
  let names: string[]
  try { names = fs.readdirSync(templateStoragePath(root, dir)) } catch (error: any) { if (error.code === 'ENOENT') return []; throw error }
  return names.filter(n => /^[a-f0-9-]{36}\.json$/.test(n)).map(n => read(root, `${dir}/${n}`))
}
function persist(root: string, receipt: DeliveryReceipt, exclusive = false) {
  const file = templateStoragePath(root, `SYSTEM/brief-deliveries/${receipt.id}.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  if (exclusive) { fs.writeFileSync(file, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 }); return }
  const temp = `${file}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temp, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 })
  fs.renameSync(temp, file)
}

// A durable sending claim is never automatically replayed after a crash or
// ambiguous provider failure. Inspect the provider before explicitly retrying.
export async function deliverAvailableBriefs(root: string, deps: {
  now?: number
  authorize: (config: BriefDeliveryConfig) => void
  send: (config: BriefDeliveryConfig, body: string, batchId: string) => Promise<{ id?: string }>
  notify: (receipt: DeliveryReceipt) => void
}): Promise<DeliveryReceipt | null> {
  const config = readBriefDeliveryConfig(root)
  if (!config?.enabled) return null
  deps.authorize(config)
  const now = deps.now ?? Date.now()
  const runs: BriefRun[] = entries(root, 'SYSTEM/dev-template-workflow-runs').filter(r => config.workflowIds.includes(r.workflowId) && Date.parse(r.createdAt) >= Date.parse(config.enabledAt))
  const receipts: DeliveryReceipt[] = entries(root, 'SYSTEM/brief-deliveries')
  if (receipts.some(r => r.version !== 1 || !Array.isArray(r.runIds) || !['sending', 'sent', 'uncertain'].includes(r.status))) throw new Error('Delivery history unavailable')
  const claimed = new Set(receipts.flatMap(r => r.runIds))
  const pending = runs.filter(r => r.status === 'completed' && r.brief?.content?.trim() && !claimed.has(r.runId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (!pending.length) return null
  const newest = Math.max(...pending.map(r => Date.parse(r.completedAt || r.createdAt)))
  const oldest = Math.min(...pending.map(r => Date.parse(r.completedAt || r.createdAt)))
  // Coalesce concurrent workflows, but never wait indefinitely for a failed,
  // interrupted, or weekly run. Unfinished runs contribute no content.
  if (!Number.isFinite(newest) || now - newest < 60_000 || (runs.some(r => r.status === 'running') && now - oldest < 300_000)) return null
  const body = pending.map(r => `# ${r.brief!.title}\n\nCompleted: ${r.completedAt || r.createdAt}\n\n${r.brief!.content}`).join('\n\n---\n\n')
  if (Buffer.byteLength(body) > 256 * 1024) throw new Error('Combined brief is too large; review delivery')
  const receipt: DeliveryReceipt = { version: 1, id: crypto.randomUUID(), runIds: pending.map(r => r.runId), recipient: config.recipient, reporterId: config.reporterId, status: 'sending', createdAt: new Date(now).toISOString() }
  const dir = templateStoragePath(root, 'SYSTEM/brief-deliveries')
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const lock = templateStoragePath(root, 'SYSTEM/brief-deliveries/dispatch.lock')
  let fd: number
  try { fd = fs.openSync(lock, 'wx', 0o600) } catch (error: any) { if (error.code === 'EEXIST') throw new Error('Delivery lock needs review'); throw error }
  try {
    // Recheck claims and opt-in under the exclusive dispatch lock.
    if (entries(root, 'SYSTEM/brief-deliveries').some(r => r.runIds.some((id: string) => receipt.runIds.includes(id)))) return null
    if (JSON.stringify(readBriefDeliveryConfig(root)) !== JSON.stringify(config)) return null
    deps.authorize(config)
    persist(root, receipt, true)
    try {
      const result = await deps.send(config, body, receipt.id)
      receipt.status = 'sent'; receipt.providerId = result.id
    } catch { receipt.status = 'uncertain' }
    persist(root, receipt)
    deps.notify(receipt)
    return receipt
  } finally { fs.closeSync(fd); fs.unlinkSync(lock) }
}
