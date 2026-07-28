import React from 'react'
import {
  MODEL_FIT_DETAILS_STORAGE_KEY,
  readModelFitDetailsExpanded,
  storeModelFitPreference,
  type ModelFitPreference,
  type ModelFitRecommendation,
} from '../lib/modelFit'

const PREFERENCES: Array<{ id: ModelFitPreference; label: string }> = [
  { id: 'quality', label: 'Quality' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'cost', label: 'Cost' },
]

export function ModelFitPreferenceControl({
  value,
  onChange,
  disabled = false,
}: {
  value: ModelFitPreference
  onChange: (preference: ModelFitPreference) => void
  disabled?: boolean
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Model priority</div>
      <div className="grid w-full grid-cols-3 rounded-md border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-900" role="group" aria-label="Model recommendation priority">
        {PREFERENCES.map(option => (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={`min-w-0 px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              value === option.id
                ? 'bg-sky-600 text-white'
                : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ModelFitRecommendationPanel({
  recommendation,
  preference,
  onPreferenceChange,
  loading = false,
  error,
  selectedModel,
  onUseSuggestion,
  autoApply = false,
  onAutoApplyChange,
}: {
  recommendation: ModelFitRecommendation | null
  preference: ModelFitPreference
  onPreferenceChange: (preference: ModelFitPreference) => void
  loading?: boolean
  error?: string | null
  selectedModel?: string
  onUseSuggestion?: (model: string) => void
  autoApply?: boolean
  onAutoApplyChange?: (enabled: boolean) => void
}) {
  const [detailsExpanded, setDetailsExpanded] = React.useState(() => (
    readModelFitDetailsExpanded(typeof window === 'undefined' ? undefined : window.localStorage)
  ))
  const suggestedModel = recommendation?.recommendedModel || ''
  const suggestionSelected = !!suggestedModel && suggestedModel === selectedModel
  const setExpanded = (expanded: boolean) => {
    setDetailsExpanded(expanded)
    storeModelFitPreference(
      MODEL_FIT_DETAILS_STORAGE_KEY,
      expanded,
      typeof window === 'undefined' ? undefined : window.localStorage,
    )
  }

  return (
    <section className="overflow-hidden rounded-lg border border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-900/20" aria-label="Model suggestion">
      <div className="grid gap-3 border-b border-sky-200 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)] sm:items-end dark:border-sky-800">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-sky-950 dark:text-sky-100">Automatic model suggestion</h4>
          <p className="mt-1 text-xs text-sky-800 dark:text-sky-200">
            Compares this agent&apos;s description with models available to the current runtime.
          </p>
        </div>
        <ModelFitPreferenceControl value={preference} onChange={onPreferenceChange} disabled={loading} />
      </div>

      <div className="p-3 text-sm text-sky-950 dark:text-sky-100" aria-live="polite">
        {loading && <p className="text-xs text-sky-700 dark:text-sky-300">Updating suggestion...</p>}
        {!loading && error && <p className="text-xs text-red-700 dark:text-red-300">{error}</p>}
        {!loading && !error && !suggestedModel && (
          <p className="text-xs text-sky-700 dark:text-sky-300">No runtime-visible models are available to compare.</p>
        )}
        {!loading && !error && suggestedModel && recommendation && (
          <>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <button
                  type="button"
                  aria-expanded={detailsExpanded}
                  onClick={() => setExpanded(!detailsExpanded)}
                  className="flex max-w-full items-start gap-1.5 text-left font-medium hover:text-sky-700 dark:hover:text-sky-200"
                >
                  <span className="mt-0.5 shrink-0" aria-hidden="true">{detailsExpanded ? '▾' : '▸'}</span>
                  <span className="break-all">Suggested model: {suggestedModel}</span>
                </button>
                <div className="mt-0.5 text-xs uppercase text-sky-700 dark:text-sky-300">
                  {recommendation.confidence} confidence
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {onAutoApplyChange && (
                  <label className="flex items-center gap-2 rounded-md border border-sky-300 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-900 dark:border-sky-700 dark:bg-gray-900 dark:text-sky-100">
                    <input
                      type="checkbox"
                      checked={autoApply}
                      onChange={(event) => onAutoApplyChange(event.target.checked)}
                    />
                    Auto-select top suggestion
                  </label>
                )}
                {onUseSuggestion && !autoApply && (
                  <button
                    type="button"
                    disabled={suggestionSelected}
                    onClick={() => onUseSuggestion(suggestedModel)}
                    className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:cursor-default disabled:bg-green-600"
                  >
                    {suggestionSelected ? 'Selected' : 'Use suggestion'}
                  </button>
                )}
              </div>
            </div>
            {detailsExpanded && (
              <>
                <p className="mt-2 text-xs">{recommendation.summary}</p>
                {recommendation.candidates[0]?.reasons?.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                    {recommendation.candidates[0].reasons.map(reason => <li key={reason}>{reason}</li>)}
                  </ul>
                )}
                {recommendation.candidates.length > 1 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium">Other runtime-visible candidates</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {recommendation.candidates.slice(1).map(candidate => (
                        <button
                          key={candidate.model}
                          type="button"
                          disabled={!onUseSuggestion || autoApply || candidate.model === selectedModel}
                          onClick={() => onUseSuggestion?.(candidate.model)}
                          title={candidate.reasons.join(' ') || `Select ${candidate.model}`}
                          className="max-w-full break-all rounded border border-sky-300 bg-white px-2 py-1 text-left text-xs text-sky-800 hover:border-sky-500 disabled:cursor-default disabled:opacity-60 dark:border-sky-700 dark:bg-gray-900 dark:text-sky-200"
                        >
                          {candidate.model}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {recommendation.candidates[0]?.caveats?.length > 0 && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer font-medium">Review capability assumptions</summary>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {recommendation.candidates[0].caveats.map(caveat => <li key={caveat}>{caveat}</li>)}
                    </ul>
                  </details>
                )}
                {(recommendation.excludedModels?.length || 0) > 0 && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer font-medium">Excluded incompatible models</summary>
                    <ul className="mt-1 space-y-1.5">
                      {recommendation.excludedModels?.map(entry => (
                        <li key={entry.model}>
                          <span className="font-medium">{entry.model}</span>: {entry.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="mt-3 text-xs text-sky-800 dark:text-sky-200">{recommendation.disclaimer}</p>
                {onUseSuggestion && (
                  <p className="mt-2 text-xs font-medium text-sky-900 dark:text-sky-100">
                    {autoApply
                      ? 'Auto-select updates this draft when the top suggestion changes. The agent changes only when you save.'
                      : 'Selecting a suggestion does not change the agent until you save.'}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}
