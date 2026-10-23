export function compactDashboardVersion(version?: string | null): string {
  if (!version) return '…'
  return /^v?(\d+\.\d+)/.exec(version)?.[1] || version
}
