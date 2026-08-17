import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import Login from '../pages/Login'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, config } = useAuth()

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
