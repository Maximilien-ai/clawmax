export function createWorkflowStartGate() {
  const pending = new Set<string>()
  return {
    begin(id: string): boolean {
      if (pending.has(id)) return false
      pending.add(id)
      return true
    },
    has(id: string): boolean {
      return pending.has(id)
    },
    end(id: string): void {
      pending.delete(id)
    },
  }
}
