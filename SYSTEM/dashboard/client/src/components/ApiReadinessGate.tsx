import React, { useEffect, useState } from 'react'
import { waitForApi } from '../lib/apiReadiness'

type Phase = 'checking' | 'connecting' | 'ready' | 'unavailable'

/** Mounts the app only once the Dashboard API answers, so the first requests of every page do
 * not fail while the API is still starting (for example right after SYSTEM/start.sh). */
export function ApiReadinessGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [run, setRun] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void waitForApi({
      signal: controller.signal,
      onRetry: () => setPhase(current => current === 'checking' ? 'connecting' : current),
    }).then(live => {
      if (!controller.signal.aborted) setPhase(live ? 'ready' : 'unavailable')
    })
    return () => controller.abort()
  }, [run])

  if (phase === 'ready') return <>{children}</>

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      {phase === 'unavailable' ? (
        <div role="alert" className="max-w-md text-center text-gray-700 dark:text-gray-200">
          <p className="font-medium">The Dashboard server is not responding.</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Check the terminal running SYSTEM/start.sh for startup errors, then try again.
          </p>
          <button
            type="button"
            onClick={() => { setPhase('connecting'); setRun(value => value + 1) }}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          >
            Try again
          </button>
        </div>
      ) : phase === 'connecting' ? (
        <div role="status" aria-live="polite" className="text-gray-500 dark:text-gray-400">
          Connecting to the Dashboard server... it is still starting.
        </div>
      ) : null}
    </div>
  )
}
