import React from 'react'
import {
  summarizePluginRelationships,
  type PluginRelationship,
} from '../lib/pluginRelationships'

const RELATIONSHIP_TONES: Record<string, string> = {
  guardrail: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
  eval: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300',
  'optimization-plan': 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300',
}

function relationshipTone(objectKind: string): string {
  return RELATIONSHIP_TONES[objectKind]
    || 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300'
}

function formatStatus(status: string): string {
  return status.split('-').map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '').join(' ')
}

export function PluginRelationshipPills({
  relationships,
  maxVisible = 2,
  className = '',
}: {
  relationships: PluginRelationship[]
  maxVisible?: number
  className?: string
}) {
  if (relationships.length === 0) return null
  const { visible, overflowCount, title } = summarizePluginRelationships(relationships, maxVisible)

  return (
    <div
      className={`flex min-w-0 items-center gap-1 ${className}`}
      title={title}
      aria-label={`${relationships.length} active plugin relationship${relationships.length === 1 ? '' : 's'}`}
      data-testid="plugin-relationship-pills"
    >
      {visible.map((group) => (
        <span
          key={group.pluginId}
          className={`max-w-28 shrink truncate rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-tight ${relationshipTone(group.objectKind)}`}
        >
          {group.pluginName}{group.count > 1 ? ` ${group.count}` : ''}
        </span>
      ))}
      {overflowCount > 0 && (
        <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[9px] font-semibold leading-tight text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          +{overflowCount}
        </span>
      )}
    </div>
  )
}

export function PluginRelationshipDetails({ relationships }: { relationships: PluginRelationship[] }) {
  const headingId = React.useId()
  if (relationships.length === 0) return null

  return (
    <section
      className="min-w-0 max-w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-900/30"
      aria-labelledby={headingId}
      data-testid="plugin-relationship-details"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Plugin activity
        </h3>
        <span className="shrink-0 text-[11px] text-gray-400">
          {relationships.length} attached item{relationships.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {relationships.map((relationship) => (
          <article key={`${relationship.pluginId}:${relationship.itemId}`} className="min-w-0 max-w-full rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${relationshipTone(relationship.objectKind)}`}>
                    {relationship.pluginName}
                  </span>
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {formatStatus(relationship.status)}
                  </span>
                </div>
                <div className="mt-1.5 break-words text-sm font-medium text-gray-900 dark:text-gray-100">{relationship.name}</div>
              </div>
            </div>
            {relationship.summary && (
              <p className="mt-1 break-words [overflow-wrap:anywhere] text-xs leading-relaxed text-gray-500 dark:text-gray-400">{relationship.summary}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
