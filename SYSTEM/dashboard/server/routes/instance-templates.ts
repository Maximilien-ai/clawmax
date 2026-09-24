import express, { NextFunction, Request, Response } from 'express'
import { InstanceTemplateCatalog, validResourceId } from '../lib/instance-template-catalog'
import { validatePortableTemplate } from '../lib/portable-template'
import { PortableTemplateError } from '../lib/portable-template-zip'
import { createInstanceTemplateLifecycleRouter, TemplateLifecycleResolver, TEMPLATE_LIFECYCLE_OPERATIONS } from './instance-template-lifecycle'

const apiVersion = 'clawmax.instance/v1'
export const TEMPLATE_MEDIA_TYPE = 'application/vnd.clawmax.portable-template+zip'
export interface TemplateWorkspaceContext { workspaceId: string; workspacePath: string; actorId: string; assertAuthorized?: () => void }
interface Dependencies {
  authorize(req: Request, res: Response): TemplateWorkspaceContext | null
  dashboardVersion(): string
  openClawVersion(): string
  lifecycle?: TemplateLifecycleResolver
}
function error(res: Response, req: Request, status: number, code: string, message: string) {
  return res.status(status).json({ apiVersion, kind: 'Error', requestId: res.locals.templateRequestId, error: { code, message, retryable: status === 503 || status === 429 } })
}
export function createInstanceTemplatesRouter(dependencies: Dependencies) {
  const router = express.Router({ mergeParams: true })
  let uploads = 0
  router.use((req, res, next) => {
    res.locals.templateRequestId = `req_${require('crypto').randomUUID()}`
    const context = dependencies.authorize(req, res)
    if (!context) return
    res.locals.templateContext = context
    next()
  })
  const context = (res: Response): TemplateWorkspaceContext => res.locals.templateContext
  const catalog = (res: Response) => new InstanceTemplateCatalog(context(res).workspacePath, context(res).workspaceId)
  const handle = (operation: (req: Request, res: Response) => unknown | Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve().then(() => operation(req, res)).catch(next) }

  router.get('/capabilities', handle((_req, res) => {
    const workspace = context(res)
    let available = false
    workspace.assertAuthorized?.()
    if (dependencies.lifecycle && workspace.assertAuthorized) {
      try {
        const service = dependencies.lifecycle(workspace)
        if (service.store.workspaceId === workspace.workspaceId && service.store.workspacePath === workspace.workspacePath
          && service.coordinator.workspaceId === workspace.workspaceId && service.coordinator.workspacePath === workspace.workspacePath
          && service.assertStagingAvailable) {
          service.assertStagingAvailable()
          available = true
        }
      } catch { /* Missing/revoked server configuration must not advertise admission. */ }
    }
    workspace.assertAuthorized?.()
    return res.json({
    apiVersion, kind: 'Capabilities', workspaceId: context(res).workspaceId,
    workspacePackage: { formats: [], operations: [] },
    templates: {
      formats: [{ name: 'portable-zip', schemaVersions: ['clawmax.portable-template/v1alpha1', 'clawmax.portable-template/v1alpha2'] }],
      operations: ['export', 'import', 'list', 'remove', 'show', 'validate', 'versions', ...(available ? TEMPLATE_LIFECYCLE_OPERATIONS : [])],
      lifecycle: { available, mode: 'staged-no-tools', execution: false, scheduling: false, skillInstallation: false, credentialDelivery: false },
    },
    skills: { formats: [], platforms: [], operations: [] }, communities: { available: false },
    groups: { permanent: false, operations: [] }, workflows: { scheduling: false, operations: [] },
    runtime: { dashboardVersion: dependencies.dashboardVersion(), openClawVersion: dependencies.openClawVersion(), operatingSystem: process.platform, architecture: process.arch === 'x64' ? 'amd64' : process.arch },
  })
  }))

  router.get('/templates', handle((_req, res) => res.json({ apiVersion, kind: 'TemplateList', items: catalog(res).list() })))
  router.get('/templates/:templateId', handle((req, res) => res.json({ apiVersion, kind: 'Template', template: catalog(res).get(req.params.templateId) })))
  router.get('/templates/:templateId/export', handle(async (req, res) => {
    if (!validResourceId(req.params.templateId) || Object.keys(req.query).length) throw new PortableTemplateError('invalid_request', 'Export requires a Template identity and no query fields')
    const bytes = await catalog(res).exportBundle(req.params.templateId)
    context(res).assertAuthorized?.()
    res.set('Cache-Control', 'no-store')
    res.set('Content-Disposition', `attachment; filename="${req.params.templateId}.zip"`)
    res.type(TEMPLATE_MEDIA_TYPE).send(bytes)
  }))
  router.get('/template-keys/:key/versions', handle((req, res) => {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(req.params.key)) throw new PortableTemplateError('invalid_request', 'Invalid Template key')
    return res.json({ apiVersion, kind: 'TemplateVersionList', items: catalog(res).list(req.params.key) })
  }))
  router.delete('/templates/:templateId', handle((req, res) => {
    catalog(res).remove(req.params.templateId)
    // The public flag describes the resulting absence, not whether this request
    // performed the first deletion. CLI retries after response loss need the
    // same successful result, including when a tombstone already exists.
    return res.json({ apiVersion, kind: 'TemplateRemoval', id: req.params.templateId, workspaceId: context(res).workspaceId, removed: true })
  }))

  const admitUpload = (req: Request, res: Response, next: NextFunction) => {
    if (!req.is(TEMPLATE_MEDIA_TYPE)) return error(res, req, 415, 'unsupported_media_type', 'A portable Template ZIP is required')
    if (uploads >= 2) return error(res, req, 429, 'template_validation_busy', 'Template validation is busy; retry later')
    uploads++
    let released = false
    const release = () => { if (!released) { released = true; uploads-- } }
    res.locals.releaseTemplateUpload = release
    res.once('finish', release)
    // A disconnected client must not free a slot while decompression is still
    // running; otherwise repeated disconnects defeat the memory concurrency cap.
    req.once('aborted', () => { if (!req.complete) release() })
    next()
  }
  const raw = express.raw({ type: TEMPLATE_MEDIA_TYPE, limit: '64mb', inflate: false })
  for (const operation of ['template-validations', 'templates']) router.post(`/${operation}`, admitUpload, raw, handle(async (req, res) => {
    try {
    if (operation === 'templates' && !validResourceId(req.get('Idempotency-Key'))) throw new PortableTemplateError('invalid_request', 'A valid Idempotency-Key is required')
    if (!Buffer.isBuffer(req.body)) throw new PortableTemplateError('invalid_template', 'A ZIP body is required')
    const bundle = await validatePortableTemplate(req.body)
    context(res).assertAuthorized?.()
    if (req.get('X-ClawMax-Template-Key') !== bundle.manifest.key || req.get('X-ClawMax-Template-Version') !== bundle.manifest.version || req.get('X-ClawMax-Template-SHA256') !== bundle.bundleSha256) throw new PortableTemplateError('template_identity_mismatch', 'Bundle headers do not match validated content')
    if (operation === 'template-validations') return res.json({ apiVersion, kind: 'TemplateValidation', valid: true, key: bundle.manifest.key, name: bundle.manifest.name, version: bundle.manifest.version, bundleSha256: bundle.bundleSha256, artifactCount: bundle.artifacts.length, secretRequirementCount: bundle.manifest.secretRequirements.length })
    const result = catalog(res).import(bundle, req.body, context(res).actorId, req.get('Idempotency-Key')!)
    return res.status(result.created ? 201 : 200).json({ apiVersion, kind: 'TemplateImportResult', ...result })
    } finally { res.locals.releaseTemplateUpload?.() }
  }))

  router.use(createInstanceTemplateLifecycleRouter(dependencies.lifecycle))
  router.use((failure: any, req: Request, res: Response, _next: NextFunction) => {
    res.locals.releaseTemplateUpload?.()
    if (failure instanceof PortableTemplateError) return error(res, req, failure.status, failure.code, failure.message)
    if (failure?.type === 'entity.parse.failed') return error(res, req, 400, 'invalid_request', 'Invalid JSON request')
    if (failure?.type === 'entity.too.large') return req.is(TEMPLATE_MEDIA_TYPE)
      ? error(res, req, 413, 'template_too_large', 'Template ZIP exceeds the upload limit')
      : error(res, req, 413, 'request_too_large', 'Request exceeds the size limit')
    if (failure?.status === 415) return error(res, req, 415, 'unsupported_media_type', 'Compressed HTTP request bodies are unsupported')
    return error(res, req, 503, 'template_store_unavailable', 'Template operation could not be completed')
  })
  return router
}
