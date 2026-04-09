import React, { useEffect, useMemo, useState } from 'react'
import { getDiscoverySuggestions } from '../lib/discoverySuggestions'

type Step = 'welcome' | 'setup' | 'build' | 'templates'
type TemplateCandidate = {
  id: string
  name: string
  description?: string
  category?: string
  tags?: string[]
}

interface OnboardingWizardProps {
  visible: boolean
  onOpenByok: () => void
  onImportAgents: () => void
  onCreateAgent: () => void
  onOpenTemplates: () => void
}

export function OnboardingWizard({ visible, onOpenByok, onImportAgents, onCreateAgent, onOpenTemplates }: OnboardingWizardProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('welcome')
  const [usesOpenClaw, setUsesOpenClaw] = useState<boolean | null>(null)
  const [buildPath, setBuildPath] = useState<'single' | 'team' | null>(null)
  const [templateCategory, setTemplateCategory] = useState('business')
  const [templateFocus, setTemplateFocus] = useState('')
  const [templateGoal, setTemplateGoal] = useState('')
  const [templateCandidates, setTemplateCandidates] = useState<TemplateCandidate[]>([])

  useEffect(() => {
    if (!visible) {
      setOpen(false)
      return
    }
    const key = 'clawmax-onboarding-auto-opened'
    if (localStorage.getItem(key) === 'true') return
    setOpen(true)
    localStorage.setItem(key, 'true')
  }, [visible])

  useEffect(() => {
    if (!open) return
    fetch('/api/templates/organizations')
      .then((res) => (res.ok ? res.json() : { templates: [] }))
      .then((data) => {
        const templates = Array.isArray(data?.templates) ? data.templates : []
        setTemplateCandidates(
          templates.map((template: any) => ({
            id: template.slug || template.id || template.name,
            name: template.name || template.slug || 'Template',
            description: template.description || '',
            category: template.category || '',
            tags: template.tags || [],
          }))
        )
      })
      .catch(() => setTemplateCandidates([]))
  }, [open])

  const recommendation = useMemo(() => {
    if (usesOpenClaw === true) return 'Import your current agents first, then apply templates later if you want a faster starting point.'
    if (buildPath === 'single') return 'Start with one agent, validate the model and workflow behavior, then expand into a team.'
    if (buildPath === 'team') return 'Templates are the fastest path because they give you a kickoff, analysis lanes, and a final output flow immediately.'
    return 'Set BYOK first if you have not done it yet so system flows and AI-assisted setup can run cleanly.'
  }, [buildPath, usesOpenClaw])

  const recommendedTemplates = useMemo(() => {
    const query = [templateCategory, templateFocus, templateGoal].filter(Boolean).join(' ').trim()
    if (!query) return []
    const suggestions = getDiscoverySuggestions(
      query,
      templateCandidates.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        tags: template.tags,
        keywords: template.tags || [],
      })),
      4
    )
    return suggestions
      .map((suggestion) => {
        const template = templateCandidates.find((candidate) => candidate.id === suggestion.id)
        if (!template) return null
        return { ...template, reasons: suggestion.reasons }
      })
      .filter(Boolean) as Array<TemplateCandidate & { reasons: string[] }>
  }, [templateCandidates, templateCategory, templateFocus, templateGoal])

  if (!visible) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
        title="Open onboarding"
      >
        Onboarding
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-3xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">First Run</div>
                <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">Get this workspace running</h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Use the shortest path that fits how you already work. You can reopen this until the workspace has agents.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              {(['welcome', 'setup', 'build', 'templates'] as Step[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setStep(value)}
                  className={`rounded-full px-3 py-1.5 transition-colors ${
                    step === value
                      ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-medium'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {value === 'welcome' ? '1. Context' : value === 'setup' ? '2. Keys' : value === 'build' ? '3. Agents' : '4. Templates'}
                </button>
              ))}
            </div>

            {step === 'welcome' && (
              <div className="mt-6 space-y-5">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Are you already using OpenClaw?</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => { setUsesOpenClaw(true); setStep('setup') }}
                      className={`rounded-lg px-3 py-2 text-sm transition-colors ${usesOpenClaw === true ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
                    >
                      Yes, import what I have
                    </button>
                    <button
                      onClick={() => { setUsesOpenClaw(false); setStep('setup') }}
                      className={`rounded-lg px-3 py-2 text-sm transition-colors ${usesOpenClaw === false ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
                    >
                      No, start fresh
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Recommendation</div>
                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{recommendation}</p>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">Skip for now</button>
                  <button onClick={() => setStep('setup')} className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700">Continue</button>
                </div>
              </div>
            )}

            {step === 'setup' && (
              <div className="mt-6 space-y-5">
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                  <div className="text-sm font-medium text-amber-800 dark:text-amber-200">Set keys and runtime first</div>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                    If you want templates, AI generation, or system agents to work cleanly, configure BYOK or Ollama before you start.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => { onOpenByok(); setOpen(false) }}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Open BYOK Wizard
                  </button>
                  <button
                    onClick={() => setStep('build')}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-200"
                  >
                    Continue without changing keys
                  </button>
                </div>
              </div>
            )}

            {step === 'build' && (
              <div className="mt-6 space-y-5">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">How do you want to start?</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => setBuildPath('single')}
                      className={`rounded-lg px-3 py-2 text-sm transition-colors ${buildPath === 'single' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
                    >
                      One agent first
                    </button>
                    <button
                      onClick={() => setBuildPath('team')}
                      className={`rounded-lg px-3 py-2 text-sm transition-colors ${buildPath === 'team' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
                    >
                      Start with a team
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    onClick={() => { onImportAgents(); setOpen(false) }}
                    className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900/40"
                  >
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Import existing OpenClaw agents</div>
                    <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">Best if you already have agents and want to keep momentum.</div>
                  </button>
                  <button
                    onClick={() => { onCreateAgent(); setOpen(false) }}
                    className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-900/40"
                  >
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Create a new agent</div>
                    <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">Start with one role, validate it, then expand from there.</div>
                  </button>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => setStep('templates')} className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700">Show templates</button>
                </div>
              </div>
            )}

            {step === 'templates' && (
              <div className="mt-6 space-y-5">
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Start from a template if you want faster results</div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Templates are the fastest way to get kickoff, specialist lanes, and a final output workflow without building everything by hand.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100">Category</label>
                    <select
                      value={templateCategory}
                      onChange={(e) => setTemplateCategory(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    >
                      <option value="business">Business</option>
                      <option value="technical">Technical</option>
                      <option value="events">Events</option>
                      <option value="research">Research</option>
                      <option value="marketing">Marketing</option>
                      <option value="personal">Personal</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100">Focus</label>
                    <input
                      type="text"
                      value={templateFocus}
                      onChange={(e) => setTemplateFocus(e.target.value)}
                      placeholder="e.g. growth, content, robotics"
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100">Goal</label>
                    <input
                      type="text"
                      value={templateGoal}
                      onChange={(e) => setTemplateGoal(e.target.value)}
                      placeholder="What are you trying to accomplish?"
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Suggested Starters</div>
                  {recommendedTemplates.length === 0 ? (
                    <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
                      Add a focus or goal and ClawMax will suggest templates to start from.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {recommendedTemplates.map((template) => (
                        <div key={template.id} className="rounded-xl border border-emerald-200/70 dark:border-emerald-800 bg-white/80 dark:bg-gray-900/30 p-4">
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{template.name}</div>
                          <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{template.description || 'Suggested starter template'}</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {template.reasons.map((reason) => (
                              <span key={`${template.id}-${reason}`} className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                {reason}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">Close</button>
                  <button
                    onClick={() => { onOpenTemplates(); setOpen(false) }}
                    className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    Browse Templates
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
