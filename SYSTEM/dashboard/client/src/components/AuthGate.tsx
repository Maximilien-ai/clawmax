import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import Login from '../pages/Login'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, config, bootstrapError } = useAuth()

  if (bootstrapError) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 dark:bg-gray-900">
      <div className="max-w-md space-y-4 text-center text-gray-700 dark:text-gray-200">
        <p role="alert">{bootstrapError}</p>
        <button onClick={() => window.location.reload()} className="rounded bg-sky-600 px-4 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500">Retry connection</button>
      </div>
    </div>
  )

  if (loading || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Checking session...</div>
      </div>
    )
  }

  if (config.authDisabled) return <>{children}</>
  if (!user) return <Login />
  return <>{children}</>
}
