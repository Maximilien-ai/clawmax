import React, { useEffect, useState } from 'react'

type Submission = { id: string; recipient: string; release: string; reviewer: string; status: string; createdAt: string; report: string; error?: string }
const endpoint = '/api/plugins/plugin-review-notes/review-submissions'
export default function ReviewEmailSubmission({ release, reviewer, buildReport }: { release: string; reviewer: string; buildReport: () => string }) {
  const [recipient, setRecipient] = useState('')
  const [configured, setConfigured] = useState(false)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<{ id: string; report: string; recipient: string; reviewer: string; release: string } | null>(null)
  useEffect(() => {
    let stopped = false
    const load = async () => {
      try {
        const response = await fetch(endpoint)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not load submission status')
        if (stopped) return
        setConfigured(data.emailConfigured)
        setRecipient(current => current || data.recipient || '')
        setSubmissions(data.submissions || [])
      } catch (reason: any) { if (!stopped) setError(reason.message) }
    }
    void load(); const timer = window.setInterval(load, 3000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [])
  const submit = async () => {
    if (!draft) return
    setBusy(true); setError('')
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, consent: true }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not submit review')
      setSubmissions(current => [data.submission, ...current.filter(value => value.id !== data.submission.id)])
      setDraft(null)
    } catch (reason: any) { setError(reason.message || 'Submission failed. Your report is preserved; retry or download it.') }
    finally { setBusy(false) }
  }
  const download = (submission: Submission) => {
    const url = URL.createObjectURL(new Blob([submission.report], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `clawmax-review-${submission.id}.md`; link.click(); URL.revokeObjectURL(url)
  }
  return <section className="space-y-3 rounded border p-3 text-sm">
    <h3 className="font-semibold">Submit review by email</h3>
    <p>Send this release’s results, notes, evidence links, reviewer identity and instance details. Chat transcripts and runtime logs are not included. Nothing is emailed until you confirm below.</p>
    {!configured && <p role="status">Email is not configured. Configure Resend in Partners, or use Export review to download and share the report.</p>}
    <label className="block">Send to<input aria-label="Review recipient" type="email" value={recipient} onChange={event => { setRecipient(event.target.value); setDraft(null) }} disabled={busy} className="mt-1 w-full rounded border bg-white p-2 dark:bg-gray-800" /></label>
    <button type="button" disabled={!configured || !reviewer.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || busy} onClick={() => { setError(''); setDraft({ id: crypto.randomUUID(), recipient, reviewer, release, report: buildReport() }) }} className="rounded border px-3 py-2 disabled:opacity-50">Prepare email</button>
    {draft && <div className="space-y-2">
      <details open><summary>Review report before sending</summary><pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs">{draft.report}</pre></details>
      <button type="button" onClick={submit} disabled={busy} className="max-w-full break-all rounded bg-sky-600 px-3 py-2 text-white disabled:opacity-50">{busy ? 'Submitting…' : `Send report to ${draft.recipient}`}</button>
      <button type="button" onClick={() => setDraft(null)} disabled={busy} className="ml-2 px-2 py-2">Cancel email</button>
    </div>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {submissions.filter(value => value.release === release).map(value => <div key={value.id} className="space-y-1 border-t pt-2 break-words" role="status">
      <p>{value.status === 'accepted' ? 'Accepted by email provider' : value.status === 'unknown' ? 'Delivery not confirmed' : value.status} · {value.recipient} · {new Date(value.createdAt).toLocaleString()}</p>
      {value.error && <p>{value.error}</p>}
      <button type="button" onClick={() => download(value)} className="underline">Download submitted report</button>
    </div>)}
  </section>
}
