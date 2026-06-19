export function buildWhatsAppPairingDoneError(status: string, didLink: boolean): string | null {
  if (didLink || status === 'ok') return null
  const trimmed = String(status || '').trim()
  return `Pairing ended: ${trimmed || 'unknown status'}`
}
