import path from 'path'
import { TemplateApplyCoordinator } from './template-apply-coordinator'
import { TemplateRevisionStore } from './template-revisions'
import { TemplateGatewayTransaction, TemplateGatewayTransport } from './template-gateway-transaction'
import { setWorkspaceRecoveryPending } from './workspace-recovery-admission'

/** Must finish before readiness, HTTP serving, or background repair/scheduling.
 * Recovery uses durable evidence, never recompiles a Template or grants authority.
 * No journal means no gateway RPC, so legacy installations are unaffected by
 * gateway availability here. By default uncertain recovery rejects startup;
 * callers opting into isolation must enforce workspace admission before serving.
 */
export async function recoverTemplatesBeforeStartup(
  workspaces: ReadonlyArray<{ id: string; path: string }>,
  transport: TemplateGatewayTransport,
  agentStateRoot: string,
  options: { isolateFailures?: boolean } = {},
): Promise<{ blockedWorkspaceIds: string[] }> {
  const roots = new Set<string>()
  const blockedWorkspaceIds: string[] = []
  for (const workspace of workspaces) {
    const root = path.resolve(workspace.path)
    if (roots.has(root)) continue
    roots.add(root)
    setWorkspaceRecoveryPending(root, true)
    const store = new TemplateRevisionStore(root, workspace.id, () => {
      throw new Error('Startup recovery must not compile or admit resources')
    })
    try {
      await new TemplateApplyCoordinator(store, new TemplateGatewayTransaction(root, transport), agentStateRoot).recover()
      setWorkspaceRecoveryPending(root, false)
    } catch (error) {
      if (!options.isolateFailures) throw error
      blockedWorkspaceIds.push(workspace.id)
    }
  }
  return { blockedWorkspaceIds }
}
