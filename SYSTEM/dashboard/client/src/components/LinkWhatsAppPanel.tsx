import { useEffect, useRef, useState } from 'react'

interface Props {
  agentId: string
  agentName: string
  isProfile?: boolean
  onClose: () => void
  onLinked: () => void
}

export default function LinkWhatsAppPanel({ agentId, agentName, isProfile, onClose, onLinked }: Props) {
  const [phone, setPhone] = useState('')
  const [pairing, setPairing] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [linked, setLinked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const phoneOk = /^\d{7,15}$/.test(phone)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  async function startPairing() {
    setPairing(true)
    setError(null)
    setLogs([])
    setPairingCode(null)

    try {
      const resp = await fetch(`/api/agents/${agentId}/whatsapp/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: 'Server error' }))
        setError(err.error ?? 'Server error')
        setPairing(false)
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.slice(6)) as { type: string; data: string }
            if (msg.type === 'log') {
              setLogs(l => [...l, msg.data])
            } else if (msg.type === 'code') {
              setPairingCode(msg.data)
            } else if (msg.type === 'linked') {
              setLinked(true)
            } else if (msg.type === 'done') {
              if (msg.data !== 'ok' && !linked) {
                setError(`Pairing ended: ${msg.data}`)
              }
              setPairing(false)
            } else if (msg.type === 'error') {
              setError(msg.data)
              setPairing(false)
            }
          } catch {}
        }
      }
    } catch (e) {
      setError(String(e))
      setPairing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Link WhatsApp</h2>
            <p className="text-xs text-gray-400 mt-0.5">Agent: <span className="font-mono">{agentName}</span></p>
          </div>
          <button
            onClick={onClose}
            disabled={pairing}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Non-profile mode warning */}
          {!isProfile && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <strong>Shared credentials warning:</strong> This agent is not in profile mode, so its WA credentials are shared with all other non-profile agents on this machine. Pairing here will overwrite any existing shared session — other non-profile agents will lose their WA connection immediately. Use profile mode for isolated accounts.
            </div>
          )}

          {/* Phone input (shown before pairing starts) */}
          {!pairing && !linked && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                WhatsApp number <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="14155551234"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none focus:border-sky-400 font-mono"
                onKeyDown={e => e.key === 'Enter' && phoneOk && !pairing && startPairing()}
              />
              <p className="mt-1 text-xs text-gray-400">
                Digits only, no + or spaces — e.g. <code>14155551234</code>
              </p>
            </div>
          )}

          {/* Pairing code callout */}
          {pairingCode && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-xs font-semibold text-green-700 mb-2">Enter this code on your phone:</p>
              <div className="text-3xl font-mono font-bold tracking-widest text-green-800 text-center py-2">
                {pairingCode}
              </div>
              <div className="mt-3 text-xs text-green-600 space-y-0.5">
                <p>1. Open WhatsApp on your phone</p>
                <p>2. Settings → Linked Devices → Link a Device</p>
                <p>3. Tap <strong>"Link with phone number instead"</strong></p>
                <p>4. Enter the code above</p>
              </div>
            </div>
          )}

          {/* Linked success */}
          {linked && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium flex items-center gap-2">
              <span>✅</span>
              <span>WhatsApp linked to <code>{agentName}</code>!</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {/* Log stream */}
          {(pairing || logs.length > 0) && (
            <div
              ref={logRef}
              className="bg-gray-900 text-green-400 font-mono text-xs rounded-lg p-3 h-40 overflow-y-auto whitespace-pre-wrap"
            >
              {logs.join('')}
              {pairing && <span className="animate-pulse">▌</span>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            disabled={pairing}
            className="text-sm px-4 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>

          {linked ? (
            <button
              onClick={() => { onLinked(); onClose() }}
              className="text-sm px-4 py-1.5 rounded bg-sky-600 text-white hover:bg-sky-700 font-medium transition-colors"
            >
              Done
            </button>
          ) : (
            <button
              onClick={startPairing}
              disabled={!phoneOk || pairing}
              className={`text-sm px-4 py-1.5 rounded font-medium transition-colors ${
                !phoneOk || pairing
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {pairing ? 'Pairing…' : 'Start Pairing'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
