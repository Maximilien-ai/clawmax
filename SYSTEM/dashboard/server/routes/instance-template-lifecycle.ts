import express, { NextFunction, Request, Response } from 'express'
import { validResourceId } from '../lib/instance-template-catalog'
import { PortableTemplateError } from '../lib/portable-template-zip'
import { TemplateApplyCoordinator } from '../lib/template-apply-coordinator'
import { TemplateResourceOwnership, TemplateRevisionStore } from '../lib/template-revisions'
import type { TemplateWorkspaceContext } from './instance-templates'

/** Supplied only by server composition, never from request bodies or paths.
 * A staging service does not grant Agent, Group, or Workflow execution.
 */
export interface InstanceTemplateLifecycle {
  store: TemplateRevisionStore
  coordinator: TemplateApplyCoordinator
  assertStopped(resources: TemplateResourceOwnership): void
  /** Explicit production admission for staged resources, not execution. */
  assertStagingAvailable?(): void
}
export const TEMPLATE_LIFECYCLE_OPERATIONS = ['plan', 'apply', 'history', 'revision-show', 'cleanup-plan', 'cleanup'] as const
export type TemplateLifecycleResolver = (context: TemplateWorkspaceContext) => InstanceTemplateLifecycle

function body(req: Request, fields: string[]) {
  if (!req.is('application/json')) throw new PortableTemplateError('unsupported_media_type', 'A JSON request is required', 415)
  const value = req.body
  if (!value || typeof value !== 'object' || Array.isArray(value) || fields.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !fields.includes(key))) throw new PortableTemplateError('invalid_request', 'Unsupported lifecycle request fields')
  if (Buffer.byteLength(JSON.stringify(value)) > 64 * 1024) throw new PortableTemplateError('request_too_large', 'Lifecycle request exceeds the size limit', 413)
  return value
}
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

/** Mounted after the workspace authorization middleware and before its error
 * handler. The absent resolver is intentional: contracts can be exercised in an
 * isolated server without silently enabling production remote deployment.
 */
export function createInstanceTemplateLifecycleRouter(resolve?: TemplateLifecycleResolver) {
  const router = express.Router({ mergeParams: true })
  const handle = (fn: (req: Request, res: Response, service: InstanceTemplateLifecycle, context: TemplateWorkspaceContext) => unknown | Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve().then(async () => {
        if (!resolve) throw new PortableTemplateError('template_lifecycle_unavailable', 'Template lifecycle is unavailable pending server runtime admission', 503)
        const context = res.locals.templateContext as TemplateWorkspaceContext
        if (!context.assertAuthorized) throw new PortableTemplateError('template_lifecycle_unavailable', 'Live workspace authorization is required', 503)
        context.assertAuthorized()
        const service = resolve(context)
        if (service.store.workspaceId !== context.workspaceId || service.store.workspacePath !== context.workspacePath || service.coordinator.workspaceId !== context.workspaceId || service.coordinator.workspacePath !== context.workspacePath) throw new PortableTemplateError('template_lifecycle_unavailable', 'Template lifecycle workspace binding is unavailable', 503)
        return fn(req, res, service, context)
      }).catch(next)
    }
  const json = express.json({ limit: '64kb', inflate: false })
  router.post('/package-plans', json, handle(async (req, res, service, context) => {
    const request = body(req, ['templateId', 'expectedRevision', 'idempotencyKey', 'bindings'])
    const plan = await service.store.plan(context.actorId, request)
    context.assertAuthorized!()
    res.json(plan)
  }))
  router.post('/revisions', json, handle(async (req, res, service, context) => {
    const value = body(req, ['request', 'planDigest'])
    if (!digest(value.planDigest)) throw new PortableTemplateError('invalid_request', 'A valid plan digest is required')
    const result = await service.coordinator.apply(context.actorId, value.request, value.planDigest, context.assertAuthorized)
    context.assertAuthorized!()
    res.status(result.created ? 201 : 200).json({ apiVersion: 'clawmax.instance/v1', kind: 'TemplateApplyResult', workspaceId: context.workspaceId, ...result })
  }))
  router.get('/revisions', handle((_req, res, service, context) => {
    res.json({ apiVersion: 'clawmax.instance/v1', kind: 'TemplateRevisionList', workspaceId: context.workspaceId, currentRevision: service.store.currentRevision(), items: service.store.history().filter(item => item.actorId === context.actorId) })
  }))
  router.get('/revisions/:revisionId', handle((req, res, service, context) => {
    if (!validResourceId(req.params.revisionId)) throw new PortableTemplateError('invalid_request', 'Invalid revision identity')
    const revision = service.store.history().find(item => item.id === req.params.revisionId && item.actorId === context.actorId)
    if (!revision) throw new PortableTemplateError('revision_forbidden', 'Revision access is not authorized', 403)
    res.json({ apiVersion: 'clawmax.instance/v1', kind: 'TemplateRevision', workspaceId: context.workspaceId, revision })
  }))
  router.post('/revisions/:revisionId/cleanup-plans', json, handle((req, res, service, context) => {
    const value = body(req, ['expectedRevision'])
    if (!validResourceId(req.params.revisionId) || (value.expectedRevision !== null && !validResourceId(value.expectedRevision))) throw new PortableTemplateError('invalid_request', 'Invalid revision identity')
    res.json(service.store.planCleanup(context.actorId, req.params.revisionId, value.expectedRevision, resources => service.assertStopped(resources)))
  }))
  router.post('/revisions/:revisionId/cleanup', json, handle(async (req, res, service, context) => {
    const value = body(req, ['expectedRevision', 'planDigest'])
    if (!validResourceId(req.params.revisionId) || !digest(value.planDigest) || (value.expectedRevision !== null && !validResourceId(value.expectedRevision))) throw new PortableTemplateError('invalid_request', 'Invalid cleanup identity')
    const result = await service.coordinator.cleanup(context.actorId, req.params.revisionId, value.expectedRevision, value.planDigest, resources => service.assertStopped(resources), context.assertAuthorized)
    context.assertAuthorized!()
    res.json({ apiVersion: 'clawmax.instance/v1', kind: 'TemplateCleanupResult', workspaceId: context.workspaceId, ...result })
  }))
  return router
}
