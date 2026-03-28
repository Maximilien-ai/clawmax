import React, { useMemo, useRef, useEffect, useState } from 'react'

interface Workflow {
  id: string
  name: string
  description?: string
  schedule: string
  enabled: boolean
  executionMode: string
  dependsOn?: string[]
  progress?: number
  status?: 'idle' | 'running' | 'completed' | 'blocked'
}

interface WorkflowDAGProps {
  workflows: Workflow[]
  onSelect?: (workflowId: string) => void
  selectedId?: string
}

// Topological sort + lane assignment
function layoutDAG(workflows: Workflow[]): { lanes: Workflow[][]; edges: Array<{ from: string; to: string }> } {
  const byId = new Map(workflows.map(w => [w.id, w]))
  const edges: Array<{ from: string; to: string }> = []
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()

  for (const w of workflows) {
    inDegree.set(w.id, 0)
    dependents.set(w.id, [])
  }

  for (const w of workflows) {
    for (const dep of w.dependsOn || []) {
      if (byId.has(dep)) {
        edges.push({ from: dep, to: w.id })
        inDegree.set(w.id, (inDegree.get(w.id) || 0) + 1)
        dependents.get(dep)?.push(w.id)
      }
    }
  }

  // BFS topological sort into lanes
  const lanes: Workflow[][] = []
  const assigned = new Set<string>()
  let queue = workflows.filter(w => (inDegree.get(w.id) || 0) === 0).map(w => w.id)

  while (queue.length > 0) {
    const lane = queue.map(id => byId.get(id)!).filter(Boolean)
    lanes.push(lane)
    for (const id of queue) assigned.add(id)

    const nextQueue: string[] = []
    for (const id of queue) {
      for (const dep of dependents.get(id) || []) {
        if (assigned.has(dep)) continue
        const remaining = (workflows.find(w => w.id === dep)?.dependsOn || [])
          .filter(d => !assigned.has(d))
        if (remaining.length === 0 && !nextQueue.includes(dep)) {
          nextQueue.push(dep)
        }
      }
    }
    queue = nextQueue
  }

  // Add any unassigned (cycles or disconnected)
  const unassigned = workflows.filter(w => !assigned.has(w.id))
  if (unassigned.length > 0) lanes.push(unassigned)

  return { lanes, edges }
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  idle: { bg: 'bg-gray-50 dark:bg-gray-800', border: 'border-gray-200 dark:border-gray-700', text: 'text-gray-700 dark:text-gray-300', dot: 'bg-gray-400' },
  running: { bg: 'bg-sky-50 dark:bg-sky-900/20', border: 'border-sky-300 dark:border-sky-700', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500 animate-pulse' },
  completed: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  blocked: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-300 dark:border-amber-700', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
}

export default function WorkflowDAG({ workflows, onSelect, selectedId }: WorkflowDAGProps) {
  const { lanes, edges } = useMemo(() => layoutDAG(workflows), [workflows])
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [lines, setLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; status: string }>>([])

  // Calculate SVG connector lines after render
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const timer = setTimeout(() => {
      const rect = container.getBoundingClientRect()
      const newLines: typeof lines = []

      for (const edge of edges) {
        const fromEl = nodeRefs.current.get(edge.from)
        const toEl = nodeRefs.current.get(edge.to)
        if (!fromEl || !toEl) continue

        const fromRect = fromEl.getBoundingClientRect()
        const toRect = toEl.getBoundingClientRect()

        const toWf = workflows.find(w => w.id === edge.to)
        newLines.push({
          x1: fromRect.right - rect.left,
          y1: fromRect.top + fromRect.height / 2 - rect.top,
          x2: toRect.left - rect.left,
          y2: toRect.top + toRect.height / 2 - rect.top,
          status: toWf?.status || 'idle',
        })
      }

      setLines(newLines)
    }, 50)

    return () => clearTimeout(timer)
  }, [lanes, edges, workflows])

  if (workflows.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No workflows to visualize
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative overflow-x-auto">
      {/* SVG connector lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ minWidth: '100%', minHeight: '100%' }}>
        {lines.map((line, idx) => {
          const midX = (line.x1 + line.x2) / 2
          const color = line.status === 'completed' ? '#10b981' : line.status === 'running' ? '#0ea5e9' : line.status === 'blocked' ? '#f59e0b' : '#d1d5db'
          return (
            <path
              key={idx}
              d={`M ${line.x1} ${line.y1} C ${midX} ${line.y1}, ${midX} ${line.y2}, ${line.x2} ${line.y2}`}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeDasharray={line.status === 'idle' ? '4 4' : undefined}
            />
          )
        })}
      </svg>

      {/* Lanes (columns) */}
      <div className="flex gap-6 p-4 relative z-10" style={{ minHeight: 120 }}>
        {lanes.map((lane, laneIdx) => (
          <div key={laneIdx} className="flex flex-col gap-3 min-w-[180px]">
            {/* Lane header */}
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 text-center">
              {laneIdx === 0 && lanes.length > 1 ? 'Start' : laneIdx === lanes.length - 1 && lanes.length > 1 ? 'End' : `Step ${laneIdx + 1}`}
              {lane.length > 1 && <span className="ml-1 text-purple-400">(parallel)</span>}
            </div>

            {/* Workflow nodes */}
            {lane.map(wf => {
              const status = wf.status || 'idle'
              const colors = STATUS_COLORS[status] || STATUS_COLORS.idle
              const isSelected = selectedId === wf.id

              return (
                <div
                  key={wf.id}
                  ref={el => { if (el) nodeRefs.current.set(wf.id, el) }}
                  onClick={() => onSelect?.(wf.id)}
                  className={`rounded-lg border-2 p-3 cursor-pointer transition-all ${colors.bg} ${isSelected ? 'border-purple-500 ring-2 ring-purple-200 dark:ring-purple-800' : colors.border} hover:shadow-md`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                    <span className={`text-sm font-medium truncate ${colors.text}`}>{wf.name}</span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                    <span className="font-mono">{wf.schedule === 'manual' ? 'manual' : wf.schedule === 'once' ? 'once' : 'cron'}</span>
                    <span>{wf.executionMode}</span>
                  </div>

                  {/* Progress bar */}
                  {wf.progress != null && wf.progress > 0 && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${wf.progress >= 100 ? 'bg-emerald-500' : status === 'blocked' ? 'bg-amber-500' : 'bg-sky-500'}`}
                          style={{ width: `${Math.min(wf.progress, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{wf.progress}%</span>
                    </div>
                  )}

                  {/* Status badge */}
                  {status !== 'idle' && (
                    <div className={`mt-1.5 text-[10px] font-medium ${colors.text} capitalize`}>
                      {status}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
