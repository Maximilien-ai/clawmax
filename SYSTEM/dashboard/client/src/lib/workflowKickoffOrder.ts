/** Presentation only: stable ordering, no changes to dependencies or execution. */
export function kickoffFirst<T extends { name: string }>(workflows: readonly T[]): T[] {
  const isKickoff = (workflow: T) => {
    const title = workflow.name.split(/[·/]/).pop()?.trim() || ''
    return /^kick[\s-]?off\b/i.test(title) || /\bkick[\s-]?off$/i.test(title)
  }
  return [...workflows.filter(isKickoff), ...workflows.filter(workflow => !isKickoff(workflow))]
}
