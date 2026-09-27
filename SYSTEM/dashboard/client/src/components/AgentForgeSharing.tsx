import React, { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { MobileSafeDialog } from './MobileSafeDialog'

type Status = {
  agentforge: { configured: boolean; connected: boolean; purpose?: string; privacyUrl?: string; retentionDays?: number }
  destinations: Array<{ destinationId: string; scopes: string[] }>
  queuedEvents: number
  delivery?: { retry?: { lastError?: string } }
}

/** Participant-only consent. Operator partner configuration never turns sharing on. */
export function AgentForgeSharing() {
  const { activeWorkspace } = useWorkspace()
  const [status, setStatus] = useState<Status | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [scopes, setScopes] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const enrollment = useRef<string | null>(null)
  const generation = useRef(0)
  const active = status?.destinations.find(entry => entry.destinationId === 'agentforge')

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    enrollment.current = fragment.get('agentforge_enrollment')
    if (enrollment.current) {
      fragment.delete('agentforge_enrollment')
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${fragment.size ? `#${fragment}` : ''}`)
      setOpen(true)
    }
    const show = () => setOpen(true)
    window.addEventListener('open-agentforge-sharing', show)
    return () => window.removeEventListener('open-agentforge-sharing', show)
  }, [])

  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`/api/activity-export${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'AgentForge request failed. Please retry.')
    return payload
  }

  useEffect(() => {
    const current = ++generation.current
    setStatus(null); setScopes([]); setConfirmed(false); setError('')
    if (!activeWorkspace) return
    let stopped = false
    const refresh = async () => {
      try {
        const result = await request('/status')
        if (!stopped) setStatus(result)
      } catch { if (!stopped) setError('Unable to load sharing status. No permission changes were made.') }
    }
    void (async () => {
      const token = enrollment.current
      enrollment.current = null
      if (token) {
        setBusy(true)
        try { await request('/agentforge/enrollment', 'POST', { connectionCode: token }) }
        catch (cause) { if (!stopped) setError(cause instanceof Error ? cause.message : 'Enrollment failed.') }
        finally { if (generation.current === current) setBusy(false) }
      }
      await refresh()
    })()
    const timer = window.setInterval(() => { void refresh() }, 30000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [activeWorkspace?.id])

  async function changeConsent(revoke: boolean) {
    const current = generation.current
    setBusy(true); setError('')
    try {
      await request('/consent', revoke ? 'DELETE' : 'POST', { destinationId: 'agentforge', scopes })
      const result = await request('/status')
      if (generation.current === current) { setStatus(result); setConfirmed(false) }
    } catch (cause) {
      if (generation.current === current) setError(cause instanceof Error ? cause.message : 'Sharing update failed.')
    } finally { if (generation.current === current) setBusy(false) }
  }

  return <>
    {(status?.agentforge.configured || active) && <button type="button" onClick={() => setOpen(true)}
      className="fixed bottom-3 right-3 z-40 max-w-[calc(100vw-1.5rem)] rounded-full border bg-white px-3 py-2 text-xs text-gray-900 shadow dark:bg-gray-900 dark:text-white">
      {active ? 'Sharing activity with AgentForge · Manage' : 'AgentForge sharing off · Review'}
    </button>}
    {open && <MobileSafeDialog ariaLabelledBy="agentforge-sharing-title" panelClassName="max-w-lg text-gray-900 dark:text-white" onClose={() => setOpen(false)}
      header={<div className="flex items-start justify-between gap-3"><h2 id="agentforge-sharing-title" className="text-lg font-semibold">AgentForge activity sharing</h2>
        <button type="button" aria-label="Close sharing settings" onClick={() => setOpen(false)}>Close</button></div>}
      footer={active
        ? <button type="button" disabled={busy} onClick={() => void changeConsent(true)} className="rounded border border-red-600 px-4 py-2 text-red-600 disabled:opacity-50">Revoke sharing</button>
        : <button type="button" disabled={busy || !confirmed || !scopes.length || !status?.agentforge.connected || !status?.agentforge.configured}
            onClick={() => void changeConsent(false)} className="rounded bg-violet-700 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Working…' : 'Enable sharing'}</button>}>
        <p className="mt-2 break-words text-sm">Workspace: {activeWorkspace?.name || 'Loading…'}</p>
        {error && <p role="alert" className="mt-3 break-words text-sm text-red-600">{error}</p>}
        {!status ? <p className="mt-3">Loading sharing status…</p> : <>
          <p className="mt-3 text-sm">Destination: NYU – AgentForge. {status.agentforge.purpose}</p>
          <p className="mt-2 text-sm">Selected prompts and visible responses use pseudonymous user/workspace IDs. Known secrets and direct identifiers are redacted before queueing. Retention: up to {status.agentforge.retentionDays || 30} days. Sharing is optional; chat works without it.</p>
          {status.agentforge.privacyUrl && <a className="mt-2 inline-block underline" href={status.agentforge.privacyUrl} target="_blank" rel="noopener noreferrer">Privacy notice</a>}
          {!status.agentforge.configured && <p className="mt-3 text-sm">The operator must save the AgentForge API URL, privacy URL, and Partner API key in Partners first.</p>}
          {!status.agentforge.connected && <a className="mt-3 inline-block underline" href="https://agentforge-hackathon-os.yr2110.chatgpt.site/#/settings">Open AgentForge to connect your enrollment</a>}
          {active ? <>
            <p className="mt-3 break-words text-sm">Sharing: {active.scopes.join(', ')}. Queued events: {status.queuedEvents}.</p>
            <p className="mt-2 text-sm">Revoke stops new capture immediately, removes unsent events, and queues deletion requests for delivered activity.</p>
          </> : <>
            <fieldset disabled={busy || !status.agentforge.connected} className="mt-4 space-y-2">
              <legend className="mb-2 font-medium">Choose what to share</legend>
              {[['agent-chat', 'Agent chat prompts and responses'], ['builder', 'Builder prompts and responses']].map(([scope, label]) =>
                <label key={scope} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={scopes.includes(scope)}
                  onChange={event => { setConfirmed(false); setScopes(previous => event.target.checked ? [...previous, scope] : previous.filter(value => value !== scope)) }} />{label}</label>)}
              <label className="flex items-start gap-2 pt-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I agree to share these categories with AgentForge for the purpose above.</label>
            </fieldset>
          </>}
          {status.delivery?.retry?.lastError && <p className="mt-3 break-words text-sm">Delivery pending: {status.delivery.retry.lastError}</p>}
        </>}
    </MobileSafeDialog>}
  </>
}
