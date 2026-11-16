const prefix = 'clawmax-host-credential-confirmation:'

export function hostCredentialStatusKey(instanceKey: string, credentialName: string): string | null {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(instanceKey) || !/^[A-Z][A-Z0-9_]{1,127}$/.test(credentialName)) return null
  return `${prefix}${instanceKey}:${credentialName}`
}

/** This is a display hint, never authentication or execution authority. */
export function readHostCredentialConfirmation(storage: Pick<Storage, 'getItem'>, instanceKey: string, credentialName: string): boolean {
  const key = hostCredentialStatusKey(instanceKey, credentialName)
  if (!key) return false
  try { return storage.getItem(key) === 'previously-signed-in' } catch { return false }
}

export function saveHostCredentialConfirmation(storage: Pick<Storage, 'setItem' | 'removeItem'>, instanceKey: string, credentialName: string, confirmed: boolean): void {
  const key = hostCredentialStatusKey(instanceKey, credentialName)
  if (!key) return
  try {
    if (confirmed) storage.setItem(key, 'previously-signed-in')
    else storage.removeItem(key)
  } catch { /* Storage can be blocked by browser privacy settings. */ }
}
