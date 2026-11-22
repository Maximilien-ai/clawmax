import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import { loadAuthBootstrap, shouldTriggerSessionExpired } from '../lib/authBootstrap'
import { getByokStorageKey } from '../lib/byok'
import { getDashboardAuthReturnTo } from '../lib/dashboardAuth'

export interface AuthUser {
  id: string
  login: string
  name: string | null
  avatar: string
  email?: string | null
  authType?: 'github' | 'otp'
}

type DashboardDeploymentKind = 'local' | 'onprem' | 'cloud'

interface AuthConfig {
  githubEnabled: boolean
  otpEnabled?: boolean
  authMode?: string
  authDisabled: boolean
  deploymentKind?: DashboardDeploymentKind
  instanceLabel?: string | null
  resourceLimits?: {
    workspaces: number | null
    agents: number | null
    workflows: number | null
  }
  insecureLocalCookies?: boolean
  managedRuntime?: boolean
  ollamaEnabled?: boolean
  defaultOllamaBaseUrl?: string
  defaultOpenAiCompatibleBaseUrl?: string
  workspaceOpenAiCompatibleBaseUrl?: string
  workspaceOpenAiCompatibleDefaultModel?: string
  allowSystemKeysForUserExecution?: boolean
  opikRuntimeConfigured?: boolean
  resendRuntimeConfigured?: boolean
  cogneeRuntimeConfigured?: boolean
  systemKeyDefaults?: {
    openai: boolean
    anthropic: boolean
    gemini?: boolean
    openrouter?: boolean
    xai?: boolean
    openaiCompatible?: boolean
  }
  userKeyDefaults?: {
    openai: boolean
    anthropic: boolean
    gemini?: boolean
    openrouter?: boolean
    xai?: boolean
    openaiCompatible?: boolean
  }
  preferredModel?: string
  recommendedModel?: string
  costEfficientModel?: string
  instanceKey?: string | null
  hostAuthBridgeReady?: boolean
  machineId?: string | null
  machineName?: string | null
  templateRegistryWriteEnabled?: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  config: AuthConfig | null
  sessionExpired: boolean
  bootstrapError: string | null
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  const activeSession = useRef<AuthUser | null>(null)
  const updateSession = useCallback((next: AuthUser | null) => {
    activeSession.current = next
    setUser(next)
  }, [])

  const handleUnauthorized = useCallback(() => {
    if (!activeSession.current) return
    updateSession(null)
    setSessionExpired(true)
    setLoading(false)
  }, [updateSession])

  // Check auth config and current session on mount
  useEffect(() => {
    let cancelled = false

    const controller = new AbortController()
    const load = async () => {
      try {
        const { config: cfgResp, me: meResp } = await loadAuthBootstrap(controller.signal)
        const cfg = cfgResp.ok ? await cfgResp.json() : null
        const me = meResp.ok ? await meResp.json() : null
        if (cancelled) return

        setConfig(cfg ?? { githubEnabled: false, authDisabled: false })
        if (me?.authenticated) {
          updateSession(me.user)
          setSessionExpired(false)
        } else {
          updateSession(null)
        }
        setLoading(false)
      } catch {
        if (cancelled) return
        setBootstrapError("Cannot reach the session service. Check that the Dashboard API is running, then retry.")
        updateSession(null)
        setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  useEffect(() => {
    let pending: AbortController | undefined
    const refresh = () => {
      // Local removal must rerender readiness even if the config request fails.
      setConfig(current => current ? { ...current } : current)
      pending?.abort()
      const controller = new AbortController()
      pending = controller
      fetch('/api/auth/config', { signal: controller.signal })
        .then(response => response.ok ? response.json() : Promise.reject(new Error('Config refresh failed')))
        .then(next => { if (!controller.signal.aborted) setConfig(next) })
        .catch(() => { /* Existing bootstrap/session handling owns availability errors. */ })
    }
    const onStorage = (event: StorageEvent) => { if (!event.key || event.key === getByokStorageKey()) refresh() }
    window.addEventListener('integrations-saved', refresh)
    window.addEventListener('clawmax-browser-vault-updated', refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      pending?.abort()
      window.removeEventListener('integrations-saved', refresh)
      window.removeEventListener('clawmax-browser-vault-updated', refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('clawmax-session-expired', handleUnauthorized)
    return () => window.removeEventListener('clawmax-session-expired', handleUnauthorized)
  }, [handleUnauthorized])

  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const session = activeSession.current
      const response = await originalFetch(input, init)
      if (shouldTriggerSessionExpired(input, response, window.location.origin, session, activeSession.current)) {
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
    const returnTo = encodeURIComponent(getDashboardAuthReturnTo(window.location))
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
      updateSession(data.user)
      setSessionExpired(false)
    }
    return { ok: resp.ok, error: data.error }
  }, [])

  const logout = useCallback(() => {
    setLoading(true)
    updateSession(null)
    setSessionExpired(false)
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
    <AuthContext.Provider value={{ user, loading, config, sessionExpired, bootstrapError, login, requestOtp, verifyOtp, logout, handleUnauthorized }}>
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
