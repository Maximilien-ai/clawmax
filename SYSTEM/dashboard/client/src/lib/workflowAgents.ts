/** Load every active workspace agent rather than only the first API page. */
export async function loadWorkflowAgents(): Promise<any[]> {
  const agents: any[] = []
  let cursor = ''
  const seen = new Set<string>()
  do {
    const response = await fetch(`/api/agents?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    if (!response.ok) throw new Error('Could not load workspace agents. Try again.')
    const data = await response.json() as { agents?: any[]; hasMore?: boolean; nextCursor?: string }
    agents.push(...(data.agents || []).filter((agent: any) => !agent.archived))
    if (!data.hasMore) break
    if (!data.nextCursor || seen.has(data.nextCursor)) throw new Error('Agent list is incomplete. Refresh and try again.')
    cursor = data.nextCursor; seen.add(cursor)
  } while (cursor)
  return [...new Map(agents.map(agent => [agent.id, agent])).values()]
}
