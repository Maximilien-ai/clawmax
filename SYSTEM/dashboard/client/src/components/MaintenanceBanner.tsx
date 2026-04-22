import React from 'react'
import {
  formatMaintenanceWindow,
  getMaintenanceBannerTitle,
  type MaintenanceBannerConfig,
} from '../lib/maintenanceBannerView'

export function MaintenanceBanner({
  banner,
  onDismiss,
}: {
  banner: MaintenanceBannerConfig
  onDismiss?: () => void
}) {
  const windowLabel = formatMaintenanceWindow(banner)

  const tone = banner.level === 'critical'
    ? {
        wrap: 'border-red-300 bg-red-100 text-red-950 shadow-sm dark:border-red-900/70 dark:bg-red-950/70 dark:text-red-50',
        link: 'text-red-900 underline hover:text-red-950 dark:text-red-100 dark:hover:text-white',
        chip: 'bg-red-700 text-white dark:bg-red-500 dark:text-red-950',
      }
    : banner.level === 'warning'
      ? {
          wrap: 'border-amber-300 bg-amber-100 text-amber-950 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/70 dark:text-amber-50',
          link: 'text-amber-900 underline hover:text-amber-950 dark:text-amber-100 dark:hover:text-white',
          chip: 'bg-amber-600 text-white dark:bg-amber-400 dark:text-amber-950',
        }
      : {
          wrap: 'border-sky-300 bg-sky-100 text-sky-950 shadow-sm dark:border-sky-900/70 dark:bg-sky-950/70 dark:text-sky-50',
          link: 'text-sky-900 underline hover:text-sky-950 dark:text-sky-100 dark:hover:text-white',
          chip: 'bg-sky-700 text-white dark:bg-sky-400 dark:text-sky-950',
        }

  return (
    <div className={`border-y px-4 py-3 text-sm ${tone.wrap}`}>
      <div className="mx-auto flex max-w-6xl items-start gap-3">
        <span className={`mt-0.5 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.chip}`}>
          {banner.level}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="font-semibold">{getMaintenanceBannerTitle(banner.level)}</div>
            {windowLabel && (
              <div className="text-xs font-medium opacity-90">
                Window: {windowLabel}
              </div>
            )}
          </div>
          <div className="mt-1 whitespace-pre-wrap font-medium">{banner.text}</div>
          {banner.link && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-90">
              <a href={banner.link} target="_blank" rel="noreferrer" className={tone.link}>
                Status / details
              </a>
            </div>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-xs font-medium opacity-80 transition-opacity hover:opacity-100"
            title="Dismiss maintenance notice"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}

