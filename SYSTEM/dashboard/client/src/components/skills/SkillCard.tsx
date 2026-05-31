import { useState } from 'react'
import type { OpenClawSkill } from '../../types'
import type { SkillSetupHint } from '../../lib/skillSetup'
import { ProductIconCell, resolveSkillVisual } from '../../lib/productIcons'

interface SkillCardProps {
  skill: OpenClawSkill
  assigned: boolean
  onToggle?: () => void
  onView?: () => void
  onDelete?: () => void
  canDelete?: boolean
  compact?: boolean
  usageCount?: number
  usedBy?: string[]
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: () => void
  onInstallRequirements?: () => void
  installingRequirements?: boolean
  setupHint?: SkillSetupHint | null
  onOpenSetup?: () => void
}

function getSourceBadgeLabel(skill: OpenClawSkill): string {
  if (skill.variantOf) return 'Workspace Copy'
  if (skill.source === 'workspace') return 'Workspace'
  if (skill.source === 'managed') return 'Managed'
  return 'Built-in'
}

function getRegistryBadgeLabel(skill: OpenClawSkill): string | null {
  if (skill.registryProvider === 'clawhub') return 'ClawHub'
  if (skill.registryProvider === 'tessl') return 'Tessl'
  if (skill.registryProvider === 'shipables') return 'Shipables'
  return null
}

export function SkillCard({ skill, assigned, onToggle, onView, onDelete, canDelete = false, compact = false, usageCount, usedBy, selectionMode = false, isSelected = false, onToggleSelect, onInstallRequirements, installingRequirements = false, setupHint = null, onOpenSetup }: SkillCardProps) {
  const [showDetails, setShowDetails] = useState(false)
  const installSatisfied = !!skill.requirementStatus?.checkable && skill.requirementStatus.installSatisfied
  const skillVisual = resolveSkillVisual(skill)

  return (
    <div
      className={`
        relative border dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow
        ${isSelected ? 'ring-2 ring-blue-100 border-blue-400 dark:ring-blue-900/40 dark:border-blue-500' : ''}
        ${compact ? 'p-3' : 'p-4'}
      `}
    >
      {selectionMode && onToggleSelect && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          className={`absolute top-3 right-3 h-7 min-w-7 px-1.5 rounded border text-sm font-semibold leading-none transition-colors ${
            isSelected
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:border-blue-500 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-400 dark:hover:text-blue-300'
          }`}
          title={isSelected ? `Deselect ${skill.name}` : `Select ${skill.name}`}
        >
          {isSelected ? '✓' : '□'}
        </button>
      )}
      {/* Header */}
      <div className={`space-y-3 ${selectionMode ? 'pr-10' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1">
            <ProductIconCell iconName={skillVisual.iconName} emoji={skillVisual.emoji} label={skill.name} size="sm" className="flex-shrink-0" />
            <h3 className="min-w-0 flex-1 text-base font-semibold leading-tight text-gray-900 break-words dark:text-gray-100">
              {skill.name}
            </h3>
          </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <div className="flex items-center gap-1">
              {onView && (
                <button
                  onClick={onView}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title={`View ${skill.name} skill.md`}
                  aria-label={`View ${skill.name} skill.md`}
                >
                  <ProductIconCell iconName="docs" label={`View ${skill.name} skill.md`} size="sm" className="border-transparent bg-transparent text-current h-5 w-5" />
                </button>
              )}
              {!selectionMode && canDelete && onDelete && (
                <button
                  onClick={onDelete}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:text-gray-500 dark:hover:text-red-300 dark:hover:bg-red-900/30 transition-colors"
                  title={`Delete ${skill.name}`}
                  aria-label={`Delete ${skill.name}`}
                >
                  <ProductIconCell iconName="delete" label={`Delete ${skill.name}`} size="sm" className="border-transparent bg-transparent text-current h-5 w-5" />
                </button>
              )}
            </div>
            {onToggle && (
              <button
                onClick={onToggle}
                className={`
                  px-3 py-1 rounded text-sm font-medium transition-colors
                  ${assigned
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                  }
                `}
              >
                {assigned ? '✓ Assigned' : 'Add'}
              </button>
            )}
          </div>
        </div>

        <div className="mb-1.5 flex flex-wrap gap-1.5">
          <span className="whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
            {getSourceBadgeLabel(skill)}
          </span>
          {getRegistryBadgeLabel(skill) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              {getRegistryBadgeLabel(skill)}
            </span>
          )}
          {skill.dirty && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              DIRTY
            </span>
          )}
          {setupHint && (
            <span className="whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              {setupHint.label}
            </span>
          )}
        </div>

        <p className="text-sm text-gray-600 line-clamp-2 dark:text-gray-300">
          {skill.description}
        </p>

        {/* Tags */}
        {skill.tags && skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {skill.tags.map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-700">{tag}</span>
            ))}
          </div>
        )}

        {/* Usage information */}
        {usageCount !== undefined && usageCount > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            Used by {usageCount} agent{usageCount !== 1 ? 's' : ''}
            {usedBy && usedBy.length > 0 && usedBy.length <= 3 && (
              <span className="text-gray-400"> ({usedBy.join(', ')})</span>
            )}
          </p>
        )}

        {(skill.registryName || skill.registryVersion || typeof skill.registryDownloadsWeekly === 'number') && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400 dark:text-gray-500">
            {skill.registryName && <span>{skill.registryName}</span>}
            {skill.registryVersion && <span>v{skill.registryVersion}</span>}
            {typeof skill.registryDownloadsWeekly === 'number' && <span>{skill.registryDownloadsWeekly}/week</span>}
          </div>
        )}
      </div>

      {/* Requirements & Install (expandable) */}
      {!compact && (skill.requires || skill.install) && (
        <div className="mt-3">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <span>{showDetails ? '▼' : '▶'}</span>
            <span>
              {showDetails ? 'Hide' : 'Show'} details
            </span>
          </button>

          {showDetails && (
            <div className="mt-2 space-y-2 text-sm">
              {/* Requirements */}
              {skill.requires?.bins && skill.requires.bins.length > 0 && (
                <div className="bg-gray-50 p-2 rounded dark:bg-gray-900">
                  <div className="font-medium text-gray-700 mb-1 dark:text-gray-300">
                    Requires:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {skill.requires.bins.map(bin => (
                      <code key={bin} className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs">
                        {bin}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {/* Install Options */}
              {skill.install && skill.install.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded">
                  <div className="font-medium text-gray-700 mb-1 dark:text-gray-300">
                    {installSatisfied ? 'Requirements installed:' : 'Install:'}
                  </div>
                  {skill.install.map((option, i) => (
                    <div key={i} className="text-xs text-gray-600 dark:text-gray-300 font-mono">
                      {option.kind === 'brew' && `brew install ${option.formula}`}
                      {option.kind === 'apt' && `apt install ${option.package}`}
                      {option.kind === 'npm' && `npm install -g ${option.package}`}
                      {option.kind === 'node' && `npm install -g ${option.package}`}
                      {option.kind === 'pnpm' && `pnpm add -g ${option.package}`}
                      {option.kind === 'go' && `go install ${option.module || option.package}`}
                      {option.kind === 'uv' && `uv tool install ${option.package}`}
                      {!['brew', 'apt', 'npm', 'node', 'pnpm', 'go', 'uv'].includes(option.kind) && option.label}
                    </div>
                  ))}
                  {installSatisfied ? (
                    <div className="mt-2 inline-flex items-center rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                      <span className="inline-flex items-center gap-2">
                        <ProductIconCell iconName="status" label="Requirements installed" size="sm" className="border-transparent bg-transparent text-current h-5 w-5" />
                        Requirements installed
                      </span>
                    </div>
                  ) : onInstallRequirements ? (
                    <button
                      onClick={onInstallRequirements}
                      disabled={installingRequirements}
                      className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700"
                    >
                      {installingRequirements ? 'Installing...' : 'Install Requirements'}
                    </button>
                  ) : null}
                </div>
              )}

              {setupHint && (
                <div className="bg-amber-50 dark:bg-amber-900/20 p-2 rounded border border-amber-200 dark:border-amber-800">
                  <div className="font-medium text-amber-900 mb-1 dark:text-amber-200">
                    {setupHint.label}
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    {setupHint.message}
                  </div>
                  {setupHint.commands && setupHint.commands.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {setupHint.commands.map((command) => (
                        <div key={command} className="text-xs text-amber-800 dark:text-amber-200 font-mono break-all">
                          {command}
                        </div>
                      ))}
                    </div>
                  )}
                  {onOpenSetup && (
                    <button
                      onClick={onOpenSetup}
                      className="mt-3 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                    >
                      {setupHint.actionLabel || 'Complete Setup'}
                    </button>
                  )}
                </div>
              )}

              {(skill.registryCategories?.length || skill.registryHomepage) && (
                <div className="bg-purple-50 dark:bg-purple-900/20 p-2 rounded border border-purple-200 dark:border-purple-800">
                  <div className="font-medium text-purple-900 mb-1 dark:text-purple-200">
                    Registry metadata
                  </div>
                  {skill.registryCategories && skill.registryCategories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {skill.registryCategories.map((category) => (
                        <span key={category} className="text-[10px] px-1.5 py-0.5 rounded border border-purple-200 bg-white text-purple-700 dark:border-purple-700 dark:bg-purple-950/30 dark:text-purple-300">
                          {category}
                        </span>
                      ))}
                    </div>
                  )}
                  {skill.registryHomepage && (
                    <a
                      href={skill.registryHomepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-xs text-purple-700 hover:underline dark:text-purple-300"
                    >
                      Visit registry page →
                    </a>
                  )}
                </div>
              )}

              {/* Homepage */}
              {skill.homepage && (
                <a
                  href={skill.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-xs"
                >
                  Learn more →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Compact mode - just show if assigned */}
      {compact && assigned && (
        <div className="mt-2">
          {onToggle && (
            <button
              onClick={onToggle}
              className="text-red-600 hover:text-red-800 text-sm"
              title="Remove skill"
            >
              × Remove
            </button>
          )}
        </div>
      )}
    </div>
  )
}
