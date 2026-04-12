import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface AuthUser {
  id: string
  login: string
  name: string | null
  avatar: string
  email?: string | null
  authType?: 'github' | 'otp'
}

interface AuthConfig {
  githubEnabled: boolean
  otpEnabled?: boolean
  authMode?: string
  authDisabled: boolean
  managedRuntime?: boolean
  ollamaEnabled?: boolean
  allowSystemKeysForUserExecution?: boolean
  systemKeyDefaults?: {
    openai: boolean
    anthropic: boolean
  }
  userKeyDefaults?: {
    openai: boolean
    anthropic: boolean
  }
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  config: AuthConfig | null
  login: () => void
  requestOtp: (email: string) => Promise<{ ok: boolean; error?: string; message?: string; devOtpFile?: string; retryAfterSeconds?: number; resendAvailableAt?: number }>
  verifyOtp: (email: string, code: string, rememberDevice: boolean) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<AuthConfig | null>(null)

  // Check auth config and current session on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/auth/config', { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : null),
      fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : null),
    ]).then(([cfg, me]) => {
      setConfig(cfg ?? { githubEnabled: false, authDisabled: false })
      if (me?.authenticated) {
        setUser(me.user)
      } else {
        setUser(null)
      }
      setLoading(false)
    }).catch(() => {
      setConfig({ githubEnabled: false, authDisabled: false })
      setUser(null)
      setLoading(false)
    })
  }, [])

  const login = useCallback(() => {
    const returnTo = encodeURIComponent(window.location.origin)
    window.location.href = `/api/auth/github?return_to=${returnTo}`
  }, [])

  const requestOtp = useCallback(async (email: string) => {
    const resp = await fetch('/api/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    })
    const data = await resp.json().catch(() => ({}))
    return {
      ok: resp.ok,
      error: data.error,
      message: data.message,
      devOtpFile: data.devOtpFile,
      retryAfterSeconds: data.retryAfterSeconds,
      resendAvailableAt: data.resendAvailableAt,
    }
  }, [])

  const verifyOtp = useCallback(async (email: string, code: string, rememberDevice: boolean) => {
    const resp = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, code, rememberDevice }),
    })
    const data = await resp.json().catch(() => ({}))
    if (resp.ok && data.user) {
      setUser(data.user)
    }
    return { ok: resp.ok, error: data.error }
  }, [])

  const logout = useCallback(() => {
    setLoading(true)
    setUser(null)
    const returnTo = encodeURIComponent(window.location.origin)
    window.location.replace(`/api/auth/logout?return_to=${returnTo}`)
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
    <AuthContext.Provider value={{ user, loading, config, login, requestOtp, verifyOtp, logout }}>
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
