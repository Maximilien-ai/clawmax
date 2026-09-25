export interface MaximilienHostAuthStatus {
  apiVersion: 'clawmax.host-auth/v1'
  kind: 'AuthStatus'
  instanceKey: string
  signedIn: boolean
  reauthRequired: boolean
  isOwner: boolean
}

export const MAXIMILIEN_HOST_AUTH_ORIGIN = 'http://127.0.0.1:3203'

export function maximilienHostAuthUrl(instanceKey: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(instanceKey)) return null
  return `${MAXIMILIEN_HOST_AUTH_ORIGIN}/maximilien-auth?instanceKey=${encodeURIComponent(instanceKey)}`
}

export function readMaximilienHostAuthMessage(event: MessageEvent, openedWindow: Window | null, instanceKey: string): MaximilienHostAuthStatus | null {
  if (!openedWindow || event.source !== openedWindow || event.origin !== MAXIMILIEN_HOST_AUTH_ORIGIN) return null
  const value = event.data
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'apiVersion,instanceKey,isOwner,kind,reauthRequired,signedIn') return null
  if (value.apiVersion !== 'clawmax.host-auth/v1' || value.kind !== 'AuthStatus' || value.instanceKey !== instanceKey) return null
  if (typeof value.signedIn !== 'boolean' || typeof value.reauthRequired !== 'boolean' || typeof value.isOwner !== 'boolean') return null
  if (value.reauthRequired && value.signedIn) return null
  if (value.isOwner && !value.signedIn) return null
  return value as MaximilienHostAuthStatus
}
