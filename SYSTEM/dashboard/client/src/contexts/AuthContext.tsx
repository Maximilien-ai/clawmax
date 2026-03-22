import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface AuthUser {
  id: number
  login: string
  name: string | null
  avatar: string
}

interface AuthConfig {
  githubEnabled: boolean
  authDisabled: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  config: AuthConfig | null
  login: () => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<AuthConfig | null>(null)

  // Check auth config and current session on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/auth/config').then(r => r.ok ? r.json() : null),
      fetch('/api/auth/me').then(r => r.ok ? r.json() : null),
    ]).then(([cfg, me]) => {
      setConfig(cfg)
      if (me?.authenticated) {
        setUser(me.user)
      }
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [])

  const login = useCallback(() => {
    const returnTo = encodeURIComponent(window.location.origin)
    window.location.href = `/api/auth/github?return_to=${returnTo}`
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    window.location.reload()
  }, [])

  // Check URL for auth errors
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const authError = params.get('auth_error')
    if (authError) {
      console.error('[Auth] Error:', authError)
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, config, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
