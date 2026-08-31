import { useEffect, useMemo, useState } from 'react'
import {
  agentChannelStatusLabel,
  parseTelegramOwnerIds,
  validateTelegramOwnerIds,
  type AgentChannelView,
} from '../lib/agentChannels'

type Props = {
  agentId: string
  agentName: string
  isProfile: boolean
  whatsapp: string | null
  onClose: () => void
  onManageWhatsApp: () => void
  onChanged: () => void
}

type ChannelsResponse = {
  agentId: string
  isProfile: boolean
  channels: AgentChannelView[]
}

export default function AgentChannelsPanel({
  agentId,
  agentName,
  isProfile,
  whatsapp,
  onClose,
  onManageWhatsApp,
  onChanged,
}: Props) {
  const [data, setData] = useState<ChannelsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [token, setToken] = useState('')
  const [ownerIds, setOwnerIds] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const telegram = useMemo(
    () => data?.channels.find(channel => channel.id === 'telegram') || null,
    [data],
  )
  const telegramHealthy = Boolean(telegram?.configured && telegram.enabled && telegram.bound)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/channels`)
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not load agent channels.')
      setData(body)
      const currentTelegram = body.channels?.find((channel: AgentChannelView) => channel.id === 'telegram')
      setOwnerIds(Array.isArray(currentTelegram?.allowFrom) ? currentTelegram.allowFrom.join(', ') : '')
    } catch (loadError: any) {
      setError(loadError.message || 'Could not load agent channels.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [agentId])

  async function connectTelegram() {
    const ownerError = validateTelegramOwnerIds(ownerIds)
    if (ownerError) {
      setError(ownerError)
      return
    }
    if (!token.trim()) {
      setError(telegram?.configured ? 'Enter the replacement BotFather token to update this connection.' : 'Enter the BotFather token.')
      return
    }

    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/channels/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), allowFrom: parseTelegramOwnerIds(ownerIds) }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not connect Telegram.')
      setToken('')
      setNotice('Telegram is connected and bound to this agent.')
      setConfirmDisconnect(false)
      await load()
      onChanged()
    } catch (connectError: any) {
      setError(connectError.message || 'Could not connect Telegram.')
    } finally {
      setSaving(false)
    }
  }

  async function disconnectTelegram() {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/channels/telegram`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not disconnect Telegram.')
      setToken('')
      setOwnerIds('')
      setConfirmDisconnect(false)
      setNotice('Telegram was unbound and its named account was removed.')
      await load()
      onChanged()
    } catch (disconnectError: any) {
      setError(disconnectError.message || 'Could not disconnect Telegram.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="agent-channels-title">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="flex shrink-0 items-start justify-between border-b border-gray-100 px-4 py-4 dark:border-gray-700 sm:px-6">
          <div>
            <h2 id="agent-channels-title" className="text-base font-semibold text-gray-800 dark:text-gray-100">Agent channels</h2>
            <p className="mt-0.5 text-xs text-gray-500">Connect messaging providers to <span className="font-mono">{agentName}</span>.</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-xl leading-none text-gray-400 hover:text-gray-600" aria-label="Close agent channels">×</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {!isProfile && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <strong>Shared runtime configuration:</strong> this non-profile agent uses the shared OpenClaw state. ClawMax still creates a named account and an explicit agent binding, but profile mode provides stronger account isolation.
            </div>
          )}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300" role="alert">{error}</div>}
          {notice && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">{notice}</div>}

          {loading ? (
            <div className="py-10 text-center text-sm text-gray-500">Loading channel connections…</div>
          ) : (
            <>
              <section className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 dark:border-sky-800 dark:bg-sky-950/20">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="text-lg">✈️</span>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">Telegram</h3>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{telegram ? agentChannelStatusLabel(telegram) : 'Not connected'}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${telegramHealthy ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                    {telegramHealthy ? 'Bound' : telegram?.bound ? 'Needs repair' : 'Available'}
                  </span>
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">BotFather token {telegram?.configured ? '(enter only to replace)' : ''}</span>
                    <input
                      type="password"
                      autoComplete="off"
                      value={token}
                      onChange={event => setToken(event.target.value)}
                      placeholder={telegram?.configured ? 'Stored securely by OpenClaw' : '123456789:AA…'}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Allowed Telegram user IDs <span className="font-normal text-gray-400">(optional)</span></span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={ownerIds}
                      onChange={event => setOwnerIds(event.target.value)}
                      placeholder="123456789, 987654321"
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900"
                    />
                    <span className="mt-1 block text-xs text-gray-500">With no IDs, Telegram uses pairing mode. Adding IDs switches direct messages to an explicit allowlist.</span>
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button onClick={connectTelegram} disabled={saving} className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
                    {saving ? 'Saving…' : telegram?.configured ? 'Replace token and reconnect' : 'Connect Telegram'}
                  </button>
                  {telegram?.configured && !confirmDisconnect && (
                    <button onClick={() => setConfirmDisconnect(true)} disabled={saving} className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30">Disconnect</button>
                  )}
                  {telegram?.configured && confirmDisconnect && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2 dark:border-red-800 dark:bg-red-950/30">
                      <span className="text-xs text-red-700 dark:text-red-300">Remove this binding and named account?</span>
                      <button onClick={disconnectTelegram} disabled={saving} className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white">Yes, disconnect</button>
                      <button onClick={() => setConfirmDisconnect(false)} disabled={saving} className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300">Cancel</button>
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">WhatsApp</h3>
                    <p className="mt-1 text-xs text-gray-500">{whatsapp ? `Connected to +${whatsapp}` : 'Not connected'}</p>
                  </div>
                  <button onClick={onManageWhatsApp} disabled={saving} className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700">
                    {whatsapp ? 'Reconnect WhatsApp' : 'Connect WhatsApp'}
                  </button>
                </div>
              </section>

              {data?.channels.filter(channel => channel.releaseState === 'planned').map(channel => (
                <section key={channel.id} className="rounded-xl border border-dashed border-gray-200 p-4 opacity-75 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-800 dark:text-gray-200">{channel.label}</h3>
                      <p className="mt-1 text-xs text-gray-500">Planned for the next channel release.</p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-300">Coming next</span>
                  </div>
                </section>
              ))}
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-gray-100 px-4 py-3 dark:border-gray-700 sm:px-6">
          <button onClick={onClose} disabled={saving} className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700">Close</button>
        </div>
      </div>
    </div>
  )
}
