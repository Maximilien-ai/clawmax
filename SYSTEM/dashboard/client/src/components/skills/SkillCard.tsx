import { useState } from 'react'
import type { OpenClawSkill } from '../../types'

interface SkillCardProps {
  skill: OpenClawSkill
  assigned: boolean
  onToggle?: () => void
  compact?: boolean
}

export function SkillCard({ skill, assigned, onToggle, compact = false }: SkillCardProps) {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <div
      className={`
        border rounded-lg p-4 bg-white hover:shadow-md transition-shadow
        ${compact ? 'p-3' : 'p-4'}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {skill.emoji && (
              <span className="text-2xl flex-shrink-0">{skill.emoji}</span>
            )}
            <h3 className="font-semibold text-gray-900 truncate">
              {skill.name}
            </h3>
          </div>

          <p className="text-sm text-gray-600 line-clamp-2">
            {skill.description}
          </p>
        </div>

        {/* Action Button */}
        {onToggle && (
          <button
            onClick={onToggle}
            className={`
              px-3 py-1 rounded text-sm font-medium transition-colors flex-shrink-0
              ${assigned
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            {assigned ? '✓ Assigned' : 'Add'}
          </button>
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
                <div className="bg-gray-50 p-2 rounded">
                  <div className="font-medium text-gray-700 mb-1">
                    Requires:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {skill.requires.bins.map(bin => (
                      <code key={bin} className="px-2 py-0.5 bg-gray-200 text-gray-800 rounded text-xs">
                        {bin}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {/* Install Options */}
              {skill.install && skill.install.length > 0 && (
                <div className="bg-blue-50 p-2 rounded">
                  <div className="font-medium text-gray-700 mb-1">
                    Install:
                  </div>
                  {skill.install.map((option, i) => (
                    <div key={i} className="text-xs text-gray-600 font-mono">
                      {option.kind === 'brew' && `brew install ${option.formula}`}
                      {option.kind === 'apt' && `apt install ${option.package}`}
                      {option.kind === 'npm' && `npm install -g ${option.package}`}
                      {option.kind === 'go' && `go install ${option.module}`}
                    </div>
                  ))}
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
