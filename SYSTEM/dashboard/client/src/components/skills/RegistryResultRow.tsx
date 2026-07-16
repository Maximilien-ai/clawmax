export interface RegistryResultSkill {
  full_name?: string
  name?: string
  description?: string
  latest_version?: string
  downloads_weekly?: number
  categories?: string[]
}

export function RegistryResultRow({
  skill,
  installName,
  providerLabel,
  showProvider,
  isInstalled,
  isInstalling,
  installDisabled,
  onInstall,
}: {
  skill: RegistryResultSkill
  installName: string
  providerLabel: string
  showProvider: boolean
  isInstalled: boolean
  isInstalling: boolean
  installDisabled: boolean
  onInstall: () => void
}) {
  return (
    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <div className="min-w-0">
        <div className="break-words font-medium text-sm text-gray-900 dark:text-gray-100">{skill.full_name || installName}</div>
        {showProvider && (
          <div className="text-[10px] font-medium uppercase text-purple-500 dark:text-purple-300">{providerLabel}</div>
        )}
        {skill.name && skill.full_name && skill.name !== skill.full_name && (
          <div className="break-words text-[11px] text-gray-400 dark:text-gray-500">{skill.name}</div>
        )}
        {skill.description && <div className="break-words text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{skill.description.split('\n')[0]}</div>}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-gray-400">
          {skill.latest_version && <span>v{skill.latest_version}</span>}
          {skill.downloads_weekly != null && <span>{skill.downloads_weekly}/week</span>}
          {skill.categories?.length ? <span>{skill.categories.join(', ')}</span> : null}
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        {isInstalled ? (
          <span className="px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded-md">
            Installed
          </span>
        ) : (
          <button
            type="button"
            onClick={onInstall}
            disabled={installDisabled}
            className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            {isInstalling ? 'Installing...' : 'Install'}
          </button>
        )}
      </div>
    </div>
  )
}
