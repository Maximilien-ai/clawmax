import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { PortableTemplate, sha256, validatePortableTemplate } from './portable-template'
import { PortableTemplateError } from './portable-template-zip'
import { templateStoragePath } from './template-storage-path'

export interface InstanceTemplate {
  id: string; workspaceId: string; key: string; name: string; version: string
  bundleSha256: string; artifactCount: number; secretRequirementCount: number; importedAt: string
}
interface CatalogState {
  version: 1
  templates: Array<{ template: InstanceTemplate; removed: boolean }>
  imports: Array<{ actorId: string; key: string; digest: string; templateId: string }>
}
export const validResourceId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)

/** Commit a single durable record; readers never observe partially written JSON. */
export function writeAtomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  let fd: number | undefined
  try {
    fd = fs.openSync(temporary, 'wx', 0o600)
    fs.writeFileSync(fd, JSON.stringify(value))
    fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined
    fs.renameSync(temporary, file)
    const directory = fs.openSync(path.dirname(file), 'r')
    try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
}

export class InstanceTemplateCatalog {
  readonly root: string
  private readonly index: string
  constructor(readonly workspacePath: string, readonly workspaceId: string) {
    this.root = templateStoragePath(workspacePath, '.clawmax/portable-templates')
    this.index = templateStoragePath(workspacePath, '.clawmax/portable-templates/catalog.json')
  }
  private read(): CatalogState {
    templateStoragePath(this.workspacePath, '.clawmax/portable-templates/catalog.json')
    if (!fs.existsSync(this.index)) return { version: 1, templates: [], imports: [] }
    try {
      const state = JSON.parse(fs.readFileSync(this.index, 'utf8'))
      if (state.version !== 1 || !Array.isArray(state.templates) || !Array.isArray(state.imports) || state.templates.some((entry: any) => !validResourceId(entry.template?.id) || entry.template.workspaceId !== this.workspaceId || typeof entry.removed !== 'boolean')) throw new Error('invalid state')
      return state
    } catch { throw new PortableTemplateError('template_store_unavailable', 'Template catalog is unreadable', 503) }
  }
  list(key?: string): InstanceTemplate[] {
    const templates = this.read().templates.filter(entry => !entry.removed && (!key || entry.template.key === key)).map(entry => entry.template)
    return templates.sort((a, b) => {
      if (a.key !== b.key) return a.key < b.key ? -1 : 1
      const left = a.version.split('.').map(BigInt), right = b.version.split('.').map(BigInt)
      for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? -1 : 1
      return a.id.localeCompare(b.id)
    })
  }
  get(id: string): InstanceTemplate {
    const entry = this.read().templates.find(entry => entry.template.id === id && !entry.removed)
    if (!entry) throw new PortableTemplateError('template_not_found', 'Template was not found', 404)
    return entry.template
  }
  async bundle(id: string): Promise<PortableTemplate> {
    const template = this.get(id)
    let bytes: Buffer
    try { bytes = fs.readFileSync(templateStoragePath(this.workspacePath, `.clawmax/portable-templates/${template.id}.zip`)) }
    catch { throw new PortableTemplateError('template_store_unavailable', 'Template bundle is unavailable', 503) }
    if (sha256(bytes) !== template.bundleSha256) throw new PortableTemplateError('template_store_unavailable', 'Template bundle integrity check failed', 503)
    return validatePortableTemplate(bytes)
  }
  /** Validation precedes this synchronous transaction: no await between read/commit.
   * The Dashboard owns one writer process per workspace volume. Multi-writer
   * replicas require a shared transactional store before they are supported.
   */
  import(bundle: PortableTemplate, bytes: Buffer, actorId: string, idempotencyKey: string): { created: boolean; template: InstanceTemplate } {
    if (!validResourceId(idempotencyKey)) throw new PortableTemplateError('invalid_request', 'A valid Idempotency-Key is required')
    if (sha256(bytes) !== bundle.bundleSha256) throw new PortableTemplateError('invalid_template', 'Validated bundle changed')
    const state = this.read()
    const replay = state.imports.find(entry => entry.actorId === actorId && entry.key === idempotencyKey)
    if (replay) {
      if (replay.digest !== bundle.bundleSha256) throw new PortableTemplateError('idempotency_conflict', 'Idempotency key was used for a different bundle', 409)
      const prior = state.templates.find(entry => entry.template.id === replay.templateId)
      if (!prior || prior.removed) throw new PortableTemplateError('idempotency_conflict', 'The imported Template was removed', 409)
      return { created: false, template: prior.template }
    }
    const { manifest } = bundle
    const existing = state.templates.find(entry => entry.template.key === manifest.key && entry.template.version === manifest.version)
    if (existing && (existing.template.bundleSha256 !== bundle.bundleSha256 || existing.removed)) throw new PortableTemplateError('template_version_conflict', 'Template key/version is already reserved', 409)
    const template: InstanceTemplate = existing?.template || {
      id: `tpl_${crypto.randomUUID()}`, workspaceId: this.workspaceId, key: manifest.key,
      name: manifest.name, version: manifest.version, bundleSha256: bundle.bundleSha256,
      artifactCount: bundle.artifacts.length, secretRequirementCount: manifest.secretRequirements.length,
      importedAt: new Date().toISOString(),
    }
    if (!existing) {
      fs.mkdirSync(this.root, { recursive: true, mode: 0o700 })
      const fd = fs.openSync(path.join(this.root, `${template.id}.zip`), 'wx', 0o600)
      try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
      state.templates.push({ template, removed: false })
    }
    state.imports.push({ actorId, key: idempotencyKey, digest: bundle.bundleSha256, templateId: template.id })
    writeAtomicJson(this.index, state)
    return { created: !existing, template }
  }
  remove(id: string): boolean {
    if (!validResourceId(id)) throw new PortableTemplateError('invalid_request', 'Invalid Template ID')
    const state = this.read()
    const entry = state.templates.find(entry => entry.template.id === id)
    if (!entry) return false
    const bundlePath = templateStoragePath(this.workspacePath, `.clawmax/portable-templates/${id}.zip`)
    const removed = !entry.removed
    entry.removed = true
    if (removed) writeAtomicJson(this.index, state)
    // Catalog deletion never knows or traverses applied resource paths.
    if (fs.existsSync(bundlePath)) fs.unlinkSync(bundlePath)
    return removed
  }
}
