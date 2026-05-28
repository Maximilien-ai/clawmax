export function beginSingleFlight(flagRef: { current: boolean }): boolean {
  if (flagRef.current) return false
  flagRef.current = true
  return true
}

export function endSingleFlight(flagRef: { current: boolean }): void {
  flagRef.current = false
}
