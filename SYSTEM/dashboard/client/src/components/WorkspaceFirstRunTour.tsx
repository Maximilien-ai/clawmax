import React, { useEffect, useMemo, useState } from 'react'
import type { DashboardPage } from '../lib/navigation'
import { WORKSPACE_TOUR_STEPS } from '../lib/onboardingTour'

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

  const step = WORKSPACE_TOUR_STEPS[stepIndex]
  const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  function getUnionRect(targets: Array<HTMLElement>): DOMRect | null {
    if (targets.length === 0) return null
    const rects = targets.map((target) => target.getBoundingClientRect())
    const left = Math.min(...rects.map((rect) => rect.left))
    const top = Math.min(...rects.map((rect) => rect.top))
    const right = Math.max(...rects.map((rect) => rect.right))
    const bottom = Math.max(...rects.map((rect) => rect.bottom))
    return {
      x: left,
      y: top,
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      toJSON: () => ({
        x: left,
        y: top,
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
      }),
    } as DOMRect
  }

  useEffect(() => {
    if (!visible) return
    setStepIndex(0)
  }, [visible])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('clawmax-workspace-tour-step', {
      detail: {
        visible,
        stepId: visible ? step.id : null,
      },
    }))
    return () => {
      window.dispatchEvent(new CustomEvent('clawmax-workspace-tour-step', {
        detail: {
          visible: false,
          stepId: null,
        },
      }))
    }
  }, [visible, step.id])

  useEffect(() => {
    if (!visible || !step?.page) return
    onNavigateToPage(step.page)
  }, [visible, step?.page, onNavigateToPage])

  useEffect(() => {
    if (!visible) return
    let rafId: number | null = null
    let timeoutId: number | null = null

    const refreshRect = () => {
      const selectors = Array.isArray(step.target) ? step.target : [step.target]
      const elements = selectors
        .map((selector) => document.querySelector(selector))
        .filter((element): element is HTMLElement => element instanceof HTMLElement)
      setTargetRect(getUnionRect(elements))
    }

    refreshRect()
    rafId = window.requestAnimationFrame(() => {
      refreshRect()
      timeoutId = window.setTimeout(refreshRect, 120)
    })
    window.addEventListener('resize', refreshRect)
    window.addEventListener('scroll', refreshRect, true)
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      if (timeoutId !== null) window.clearTimeout(timeoutId)
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
      <div className={`absolute inset-0 ${isDarkMode ? 'bg-slate-950/55' : 'bg-slate-900/30 backdrop-blur-[1px]'}`} />
      {targetRect && (
        <div
          className={`pointer-events-none absolute rounded-2xl border-2 transition-all duration-200 ${
            isDarkMode
              ? 'border-sky-400/90'
              : 'border-sky-500 bg-white/35'
          }`}
          style={{
            left: Math.max(targetRect.left - 8, 8),
            top: Math.max(targetRect.top - 8, 8),
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            boxShadow: isDarkMode
              ? '0 0 0 9999px rgba(2, 6, 23, 0.55)'
              : '0 0 0 9999px rgba(15, 23, 42, 0.28), 0 0 0 3px rgba(255, 255, 255, 0.92)',
          }}
        />
      )}
      <div
        className={`absolute z-10 rounded-3xl p-5 ${
          isDarkMode
            ? 'border border-sky-800 bg-gray-900 text-gray-100 shadow-2xl'
            : 'border border-slate-200 bg-white text-slate-950 shadow-[0_28px_80px_rgba(15,23,42,0.22)]'
        }`}
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isDarkMode ? 'text-sky-400' : 'text-sky-700'}`}>
              Workspace Tour
            </div>
            <h3 className="mt-1 text-lg font-semibold">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={() => onDismiss('dismissed')}
            className={`rounded-full p-1 transition-colors ${
              isDarkMode
                ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
            }`}
            title="Close tour"
          >
            ✕
          </button>
        </div>

        <p className={`mt-3 text-sm leading-6 ${isDarkMode ? 'text-gray-300' : 'text-slate-700'}`}>{step.description}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {WORKSPACE_TOUR_STEPS.map((tourStep, index) => (
            <button
              key={tourStep.id}
              type="button"
              onClick={() => setStepIndex(index)}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                index === stepIndex
                  ? (isDarkMode ? 'bg-sky-400' : 'bg-sky-600')
                  : (isDarkMode ? 'bg-gray-600' : 'bg-slate-300')
              }`}
              title={`Step ${index + 1}: ${tourStep.title}`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className={`flex items-center gap-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
            <span>{stepIndex + 1} / {WORKSPACE_TOUR_STEPS.length}</span>
            <button
              type="button"
              onClick={() => onDismiss('dismissed')}
              className={`rounded-full px-2.5 py-1 transition-colors ${
                isDarkMode
                  ? 'border border-gray-700 hover:border-gray-600 hover:bg-gray-800'
                  : 'border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              Don&apos;t show again
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
              disabled={stepIndex === 0}
              className={`rounded-lg px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isDarkMode
                  ? 'border border-gray-600 text-gray-200 hover:bg-gray-800'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (stepIndex === WORKSPACE_TOUR_STEPS.length - 1) {
                  onNavigateToPage('builder')
                  onDismiss('completed')
                  return
                }
                setStepIndex((current) => current + 1)
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                isDarkMode ? 'bg-sky-600 hover:bg-sky-700' : 'bg-sky-700 hover:bg-sky-800'
              }`}
            >
              {stepIndex === WORKSPACE_TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
