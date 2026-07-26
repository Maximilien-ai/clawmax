import React, { useEffect, useMemo, useState } from 'react'
import {
  recordPromptQualityFeedback,
  scorePromptQuality,
  type PromptQualityDomain,
} from '../lib/promptQuality'

interface PromptQualityPanelProps {
  prompt: string
  domain?: PromptQualityDomain
  compact?: boolean
}

export default function PromptQualityPanel({
  prompt,
  domain = 'general',
  compact = false,
}: PromptQualityPanelProps) {
  const quality = useMemo(() => scorePromptQuality(prompt, domain), [prompt, domain])
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  useEffect(() => setFeedback(null), [domain, quality.score])
  const tone = quality.score >= 80
    ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/20'
    : quality.score >= 60
      ? 'border-amber-200 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/20'
      : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/60'
  const bar = quality.score >= 80 ? 'bg-emerald-500' : quality.score >= 60 ? 'bg-amber-500' : 'bg-sky-500'

  const rate = (rating: 'up' | 'down') => {
    setFeedback(rating)
    recordPromptQualityFeedback({
      domain,
      score: quality.score,
      suggestionIds: quality.suggestions.map((suggestion) => suggestion.id),
      rating,
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <div className={`rounded-md border ${tone} ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`} data-testid="prompt-quality-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Prompt readiness</span>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{quality.level}</span>
        </div>
        <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{quality.score}/100</div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80 dark:bg-gray-800" aria-label={`Prompt readiness ${quality.score} out of 100`}>
        <div className={`h-full rounded-full transition-[width] duration-200 ${bar}`} style={{ width: `${quality.score}%` }} />
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {quality.facets.map((facet) => (
            <span
              key={facet.id}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                facet.earned === facet.max
                  ? 'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-800 dark:bg-gray-900 dark:text-emerald-300'
                  : 'border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400'
              }`}
            >
              {facet.label} {facet.earned}/{facet.max}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
        <div className="min-w-0 text-xs text-gray-600 dark:text-gray-300">
          {quality.suggestions.length > 0 ? (
            <>
              <span className="font-medium">Improve next:</span>{' '}
              {quality.suggestions.map((suggestion) => suggestion.suggestion).join(' ')}
            </>
          ) : (
            'This prompt covers the baseline criteria. You can generate now or keep refining.'
          )}
        </div>
        {!compact && (
          <div className="flex shrink-0 flex-wrap items-center gap-1" aria-label="Rate this scoring guidance">
            <button
              type="button"
              onClick={() => rate('up')}
              aria-label="Scoring guidance was helpful"
              title="Helpful guidance"
              className={`rounded border px-2 py-1 text-xs ${feedback === 'up' ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-gray-200 bg-white text-gray-500 hover:text-emerald-600 dark:border-gray-700 dark:bg-gray-900'}`}
            >
              Helpful
            </button>
            <button
              type="button"
              onClick={() => rate('down')}
              aria-label="Scoring guidance was not helpful"
              title="Not helpful guidance"
              className={`rounded border px-2 py-1 text-xs ${feedback === 'down' ? 'border-red-400 bg-red-100 text-red-700' : 'border-gray-200 bg-white text-gray-500 hover:text-red-600 dark:border-gray-700 dark:bg-gray-900'}`}
            >
              Not helpful
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
