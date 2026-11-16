import React, { useEffect, useRef, useState } from 'react'

type Preview = { token: string; counts: Record<string, number>; agentCount: number; resume: boolean; lastOutcome: string | null }
export async function clearResponse(response: Response): Promise<any> {
  const body = await response.json().catch(() => null)
  if (!response.ok || !body || typeof body !== 'object') throw new Error(typeof body?.error === 'string' ? body.error : 'Clearing status is unavailable. Review Personal again before retrying.')
  return body
}
export function WorkspaceClearDialog({ onClose }: { onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [step, setStep] = useState<'review' | 'confirm' | 'complete'>('review')
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const submitting = useRef(false)
  const load = async () => {
    setBusy(true); setPreview(null); setError(''); setStep('review'); setPhrase('')
    try {
      const data = await clearResponse(await fetch('/api/workspaces/default/clear/preview', { method: 'POST', signal: AbortSignal.timeout(15000) }))
      if (typeof data.token !== 'string' || !data.counts || typeof data.agentCount !== 'number') throw new Error('Personal inventory could not be verified')
      setPreview(data)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load Personal inventory') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    void load()
    return () => previous?.focus()
  }, [])
  const confirm = async () => {
    if (!preview || phrase !== 'CLEAR PERSONAL' || submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      const result = await clearResponse(await fetch('/api/workspaces/default/clear', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ token: preview.token, confirmation: phrase, acknowledged: true }),
      }))
      if (result.ok !== true) throw new Error('Clearing was not verified; review Personal again')
      setStep('complete')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clearing did not finish. Review its status before retrying.')
      setPreview(null)
    } finally { submitting.current = false; setBusy(false) }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="clear-personal-title" tabIndex={-1}
      className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-xl bg-white p-5 text-gray-900 shadow-xl dark:bg-gray-800 dark:text-gray-100"
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) onClose()
        if (event.key === 'Tab') {
          const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') || [])
          const first = controls[0], last = controls[controls.length - 1]
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
      }}>
      <h2 id="clear-personal-title" className="shrink-0 text-xl font-semibold">{step === 'complete' ? 'Personal cleared' : 'Clear Personal workspace'}</h2>
      <div className="my-4 min-h-0 space-y-3 overflow-y-auto break-words text-sm">
        {step === 'complete' ? <p>Personal remains available. Its workspace content has been cleared. Other workspaces and instance credentials were preserved.</p> : <>
          <p className="rounded border border-red-200 bg-red-50 p-3 text-red-800">This permanently deletes Personal’s content. It cannot be undone. Export anything you need before continuing.</p>
          {step === 'review' && <p>Includes agents and archived agents, their local history and credentials, workflows and schedules, run history and outputs, groups, communities, documents, workspace skills/templates, plugin data and workspace settings.</p>}
          <p>The Personal workspace itself stays. Other workspaces, instance credentials and globally installed plugins, skills and templates stay.</p>
          {step === 'review' && <p>Use Personal as the active workspace and finish running work first. New Dashboard work is paused during cleanup. If cleanup fails, review and retry it before resuming work.</p>}
          {preview && <>
            <p className="font-medium">{preview.agentCount} agent(s) affected</p>
            <ul className="list-inside list-disc">{Object.entries(preview.counts).map(([name, count]) => <li key={name}>{name}: {count} file(s)</li>)}</ul>
            {preview.resume && <p role="status" className="text-amber-700">A previous clear did not finish. Some content may already be gone. These are the original operation’s impacts; continuing retries that cleanup.</p>}
            {!preview.resume && preview.lastOutcome === 'complete' && <p>Previous clear completed successfully.</p>}
          </>}
          {step === 'confirm' && <label className="block font-medium">Final confirmation: type CLEAR PERSONAL
            <input autoFocus value={phrase} onChange={event => setPhrase(event.target.value)} disabled={busy}
              className="mt-2 w-full rounded border border-gray-400 bg-transparent p-2" autoComplete="off" spellCheck={false} />
          </label>}
        </>}
        {busy && <p role="status">{step === 'confirm' ? 'Clearing Personal… Do not start other work. Runtime cleanup must finish before files are removed.' : 'Checking Personal’s content…'}</p>}
        {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t pt-3 dark:border-gray-600">
        {step === 'complete' ? <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={() => window.location.reload()}>Done — refresh workspace</button> : <>
          <button disabled={busy} className="rounded border px-4 py-2 disabled:opacity-50" onClick={onClose}>Cancel</button>
          {error ? <button disabled={busy} className="rounded border px-4 py-2" onClick={() => void load()}>Review again</button>
            : step === 'review' ? <button disabled={busy || !preview} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50" onClick={() => setStep('confirm')}>I understand — continue</button>
              : <button disabled={busy || phrase !== 'CLEAR PERSONAL' || !preview} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50" onClick={() => void confirm()}>Permanently clear Personal</button>}
        </>}
      </div>
    </div>
  </div>
}
