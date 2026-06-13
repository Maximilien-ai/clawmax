export const AGENT_DELETE_MODAL_LAYER = 'z-[70]'
export const BULK_OPERATIONS_MODAL_LAYER = 'z-[60]'

export function shouldShowAgentDetailDeleteAction(onDelete?: ((agentId: string) => void) | null) {
  return typeof onDelete === 'function'
}

export function shouldEnableBulkDelete(onDelete?: ((agents: Array<{ id: string; archived?: boolean }>) => Promise<void>) | null) {
  return typeof onDelete === 'function'
}
