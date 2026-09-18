import { PortableTemplateError } from './portable-template-zip'

/** Reserved IDs emitted by the portable Template compiler. Until the gateway
 * transaction and authority adapter are implemented, these resources are
 * inspectable but cannot execute through the existing participant runtime.
 * Checking identity also prevents deleting metadata from enabling execution.
 */
export function assertTemplateRuntimeAdmitted(id: string): void {
  if (/^tr-[a-f0-9]{16}-(?:agent|group|workflow)-[a-f0-9]{12}$/.test(id)) {
    throw new PortableTemplateError('template_runtime_unavailable', 'Template execution is unavailable pending runtime and authority admission', 409)
  }
}
