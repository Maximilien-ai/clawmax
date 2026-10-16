export interface ForwardTarget {
  type: 'group' | 'community'
  name: string
  displayName?: string
}

async function readJsonOrThrow(request: Promise<Response>, what: string): Promise<Record<string, unknown>> {
  const response = await request
  const body = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok || !body) {
    const reason = typeof body?.error === 'string' && body.error ? body.error : `HTTP ${response.status}`
    throw new Error(`Could not ${what}: ${reason}`)
  }
  return body
}

function toTargets(entries: unknown, type: ForwardTarget['type']): ForwardTarget[] {
  return (Array.isArray(entries) ? entries : []).flatMap((entry) => {
    const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
    if (typeof record.name !== 'string' || !record.name) return []
    return [{ type, name: record.name, ...(typeof record.displayName === 'string' && record.displayName ? { displayName: record.displayName } : {}) }]
  })
}

/** Groups, then communities. Resolves to [] for a workspace with neither; rejects when a list fails. */
export async function loadForwardTargets(fetchImpl: typeof fetch = fetch): Promise<ForwardTarget[]> {
  const [groups, communities] = await Promise.all([
    readJsonOrThrow(fetchImpl('/api/groups'), 'load groups'),
    readJsonOrThrow(fetchImpl('/api/communities'), 'load communities'),
  ])
  return [...toTargets(groups.groups, 'group'), ...toTargets(communities.communities, 'community')]
}

export async function forwardChatMessage(
  target: Pick<ForwardTarget, 'type' | 'name'>,
  message: { content: string; from: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const collection = target.type === 'community' ? 'communities' : 'groups'
  await readJsonOrThrow(fetchImpl(`/api/${collection}/${encodeURIComponent(target.name)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message.content, from: message.from, mentions: [] }),
  }), `forward to ${target.name}`)
}
