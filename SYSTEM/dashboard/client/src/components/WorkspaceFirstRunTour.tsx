import React, { useEffect, useMemo, useState } from 'react'
import type { DashboardPage } from '../lib/navigation'

type TourStep = {
  id: string
  target: string
  title: string
  description: string
  page?: DashboardPage
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'workspace',
    target: '[data-tour="workspace-switcher"]',
    title: 'Workspaces live here',
    description: 'Create or switch workspaces here. Use separate workspaces when you want different agents, docs, and teams to stay isolated.',
  },
  {
    id: 'byok',
    target: '[data-tour="byok"]',
    title: 'Set BYOK before you build',
    description: 'Add your model keys here first. AI Builder, templates, and AI-assisted generation depend on this being configured cleanly.',
  },
  {
    id: 'builder',
    target: '[data-tour="nav-builder"]',
    title: 'Start with AI Builder',
    description: 'This is the fastest path for a new workspace. Tell Builder what you want, and it will route you toward agents, skills, workflows, or templates.',
    page: 'builder',
  },
  {
    id: 'agents',
    target: '[data-tour="nav-agents"]',
    title: 'Your agents show up here',
    description: 'Use Agents to inspect, edit, and chat with the roles you create. This is where single agents live after Builder or template setup.',
    page: 'agents',
  },
  {
    id: 'workflows',
    target: '[data-tour="nav-workflows"]',
    title: 'Workflows coordinate repeatable work',
    description: 'Use Workflows when an agent or team needs a recurring process, approvals, or handoffs instead of one-off chats.',
    page: 'workflows',
  },
  {
    id: 'templates',
    target: '[data-tour="nav-templates"]',
    title: 'Templates save you from starting from scratch',
    description: 'Browse or refine templates here when you want a starter team, workspace structure, or prebuilt flow instead of building from zero.',
    page: 'templates',
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function WorkspaceFirstRunTour({
  visible,
  onNavigateToPage,
  onDismiss,
}: {
  visible: boolean
  onNavigateToPage: (page: DashboardPage) => void
  onDismiss: (state: 'completed' | 'dismissed') => void
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  const step = TOUR_STEPS[stepIndex]

  useEffect(() => {
    if (!visible) return
    setStepIndex(0)
  }, [visible])

  useEffect(() => {
    if (!visible || !step?.page) return
    onNavigateToPage(step.page)
  }, [visible, step?.page, onNavigateToPage])

  useEffect(() => {
    if (!visible) return
    const refreshRect = () => {
      const element = document.querySelector(step.target)
      if (element instanceof HTMLElement) {
        setTargetRect(element.getBoundingClientRect())
      } else {
        setTargetRect(null)
      }
    }

    refreshRect()
    window.addEventListener('resize', refreshRect)
    window.addEventListener('scroll', refreshRect, true)
    return () => {
      window.removeEventListener('resize', refreshRect)
      window.removeEventListener('scroll', refreshRect, true)
    }
  }, [visible, step.target, stepIndex])

  const cardStyle = useMemo(() => {
    if (!targetRect) {
      return {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      } as React.CSSProperties
    }

    const width = 360
    const gap = 20
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const placeRight = targetRect.right < viewportWidth * 0.6
    const placeBelow = targetRect.top < 150
    const left = placeBelow
      ? clamp(targetRect.left, 24, viewportWidth - width - 24)
      : placeRight
        ? clamp(targetRect.right + gap, 24, viewportWidth - width - 24)
        : clamp(targetRect.left - width - gap, 24, viewportWidth - width - 24)
    const top = placeBelow
      ? clamp(targetRect.bottom + gap, 24, viewportHeight - 280)
      : clamp(targetRect.top - 8, 24, viewportHeight - 280)

    return { left, top, width } as React.CSSProperties
  }, [targetRect])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[85]">
      <div className="absolute inset-0 bg-slate-950/55" />
      {targetRect && (
        <div
          className="pointer-events-none absolute rounded-2xl border-2 border-sky-400/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.55)] transition-all duration-200"
          style={{
            left: Math.max(targetRect.left - 8, 8),
            top: Math.max(targetRect.top - 8, 8),
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      )}
      <div
        className="absolute rounded-3xl border border-sky-200/80 bg-white/97 p-5 text-gray-900 shadow-2xl backdrop-blur dark:border-sky-800 dark:bg-gray-900/97 dark:text-gray-100"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400">
              Workspace Tour
            </div>
            <h3 className="mt-1 text-lg font-semibold">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={() => onDismiss('dismissed')}
            className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            title="Close tour"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{step.description}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {TOUR_STEPS.map((tourStep, index) => (
            <button
              key={tourStep.id}
              type="button"
              onClick={() => setStepIndex(index)}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${index === stepIndex ? 'bg-sky-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              title={`Step ${index + 1}: ${tourStep.title}`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{stepIndex + 1} / {TOUR_STEPS.length}</span>
            <button
              type="button"
              onClick={() => onDismiss('dismissed')}
              className="rounded-full border border-gray-200 px-2.5 py-1 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800"
            >
              Don&apos;t show again
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
              disabled={stepIndex === 0}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (stepIndex === TOUR_STEPS.length - 1) {
                  onDismiss('completed')
                  return
                }
                setStepIndex((current) => current + 1)
              }}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700"
            >
              {stepIndex === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
