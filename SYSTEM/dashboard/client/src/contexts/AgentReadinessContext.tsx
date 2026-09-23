import React, { createContext, useContext, useEffect, useState } from 'react'
import { useWorkspace } from './WorkspaceContext'
import { byokForRequest, readStoredByokKeys, buildByokVerificationFingerprint } from '../lib/byok'
import { buildWorkspaceScopedPath } from '../lib/workspaceScope'
import { agentAttentionFromReadiness, agentAttentionKey, type AgentAttention } from '../lib/agentReadiness'

type Entry = { id: string; name: string; generation?: string; attention: AgentAttention | null }
const Context = createContext<{ entries: Record<string, Entry>; refresh: () => void }>({ entries: {}, refresh: () => {} })

export function AgentReadinessProvider({ children }: { children: React.ReactNode }) {
  const { activeWorkspace } = useWorkspace()
  const workspaceId = activeWorkspace?.id
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ workspaceId?: string; entries: Record<string, Entry> }>({ entries: {} })
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1)
    const events = ['clawmax-browser-vault-updated', 'integrations-saved', 'storage', 'focus', 'agents-updated']
    events.forEach(event => window.addEventListener(event, refresh))
    const timer = window.setInterval(refresh, 60000)
    return () => { events.forEach(event => window.removeEventListener(event, refresh)); window.clearInterval(timer) }
  }, [])
  useEffect(() => {
    if (!workspaceId) return
    const controller = new AbortController()
    let disposed = false
    const failed = () => {
      if (!disposed) setResult({ workspaceId, entries: {
        unavailable: { id: '', name: 'Workspace', attention: agentAttentionFromReadiness(null) },
      } })
    }
    const timeout = window.setTimeout(() => { controller.abort(); failed() }, 30000)
    const url = (route: string) => buildWorkspaceScopedPath(route, workspaceId)
    const run = async () => {
      const response = await fetch(url('/api/agents'), { signal: controller.signal })
      if (!response.ok) throw new Error('Agent list unavailable')
      const data = await response.json()
      if (!Array.isArray(data.agents)) throw new Error('Invalid agent list')
      const health = await fetch(url('/api/health'), { signal: controller.signal }).then(res => res.json()).catch(() => null)
      const gatewayUnavailable = health?.readiness?.gateway?.required === true && health.readiness.gateway.ready === false
      const queue = data.agents.filter((agent: any) => !agent.archived)
      const entries: Record<string, Entry> = {}
      // Bound fan-out for larger workspaces. Credentials remain only in POST bodies.
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length && !controller.signal.aborted) {
          const agent = queue.shift()
          let attention: AgentAttention | null
          try {
            const res = await fetch(url(`/api/agents/${encodeURIComponent(agent.id)}/chat/readiness`), {
              method: 'POST', signal: controller.signal,
              headers: { 'Content-Type': 'application/json', ...(agent.generation ? { 'X-ClawMax-Agent-Generation': agent.generation } : {}) },
              body: JSON.stringify({ byok: byokForRequest() }),
            })
            const readiness = res.ok ? await res.json() : null
            const provider = readiness?.resolvedAgent?.provider
            const stored = readStoredByokKeys()
            let needsValidation = false
            if (['openai', 'anthropic', 'gemini', 'openrouter', 'xai'].includes(provider)) {
              const keyProvider = provider as 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'xai'
              const fingerprint = buildByokVerificationFingerprint(keyProvider, stored)
              needsValidation = !!fingerprint && stored.verifiedProviders?.[keyProvider] !== fingerprint
            }
            attention = agentAttentionFromReadiness(readiness, needsValidation, gatewayUnavailable)
          } catch { attention = agentAttentionFromReadiness(null) }
          entries[agentAttentionKey(agent.id, agent.generation)] = { id: agent.id, name: agent.name, generation: agent.generation, attention }
        }
      }))
      if (!controller.signal.aborted) setResult({ workspaceId, entries })
    }
    void run().catch(failed).finally(() => window.clearTimeout(timeout))
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort() }
  }, [workspaceId, revision])
  return <Context.Provider value={{ entries: result.workspaceId === workspaceId ? result.entries : {}, refresh: () => setRevision(value => value + 1) }}>{children}</Context.Provider>
}

export function useAgentReadiness() { return useContext(Context) }
