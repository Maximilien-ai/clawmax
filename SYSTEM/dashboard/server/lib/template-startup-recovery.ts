import path from 'path'
import { TemplateApplyCoordinator } from './template-apply-coordinator'
import { TemplateRevisionStore } from './template-revisions'
import { TemplateGatewayTransaction, TemplateGatewayTransport } from './template-gateway-transaction'

/** Must finish before readiness, HTTP serving, or background repair/scheduling.
 * Recovery uses durable evidence, never recompiles a Template or grants authority.
 * No journal means no gateway RPC, so legacy installations are unaffected by
 * gateway availability here. Any uncertain recovery rejects startup.
 */
export async function recoverTemplatesBeforeStartup(
  workspaces: ReadonlyArray<{ id: string; path: string }>,
  transport: TemplateGatewayTransport,
  agentStateRoot: string,
): Promise<void> {
  const roots = new Set<string>()
  for (const workspace of workspaces) {
    const root = path.resolve(workspace.path)
    if (roots.has(root)) continue
    roots.add(root)
    const store = new TemplateRevisionStore(root, workspace.id, () => {
      throw new Error('Startup recovery must not compile or admit resources')
    })
    await new TemplateApplyCoordinator(store, new TemplateGatewayTransaction(root, transport), agentStateRoot).recover()
  }
}
