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
  defaultOllamaBaseUrl?: string
  allowSystemKeysForUserExecution?: boolean
  systemKeyDefaults?: {
    openai: boolean
    anthropic: boolean
    gemini?: boolean
  }
  userKeyDefaults?: {
    openai: boolean
    anthropic: boolean
    gemini?: boolean
  }
  preferredModel?: string
  recommendedModel?: string
  costEfficientModel?: string
  instanceKey?: string | null
  machineId?: string | null
  machineName?: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  config: AuthConfig | null
  sessionExpired: boolean
  login: () => void
  requestOtp: (email: string) => Promise<{ ok: boolean; error?: string; message?: string; devOtpFile?: string; retryAfterSeconds?: number; resendAvailableAt?: number }>
  verifyOtp: (email: string, code: string, rememberDevice: boolean) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  handleUnauthorized: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function notifySessionExpired() {
  window.dispatchEvent(new CustomEvent('clawmax-session-expired'))
}

function shouldTriggerSessionExpired(input: RequestInfo | URL, response: Response): boolean {
  if (response.status !== 401) return false

  let urlString = ''
  if (typeof input === 'string') urlString = input
  else if (input instanceof URL) urlString = input.toString()
  else if (typeof Request !== 'undefined' && input instanceof Request) urlString = input.url

  const resolved = urlString
    ? new URL(urlString, window.location.origin)
    : null

  if (!resolved) return false
  if (resolved.origin !== window.location.origin) return false
  if (!resolved.pathname.startsWith('/api/')) return false
  if (resolved.pathname.startsWith('/api/auth/')) return false

  return true
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)

  // Check auth config and current session on mount
  useEffect(() => {
    let cancelled = false

    const load = async (attempt = 0) => {
      try {
        const [cfgResp, meResp] = await Promise.all([
          fetch('/api/auth/config', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }),
        ])

        const shouldRetry = cfgResp.status === 429 || meResp.status === 429
        if (shouldRetry) {
          if (cancelled) return
          const retryDelayMs = Math.min(5000, 1000 * (attempt + 1))
          window.setTimeout(() => { void load(attempt + 1) }, retryDelayMs)
          return
        }

        const cfg = cfgResp.ok ? await cfgResp.json() : null
        const me = meResp.ok ? await meResp.json() : null
        if (cancelled) return

        setConfig(cfg ?? { githubEnabled: false, authDisabled: false })
        if (me?.authenticated) {
          setUser(me.user)
          setSessionExpired(false)
        } else {
          setUser(null)
        }
        setLoading(false)
      } catch {
        if (cancelled) return
        setConfig({ githubEnabled: false, authDisabled: false })
        setUser(null)
        setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onSessionExpired = () => {
      setUser(null)
      setSessionExpired(true)
      setLoading(false)
    }
    window.addEventListener('clawmax-session-expired', onSessionExpired as EventListener)
    return () => window.removeEventListener('clawmax-session-expired', onSessionExpired as EventListener)
  }, [])

  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(input, init)
      if (shouldTriggerSessionExpired(input, response)) {
        notifySessionExpired()
      }
      return response
    }
    return () => {
      window.fetch = originalFetch
    }
  }, [])

  const login = useCallback(() => {
    setSessionExpired(false)
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
      setSessionExpired(false)
    }
    return { ok: resp.ok, error: data.error }
  }, [])

  const logout = useCallback(() => {
    setLoading(true)
    setUser(null)
    setSessionExpired(false)
    const returnTo = encodeURIComponent(window.location.origin)
    window.location.replace(`/api/auth/logout?return_to=${returnTo}`)
  }, [])

  const handleUnauthorized = useCallback(() => {
    setUser(null)
    setSessionExpired(true)
    setLoading(false)
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
    <AuthContext.Provider value={{ user, loading, config, sessionExpired, login, requestOtp, verifyOtp, logout, handleUnauthorized }}>
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
