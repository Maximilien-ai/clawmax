import fs from 'fs'
import path from 'path'
import { isDeepStrictEqual } from 'util'
import Ajv from 'ajv'
import { GatewayRPCClient } from './gateway-rpc'
import { writeAtomicJson } from './instance-template-catalog'
import { templateStoragePath } from './template-storage-path'
import { PortableTemplateError } from './portable-template-zip'

export interface TemplateGatewayEntry {
  name: string; workspace: string; agentDir: string; model: string
  skills: string[]; tools: { deny: string[] }; heartbeat: { every: string }
}
export interface TemplateGatewayTransport {
  snapshot(): Promise<{ hash: string; entries: Record<string, unknown> }>
  patch(entries: Record<string, TemplateGatewayEntry | null>, hash: string): Promise<void>
}
interface Journal { version: 1; planDigest: string; entries: Record<string, TemplateGatewayEntry> }
const entrySchema = {
  type: 'object', additionalProperties: false,
  required: ['name', 'workspace', 'agentDir', 'model', 'skills', 'tools', 'heartbeat'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 128 },
    workspace: { type: 'string', minLength: 1, maxLength: 4096 },
    agentDir: { type: 'string', minLength: 1, maxLength: 4096 },
    model: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$' },
    // Staged registrations cannot install Skills or enable tools/heartbeats.
    skills: { const: [] }, tools: { const: { deny: ['*'] } }, heartbeat: { const: { every: '0m' } },
  },
}
const validateJournal = new Ajv().compile<Journal>({
  type: 'object', additionalProperties: false, required: ['version', 'planDigest', 'entries'],
  properties: {
    version: { const: 1 }, planDigest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    entries: { type: 'object', minProperties: 1, maxProperties: 128, additionalProperties: false, patternProperties: { '^tr-[a-f0-9]{16}-agent-[a-f0-9]{12}$': entrySchema } },
  },
})
const busy = new Set<string>()
function blocked(message: string): never { throw new PortableTemplateError('gateway_recovery_required', message, 503) }

/** No native agents.create/delete calls: keyed RFC-7396 patches preserve all
 * unrelated configuration. Reject legacy list rosters instead of rewriting them.
 */
export function createTemplateGatewayTransport(client: Pick<GatewayRPCClient, 'getConfig' | 'patchTemplateAgentEntriesAtRevision'>): TemplateGatewayTransport {
  return {
    async snapshot() {
      const value = await client.getConfig()
      const config = value?.sourceConfig || value?.config
      if (!value?.hash || typeof value.hash !== 'string' || !config?.agents?.entries || Array.isArray(config.agents.entries) || typeof config.agents.entries !== 'object' || config.agents.list) blocked('A revisioned keyed gateway roster is required')
      return { hash: value.hash, entries: structuredClone(config.agents.entries) }
    },
    patch: (entries, hash) => client.patchTemplateAgentEntriesAtRevision(entries as unknown as Record<string, Record<string, unknown> | null>, hash),
  }
}

/** Internal runtime half of Template apply, not a public execution API.
 * The coordinator must commit resource/revision files after
 * register(), then recover() with a durable revision-ledger lookup. On restart,
 * an absent revision rolls the owned registrations back; a committed revision
 * verifies them. Registration alone never enables Dashboard execution.
 */
export class TemplateGatewayTransaction {
  private root: string
  constructor(workspacePath: string, private transport: TemplateGatewayTransport) { this.root = path.resolve(workspacePath) }
  get workspacePath(): string { return this.root }
  private file() { return templateStoragePath(this.root, '.clawmax/template-gateway-transaction.json') }
  private receipt(planDigest: string) {
    if (!/^[a-f0-9]{64}$/.test(planDigest)) blocked('Invalid Template revision identity')
    return templateStoragePath(this.root, `.clawmax/template-gateway-revisions/${planDigest}.json`)
  }
  private validate(value: unknown): Journal {
    if (!validateJournal(value)) blocked('Invalid Template gateway transaction')
    for (const [id, entry] of Object.entries(value.entries)) {
      if (entry.workspace !== path.join(this.root, 'AGENTS', id) || !path.isAbsolute(entry.agentDir) || entry.agentDir.includes('\0')) blocked('Invalid Template gateway resource paths')
    }
    return value
  }
  private read(file = this.file()): Journal | null {
    let fd: number | undefined
    try {
      fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
      const stat = fs.fstatSync(fd)
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) blocked('Invalid Template gateway journal')
      return this.validate(JSON.parse(fs.readFileSync(fd, 'utf8')))
    } catch (error: any) {
      if (error.code === 'ENOENT') return null
      return blocked('Template gateway journal requires inspection')
    } finally { if (fd !== undefined) fs.closeSync(fd) }
  }
  private async exclusively<T>(fn: () => Promise<T>): Promise<T> {
    if (busy.has(this.root)) blocked('Template gateway transaction is busy')
    busy.add(this.root)
    try { return await fn() } finally { busy.delete(this.root) }
  }
  /** Read-only staging evidence, never an execution grant. Expected entries
   * must be derived from the committed revision and server-owned authority,
   * not supplied by a client. Callers must recheck that authority after await.
   */
  async verifyCommitted(planDigest: string, expectedEntries: Record<string, TemplateGatewayEntry>): Promise<{ hash: string }> {
    return this.exclusively(async () => {
      const expected = this.validate(structuredClone({ version: 1, planDigest, entries: expectedEntries }))
      const receiptFile = this.receipt(planDigest)
      if (this.read()) blocked('Recover the previous Template gateway transaction first')
      const receipt = this.read(receiptFile)
      if (!receipt || !isDeepStrictEqual(receipt, expected)) blocked('Template gateway revision receipt does not match committed authority')
      let current: Awaited<ReturnType<TemplateGatewayTransport['snapshot']>>
      try { current = await this.transport.snapshot() } catch { blocked('Template gateway ownership could not be verified') }
      // A cleanup or receipt replacement across the RPC invalidates evidence.
      if (this.read() || !isDeepStrictEqual(this.read(receiptFile), receipt)) blocked('Template gateway revision changed during verification')
      if (!current || typeof current.hash !== 'string' || !current.hash || !current.entries || typeof current.entries !== 'object' || Array.isArray(current.entries) || Object.entries(expected.entries).some(([id, entry]) => !Object.hasOwn(current.entries, id) || !isDeepStrictEqual(current.entries[id], entry))) blocked('Template gateway registration does not match committed authority')
      return { hash: current.hash }
    })
  }
  async register(planDigest: string, entries: Record<string, TemplateGatewayEntry>, assertAuthorized: () => void = () => {}): Promise<void> {
    return this.exclusively(async () => {
      if (this.read()) blocked('Recover the previous Template gateway transaction first')
      const journal = this.validate(structuredClone({ version: 1, planDigest, entries }))
      if (this.read(this.receipt(planDigest))) blocked('Template gateway revision already exists')
      const before = await this.transport.snapshot()
      assertAuthorized()
      if (Object.keys(journal.entries).some(id => Object.hasOwn(before.entries, id))) blocked('Template gateway resource already exists')
      writeAtomicJson(this.file(), journal)
      // Keep the journal on every failure, including response loss or gateway
      // restart. Never assume an RPC exception means the write did not commit.
      try {
        await this.transport.patch(journal.entries, before.hash)
        const after = await this.transport.snapshot()
        if (Object.entries(journal.entries).some(([id, entry]) => !isDeepStrictEqual(after.entries[id], entry))) blocked('Template gateway registration could not be verified')
      } catch { blocked('Template gateway registration requires recovery') }
    })
  }
  /** Journal removal before the resource ledger commits cleanup. Until that
   * commit, recovery retains the registrations; afterward it removes only the
   * exact receipt entries. No credential or current catalog lookup is required.
   */
  async prepareCleanup(planDigest: string): Promise<void> {
    return this.exclusively(async () => {
      if (this.read()) blocked('Recover the previous Template gateway transaction first')
      const receipt = this.read(this.receipt(planDigest))
      if (!receipt || receipt.planDigest !== planDigest) blocked('Template gateway revision receipt is unavailable')
      const current = await this.transport.snapshot()
      if (Object.entries(receipt.entries).some(([id, entry]) => !isDeepStrictEqual(current.entries[id], entry))) blocked('Template gateway registration changed outside this transaction')
      writeAtomicJson(this.file(), receipt)
    })
  }
  async recover(revisionCommitted: (planDigest: string) => boolean): Promise<'none' | 'committed' | 'rolled-back'> {
    return this.exclusively(async () => {
      const journal = this.read()
      if (!journal) return 'none'
      const receiptFile = this.receipt(journal.planDigest)
      const receipt = this.read(receiptFile)
      if (receipt && !isDeepStrictEqual(receipt, journal)) blocked('Template gateway revision receipt changed')
      const committed = revisionCommitted(journal.planDigest)
      const current = await this.transport.snapshot()
      const removal: Record<string, null> = {}
      for (const [id, entry] of Object.entries(journal.entries)) {
        if (!Object.hasOwn(current.entries, id)) {
          if (committed) blocked('Committed Template gateway registration is missing')
          continue
        }
        if (!isDeepStrictEqual(current.entries[id], entry)) blocked('Template gateway registration changed outside this transaction')
        removal[id] = null
      }
      if (!committed && Object.keys(removal).length) {
        try {
          await this.transport.patch(removal, current.hash)
          const after = await this.transport.snapshot()
          if (Object.keys(removal).some(id => Object.hasOwn(after.entries, id))) blocked('Template gateway rollback could not be verified')
        } catch { blocked('Template gateway rollback requires recovery') }
      }
      if (committed) {
        if (!receipt) writeAtomicJson(receiptFile, journal)
      } else if (receipt) {
        fs.unlinkSync(receiptFile)
        const receiptDirectory = fs.openSync(path.dirname(receiptFile), 'r')
        try { fs.fsyncSync(receiptDirectory) } finally { fs.closeSync(receiptDirectory) }
      }
      fs.unlinkSync(this.file())
      const directory = fs.openSync(path.dirname(this.file()), 'r')
      try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
      return committed ? 'committed' : 'rolled-back'
    })
  }
}
