/**
 * Reload-merge decision for the ByokWizard Runtime step's `agentRuntime` field.
 *
 * `agentRuntime` is purely workspace-scoped, server-persisted state (unlike
 * `preferredModel`/`ollamaBaseUrl`, which also live in browser localStorage as a
 * cross-workspace fallback) — so on a real workspace switch the freshly loaded
 * value must fully replace whatever is in local state, or a runtime picked for
 * one workspace leaks into another workspace's save payload. Within the SAME
 * workspace, a redundant reload (e.g. an unrelated config field changing while
 * the wizard is open) should still defer to any unsaved selection the user just
 * made, matching how sibling fields protect an in-flight edit against a slow GET
 * resolving after it.
 */
export function resolveReloadedAgentRuntime(input: {
  currentValue: string
  loadedValue: string
  loadedWorkspaceId: string | null
  lastSyncedWorkspaceId: string | null
}): string {
  const workspaceChanged = input.loadedWorkspaceId !== input.lastSyncedWorkspaceId
  if (workspaceChanged) return input.loadedValue
  return input.currentValue || input.loadedValue
}
