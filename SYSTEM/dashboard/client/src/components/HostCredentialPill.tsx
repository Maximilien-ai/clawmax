import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { maximilienHostAuthUrl, readMaximilienHostAuthMessage } from '../lib/maximilienHostAuth'

/** Built-in, trusted host adapters. Portable Skills may declare a credential
 * name, but cannot choose an executable, endpoint, or browser URL. */
const hostAdapters = {
  MAXIMILIEN_ACCESS_TOKEN: { label: 'Maximilien.ai', url: maximilienHostAuthUrl, readMessage: readMaximilienHostAuthMessage },
} as const

export default function HostCredentialPill({ credentialName }: { credentialName: string }) {
  const { config } = useAuth()
  const [state, setState] = React.useState<'required' | 'waiting' | 'signed-in' | 'not-owner'>('required')
  const [error, setError] = React.useState<string | null>(null)
  const opened = React.useRef<Window | null>(null)
  const instanceKey = config?.instanceKey || ''
  const adapter = hostAdapters[credentialName as keyof typeof hostAdapters]

  React.useEffect(() => {
    if (!adapter) return
    const onMessage = (event: MessageEvent) => {
      const status = adapter.readMessage(event, opened.current, instanceKey)
      if (!status) return
      opened.current = null
      setError(null)
      setState(status.reauthRequired || !status.signedIn ? 'required' : status.isOwner ? 'signed-in' : 'not-owner')
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [adapter, instanceKey])

  const start = () => {
    setError(null)
    if (!adapter) { setError(`No approved Mac sign-in flow is available for ${credentialName}.`); return }
    if (config?.deploymentKind !== 'onprem') { setError('Sign in from the Mac connected to this on-prem ClawMax instance.'); return }
    const url = adapter.url(instanceKey)
    if (!url) { setError('This instance has no valid Mac sign-in identity.'); return }
    const popup = window.open(url, `clawmax-host-auth-${credentialName}`, 'popup,width=540,height=700')
    if (!popup) { setError('Your browser blocked the Mac sign-in window. Allow pop-ups and retry.'); return }
    opened.current = popup
    setState('waiting')
    window.setTimeout(() => {
      if (opened.current === popup) {
        setState(current => current === 'waiting' ? 'required' : current)
        setError(current => current || 'No sign-in result yet. Finish in the Mac window, or check that the signed CLI and host bridge are installed, then retry.')
      }
    }, 30000)
  }

  return <div className="mt-2" data-testid="host-credential-pill">
    <button type="button" onClick={start} className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${state === 'signed-in' ? 'border-green-300 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
      {state === 'signed-in' ? `${adapter?.label || credentialName} signed in · staged` : state === 'not-owner' ? `${adapter?.label || credentialName} owner required · Retry` : state === 'waiting' ? 'Waiting for Mac sign-in…' : `${adapter?.label || credentialName} sign-in required`}
    </button>
    {error && <p role="alert" className="mt-1 max-w-sm text-xs text-red-700">{error}</p>}
  </div>
}
