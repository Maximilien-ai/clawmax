import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createDocumentPdfSession, type PdfArtifact } from '../lib/documentPdfSession'

const buttonClass = 'rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800'

export function MarkdownDocumentViewer({ source, path, onDownloadMarkdown }: { source: string; path: string; onDownloadMarkdown: () => void }) {
  const [view, setView] = useState<'preview' | 'markdown' | 'pdf'>('preview')
  const [artifact, setArtifact] = useState<PdfArtifact | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const session = useRef<ReturnType<typeof createDocumentPdfSession> | null>(null)
  useEffect(() => {
    const current = createDocumentPdfSession(async () => {
      const { renderMarkdownPdf } = await import('../lib/markdownPdf')
      return renderMarkdownPdf(source, path)
    })
    session.current = current
    return () => { current.dispose(); session.current = null }
  }, [source, path])

  async function preparePdf(download = false) {
    const current = session.current
    if (!current) return
    setBusy(true); setError(null)
    try {
      const result = await current.get()
      if (!result || session.current !== current) return
      setArtifact(result)
      if (download) {
        const a = document.createElement('a')
        a.href = result.url
        a.download = (path.split('/').pop() || 'document.md').replace(/\.md$/i, '') + '.pdf'
        document.body.appendChild(a); a.click(); a.remove()
      }
    } catch {
      if (session.current === current) setError('PDF generation failed. Retry, or download the original Markdown.')
    } finally {
      if (session.current === current) setBusy(false)
    }
  }

  return <section aria-label="Markdown document viewer" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Document view" className="flex flex-wrap gap-1">
        {(['preview', 'markdown', 'pdf'] as const).map(mode => <button key={mode} className={`${buttonClass} ${view === mode ? 'bg-sky-100 font-semibold dark:bg-sky-950' : ''}`}
          aria-pressed={view === mode} onClick={() => { setView(mode); if (mode === 'pdf') void preparePdf() }}>
          {mode === 'pdf' ? 'PDF' : mode === 'preview' ? 'Preview' : 'Markdown'}
        </button>)}
      </div>
      <details className="relative">
        <summary className={`${buttonClass} cursor-pointer`}>Download</summary>
        <div className="absolute right-0 z-10 mt-1 flex w-44 flex-col gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <button className={buttonClass} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onDownloadMarkdown() }}>Markdown (.md)</button>
          <button className={buttonClass} disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void preparePdf(true) }}>PDF (.pdf)</button>
        </div>
      </details>
    </div>
    {busy && <p role="status" className="text-sm text-gray-600 dark:text-gray-300">Preparing PDF locally…</p>}
    {error && <div role="alert" className="rounded border border-red-300 p-3 text-sm text-red-700 dark:text-red-300">{error} <button className={buttonClass} onClick={() => void preparePdf()}>Retry PDF</button></div>}
    {artifact && artifact.warnings.length > 0 && <div role="status" className="rounded border border-amber-300 p-3 text-sm text-amber-800 dark:text-amber-200">{artifact.warnings.join(' ')}</div>}
    {view === 'preview' && <div className="prose max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim()}</ReactMarkdown></div>}
    {view === 'markdown' && <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-4 text-sm text-gray-800 dark:bg-gray-900 dark:text-gray-200">{source}</pre>}
    {view === 'pdf' && artifact && <div className="space-y-2">
      <p className="text-xs text-gray-600 dark:text-gray-300">Generated locally from the saved document. Preview unavailable? <a className="underline" href={artifact.url} download={(path.split('/').pop() || 'document.md').replace(/\.md$/i, '') + '.pdf'}>Download PDF</a></p>
      <iframe title={`PDF preview: ${path}`} src={`${artifact.url}#view=FitH&navpanes=0`} className="h-[65vh] min-h-64 w-full rounded border border-gray-300 bg-white" />
    </div>}
  </section>
}
