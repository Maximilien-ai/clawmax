export type MaintenanceBannerConfig = {
  enabled: boolean
  text: string
  level: 'info' | 'warning' | 'critical'
  startAt?: string
  endAt?: string
  link?: string
  dismissible: boolean
}

export function formatMaintenanceWindow(
  banner: Pick<MaintenanceBannerConfig, 'startAt' | 'endAt'>,
  formatDate: (value: string) => string = (value) => new Date(value).toLocaleString(),
) {
  const startLabel = banner.startAt ? formatDate(banner.startAt) : null
  const endLabel = banner.endAt ? formatDate(banner.endAt) : null

  if (startLabel && endLabel) return `${startLabel} to ${endLabel}`
  if (startLabel) return `Starts ${startLabel}`
  if (endLabel) return `Until ${endLabel}`
  return null
}

export function getMaintenanceBannerTitle(level: MaintenanceBannerConfig['level']) {
  if (level === 'critical') return 'Critical Maintenance'
  if (level === 'warning') return 'Planned Maintenance'
  return 'Maintenance Notice'
}

export function getVisibleMaintenanceBanner(
  banner: MaintenanceBannerConfig | null | undefined,
  dismissedKey: string | null,
  bannerKey: string | null,
) {
  if (!banner || !bannerKey) return null
  if (banner.dismissible && dismissedKey === bannerKey) return null
  return banner
}
