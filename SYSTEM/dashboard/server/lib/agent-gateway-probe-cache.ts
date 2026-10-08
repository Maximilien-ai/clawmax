/** Share a short-lived gateway result across agents on the same endpoint. */
export function createAgentGatewayProbeCache(
  probe: (port: number, hosts: readonly string[]) => boolean,
  ttlMs = 5000,
) {
  const results = new Map<string, { running: boolean; expiresAt: number }>()

  return (port: number, hosts: readonly string[], now = Date.now()): boolean => {
    const key = JSON.stringify([port, hosts])
    const cached = results.get(key)
    if (cached && now < cached.expiresAt) return cached.running

    const running = probe(port, hosts)
    if (results.size >= 64) results.clear()
    results.set(key, { running, expiresAt: now + ttlMs })
    return running
  }
}
