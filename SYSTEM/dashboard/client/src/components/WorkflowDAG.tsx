import React, { useMemo, useRef, useEffect, useState } from 'react'
import TruncatedText from './TruncatedText'

interface Workflow {
  id: string
  name: string
  description?: string
  schedule: string
  enabled: boolean
  executionMode: string
  dependsOn?: string[]
  inputRefs?: Array<{
    workflowId: string
    outputKey: string
    label?: string
    required?: boolean
  }>
  progress?: number
  status?: 'idle' | 'running' | 'completed' | 'blocked'
  runCount?: number
}

interface WorkflowDAGProps {
  workflows: Workflow[]
  onSelect?: (workflowId: string) => void
  onTrigger?: (workflowId: string) => void
  onEditRun?: (workflowId: string) => void
  onToggleEnabled?: (workflowId: string, enabled: boolean) => void
  selectedId?: string
  selectionMode?: boolean
  selectedWorkflowIds?: Set<string>
  onToggleSelect?: (workflowId: string) => void
  editable?: boolean
  onAddDependency?: (fromId: string, toId: string) => void
  onRemoveDependency?: (fromId: string, toId: string) => void
  onTogglePipelineSelect?: (workflowIds: string[]) => void
}

function inferPipelineLabel(workflows: Workflow[]): { title: string; subtitle?: string } {
  const companyPrefixes = Array.from(new Set(workflows
    .map((workflow) => workflow.name.match(/^(.*?)\s+·\s+/)?.[1]?.trim())
    .filter((value): value is string => !!value)))

  if (companyPrefixes.length === 1) {
    return {
      title: companyPrefixes[0],
      subtitle: `${workflows.length} workflow${workflows.length === 1 ? '' : 's'}`,
    }
  }

  const workflowScopes = Array.from(new Set(workflows
    .map((workflow) => workflow.name.split('·').pop()?.trim())
    .filter((value): value is string => !!value)))

  if (workflowScopes.length === 1) {
    return {
      title: workflowScopes[0],
      subtitle: `${workflows.length} workflow${workflows.length === 1 ? '' : 's'}`,
    }
  }

  return {
    title: `Pipeline`,
    subtitle: `${workflows.length} workflow${workflows.length === 1 ? '' : 's'}`,
  }
}

function getWorkflowDisplayName(workflowName: string, pipelineTitle?: string): string {
  const name = workflowName.trim()
  const title = (pipelineTitle || '').trim()
  if (!name || !title || title === 'Pipeline') return name
  const prefix = `${title} · `
  if (name.startsWith(prefix)) {
    return name.slice(prefix.length).trim() || name
  }
  return name
}

function groupForestLayouts(
  forestLayouts: Array<{ workflows: Workflow[]; lanes: Workflow[][]; edges: Array<{ from: string; to: string; kind: 'dependency' | 'handoff' }> }>
): Array<{
  key: string
  title: string
  workflows: Workflow[]
  forests: Array<{ forestIdx: number; workflows: Workflow[]; lanes: Workflow[][]; edges: Array<{ from: string; to: string; kind: 'dependency' | 'handoff' }> }>
}> {
  const groups = new Map<string, {
    key: string
    title: string
    workflows: Workflow[]
    forests: Array<{ forestIdx: number; workflows: Workflow[]; lanes: Workflow[][]; edges: Array<{ from: string; to: string; kind: 'dependency' | 'handoff' }> }>
  }>()

  forestLayouts.forEach((forest, forestIdx) => {
    const pipelineLabel = inferPipelineLabel(forest.workflows)
    const key = pipelineLabel.title || `pipeline-${forestIdx}`
    const existing = groups.get(key) || {
      key,
      title: pipelineLabel.title || `Pipeline ${forestIdx + 1}`,
      workflows: [],
      forests: [],
    }
    existing.workflows.push(...forest.workflows)
    existing.forests.push({ forestIdx, ...forest })
    groups.set(key, existing)
  })

  return Array.from(groups.values())
}

// Split workflows into connected components (separate DAG trees)
function findForests(workflows: Workflow[]): Workflow[][] {
  const byId = new Map(workflows.map(w => [w.id, w]))
  const visited = new Set<string>()
  const forests: Workflow[][] = []

  // Build adjacency (both directions for connected components)
  const adj = new Map<string, Set<string>>()
  for (const w of workflows) adj.set(w.id, new Set())
  for (const w of workflows) {
    for (const dep of w.dependsOn || []) {
      if (byId.has(dep)) {
        adj.get(w.id)?.add(dep)
        adj.get(dep)?.add(w.id)
      }
    }
    for (const inputRef of w.inputRefs || []) {
      if (byId.has(inputRef.workflowId)) {
        adj.get(w.id)?.add(inputRef.workflowId)
        adj.get(inputRef.workflowId)?.add(w.id)
      }
    }
  }

  for (const w of workflows) {
    if (visited.has(w.id)) continue
    // BFS to find connected component
    const component: string[] = []
    const queue = [w.id]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      component.push(id)
      for (const neighbor of adj.get(id) || []) {
        if (!visited.has(neighbor)) queue.push(neighbor)
      }
    }
    forests.push(component.map(id => byId.get(id)!).filter(Boolean))
  }

  return forests
}

// Topological sort + lane assignment for a single DAG tree
function layoutDAG(workflows: Workflow[]): { lanes: Workflow[][]; edges: Array<{ from: string; to: string; kind: 'dependency' | 'handoff' }> } {
  const byId = new Map(workflows.map(w => [w.id, w]))
  const edges: Array<{ from: string; to: string; kind: 'dependency' | 'handoff' }> = []
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  const edgeKeys = new Set<string>()

  for (const w of workflows) {
    inDegree.set(w.id, 0)
    dependents.set(w.id, [])
  }

  for (const w of workflows) {
    for (const dep of w.dependsOn || []) {
      if (byId.has(dep)) {
        edges.push({ from: dep, to: w.id, kind: 'dependency' })
        edgeKeys.add(`${dep}->${w.id}`)
        inDegree.set(w.id, (inDegree.get(w.id) || 0) + 1)
        dependents.get(dep)?.push(w.id)
      }
    }
    for (const inputRef of w.inputRefs || []) {
      if (byId.has(inputRef.workflowId)) {
        const edgeKey = `${inputRef.workflowId}->${w.id}`
        if (!edgeKeys.has(edgeKey)) {
          edges.push({ from: inputRef.workflowId, to: w.id, kind: 'handoff' })
          edgeKeys.add(edgeKey)
          inDegree.set(w.id, (inDegree.get(w.id) || 0) + 1)
          dependents.get(inputRef.workflowId)?.push(w.id)
        }
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

export default function WorkflowDAG({
  workflows,
  onSelect,
  selectedId,
  selectionMode,
  selectedWorkflowIds,
  onToggleSelect,
  editable,
  onAddDependency,
  onRemoveDependency,
  onTrigger,
  onEditRun,
  onToggleEnabled,
  onTogglePipelineSelect,
}: WorkflowDAGProps) {
  const forests = useMemo(() => findForests(workflows), [workflows])
  const forestLayouts = useMemo(() => forests.map(f => ({ workflows: f, ...layoutDAG(f) })), [forests])
  const groupedForestLayouts = useMemo(() => groupForestLayouts(forestLayouts), [forestLayouts])
  const containerRef = useRef<HTMLDivElement>(null)
  const forestRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [linesByForest, setLinesByForest] = useState<Map<number, Array<{ x1: number; y1: number; x2: number; y2: number; status: string; fromId: string; toId: string; kind: 'dependency' | 'handoff' }>>>(new Map())
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<{ type: 'add' | 'remove'; fromId: string; toId: string } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [collapsedForests, setCollapsedForests] = useState<Set<string>>(new Set())

  // Escape key cancels connecting, Ctrl+Z undoes last action
  useEffect(() => {
    if (!editable) return
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && lastAction) {
        e.preventDefault()
        if (lastAction.type === 'add') {
          onRemoveDependency?.(lastAction.fromId, lastAction.toId)
        } else {
          onAddDependency?.(lastAction.fromId, lastAction.toId)
        }
        setLastAction(null)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [editable, lastAction, onAddDependency, onRemoveDependency])

  // Escape key cancels connecting mode
  useEffect(() => {
    if (!connectingFrom) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConnectingFrom(null) }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [connectingFrom])

  // Calculate SVG connector lines per forest (scoped to each pipeline's container)
  useEffect(() => {
    const timer = setTimeout(() => {
      const newMap = new Map<number, Array<{ x1: number; y1: number; x2: number; y2: number; status: string; fromId: string; toId: string; kind: 'dependency' | 'handoff' }>>()

      forestLayouts.forEach((forest, forestIdx) => {
        const forestEl = forestRefs.current.get(forestIdx)
        if (!forestEl) return
        const rect = forestEl.getBoundingClientRect()
        const forestLines: Array<{ x1: number; y1: number; x2: number; y2: number; status: string; fromId: string; toId: string; kind: 'dependency' | 'handoff' }> = []

        for (const edge of forest.edges) {
          const fromEl = nodeRefs.current.get(edge.from)
          const toEl = nodeRefs.current.get(edge.to)
          if (!fromEl || !toEl) continue

          const fromRect = fromEl.getBoundingClientRect()
          const toRect = toEl.getBoundingClientRect()
          const gap = 8
          const toWf = workflows.find(w => w.id === edge.to)
          forestLines.push({
            x1: (fromRect.right - rect.left + gap) / zoom,
            y1: (fromRect.top + fromRect.height / 2 - rect.top) / zoom,
            x2: (toRect.left - rect.left - gap) / zoom,
            y2: (toRect.top + toRect.height / 2 - rect.top) / zoom,
            status: toWf?.status || 'idle',
            fromId: edge.from,
            toId: edge.to,
            kind: edge.kind,
          })
        }
        newMap.set(forestIdx, forestLines)
      })

      setLinesByForest(newMap)
    }, 50)

    return () => clearTimeout(timer)
  }, [forestLayouts, workflows, zoom])

  if (workflows.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No workflows to visualize
      </div>
    )
  }

  // Aggregate progress
  const totalWorkflows = workflows.length
  const completedCount = workflows.filter(w => w.status === 'completed').length
  const runningCount = workflows.filter(w => w.status === 'running').length
  const blockedCount = workflows.filter(w => w.status === 'blocked').length
  const aggregateProgress = totalWorkflows > 0 ? Math.round((completedCount / totalWorkflows) * 100) : 0

  return (
    <div className="relative">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm px-1 py-0.5">
        <button onClick={() => setZoom(z => Math.max(0.25, z - 0.15))} className="w-6 h-6 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center justify-center">−</button>
        <span className="text-[10px] text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(2, z + 0.15))} className="w-6 h-6 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center justify-center">+</button>
        {zoom !== 1 && <button onClick={() => setZoom(1)} className="text-[10px] text-sky-500 hover:text-sky-700 px-1">Reset</button>}
      </div>

    <div ref={containerRef} className="relative overflow-auto" style={{ maxHeight: '70vh' }}
      onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(z => Math.max(0.25, Math.min(2, z - e.deltaY * 0.002))) } }}
    >
    <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', minWidth: zoom < 1 ? `${100 / zoom}%` : undefined }}>
      {/* Aggregate progress */}
      <div className="px-4 pt-3 pb-1 flex items-center gap-3">
        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${aggregateProgress >= 100 ? 'bg-emerald-500' : blockedCount > 0 ? 'bg-amber-500' : 'bg-sky-500'}`}
            style={{ width: `${aggregateProgress}%` }}
          />
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
          <span>{aggregateProgress}%</span>
          <span>·</span>
          <span className="text-emerald-600">{completedCount} done</span>
          {runningCount > 0 && <><span>·</span><span className="text-sky-600">{runningCount} running</span></>}
          {blockedCount > 0 && <><span>·</span><span className="text-amber-600">{blockedCount} blocked</span></>}
          <span>·</span>
          <span>{totalWorkflows} total</span>
          {editable && lastAction && (
            <>
              <span>·</span>
              <button
                onClick={() => {
                  if (lastAction.type === 'add') {
                    onRemoveDependency?.(lastAction.fromId, lastAction.toId)
                  } else {
                    onAddDependency?.(lastAction.fromId, lastAction.toId)
                  }
                  setLastAction(null)
                }}
                className="text-purple-500 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-medium"
              >
                Undo
              </button>
            </>
          )}
        </div>
      </div>
      {/* Connecting mode banner */}
      {connectingFrom && (
        <div className="bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg mx-4 mt-2 px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-purple-700 dark:text-purple-300 font-medium">
            Click a target workflow to add: <strong>{connectingFrom}</strong> must complete before → ...
          </span>
          <button
            onClick={() => setConnectingFrom(null)}
            className="px-3 py-1 text-xs bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-300 dark:hover:bg-purple-700 font-medium"
          >
            Cancel (Esc)
          </button>
        </div>
      )}

      {/* Forest of DAGs grouped by inferred company/pipeline label */}
      {groupedForestLayouts.map((group) => {
        const isCollapsed = collapsedForests.has(group.key)
        const allGroupWorkflowIds = group.workflows.map((workflow) => workflow.id)
        const allSelected = group.workflows.every((workflow) => selectedWorkflowIds?.has(workflow.id))
        return (
          <div key={group.key}>
            <div className="px-4 pt-2 pb-0">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 pb-1 mb-0">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setCollapsedForests((prev) => {
                      const next = new Set(prev)
                      if (next.has(group.key)) next.delete(group.key)
                      else next.add(group.key)
                      return next
                    })}
                    className="text-xs text-gray-400 hover:text-sky-600 dark:text-gray-500 dark:hover:text-sky-300 transition-colors"
                    title={isCollapsed ? 'Expand company workflows' : 'Collapse company workflows'}
                  >
                    {isCollapsed ? '▶' : '▼'}
                  </button>
                  {selectionMode && onTogglePipelineSelect ? (
                    <button
                      onClick={() => onTogglePipelineSelect(allGroupWorkflowIds)}
                      className={`text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                        allSelected
                          ? 'text-sky-700 dark:text-sky-300'
                          : 'text-gray-400 hover:text-sky-600 dark:text-gray-500 dark:hover:text-sky-300'
                      }`}
                      title="Select or deselect this company workflow set"
                    >
                      {allSelected ? '[✓] ' : '[ ] '}
                      {group.title}
                    </button>
                  ) : (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        {group.title}
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500">
                        {group.workflows.length} workflow{group.workflows.length === 1 ? '' : 's'}
                        {group.forests.length > 1 ? ` · ${group.forests.length} pipelines` : ''}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {!isCollapsed && group.forests.map((forest, groupForestIdx) => (
              <div key={`${group.key}-${forest.forestIdx}`} ref={el => { if (el) forestRefs.current.set(forest.forestIdx, el) }} className="relative">
                <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: editable ? 'auto' : 'none', zIndex: editable ? 20 : 5 }}>
                  {(linesByForest.get(forest.forestIdx) || []).map((line, idx) => {
                    const midX = (line.x1 + line.x2) / 2
                    const color = line.status === 'completed' ? '#10b981' : line.status === 'running' ? '#0ea5e9' : line.status === 'blocked' ? '#f59e0b' : '#d1d5db'
                    return (
                      <g key={idx}>
                        <path d={`M ${line.x1} ${line.y1} C ${midX} ${line.y1}, ${midX} ${line.y2}, ${line.x2} ${line.y2}`} fill="none" stroke={color} strokeWidth={2} strokeDasharray={line.kind === 'handoff' ? '6 4' : line.status === 'idle' ? '4 4' : undefined} />
                        {editable && onRemoveDependency && (
                          <>
                            <path d={`M ${line.x1} ${line.y1} C ${midX} ${line.y1}, ${midX} ${line.y2}, ${line.x2} ${line.y2}`} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer', pointerEvents: 'all' }} onClick={(e) => { e.stopPropagation(); onRemoveDependency(line.fromId, line.toId); setLastAction({ type: 'remove', fromId: line.fromId, toId: line.toId }) }} />
                            <g style={{ cursor: 'pointer', pointerEvents: 'all' }} onClick={(e) => { e.stopPropagation(); onRemoveDependency(line.fromId, line.toId); setLastAction({ type: 'remove', fromId: line.fromId, toId: line.toId }) }}>
                              <circle cx={midX} cy={(line.y1 + line.y2) / 2} r={10} fill="white" stroke="#ef4444" strokeWidth={1.5} className="dark:fill-gray-800" />
                              <text x={midX} y={(line.y1 + line.y2) / 2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize={12} fill="#ef4444" fontWeight="bold">×</text>
                            </g>
                          </>
                        )}
                      </g>
                    )
                  })}
                </svg>
                <div className="flex gap-6 p-4 relative z-10" style={{ minHeight: 100 }}>
                  {group.forests.length > 1 && (
                    <div className="absolute left-4 top-1 text-[10px] font-medium text-gray-400 dark:text-gray-500">
                      Pipeline {groupForestIdx + 1}
                    </div>
                  )}
                  {forest.lanes.map((lane, laneIdx) => (
                    <div key={laneIdx} className="flex flex-col gap-3 min-w-[180px] justify-center">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 text-center">
                        {laneIdx === 0 && forest.lanes.length > 1 ? 'Start' : laneIdx === forest.lanes.length - 1 && forest.lanes.length > 1 ? 'End' : `Step ${laneIdx + 1}`}
                        {lane.length > 1 && <span className="ml-1 text-purple-400">(parallel)</span>}
                      </div>

                      {lane.map((wf) => {
                        const status = wf.status || 'idle'
                        const colors = STATUS_COLORS[status] || STATUS_COLORS.idle
                        const isSelected = selectionMode ? selectedWorkflowIds?.has(wf.id) : selectedId === wf.id

                        return (
                          <div
                            key={wf.id}
                            ref={(el) => { if (el) nodeRefs.current.set(wf.id, el) }}
                            onClick={() => {
                              if (editable && connectingFrom) {
                                if (connectingFrom === wf.id) {
                                  setConnectingFrom(null)
                                  return
                                }
                                if (wf.dependsOn?.includes(connectingFrom)) {
                                  setConnectingFrom(null)
                                  return
                                }
                                const wouldCycle = (fromId: string, toId: string): boolean => {
                                  const visited = new Set<string>()
                                  const check = (id: string): boolean => {
                                    if (id === toId) return true
                                    if (visited.has(id)) return false
                                    visited.add(id)
                                    const workflow = workflows.find((item) => item.id === id)
                                    return (workflow?.dependsOn || []).some((dependencyId) => check(dependencyId))
                                  }
                                  return check(fromId)
                                }
                                if (wouldCycle(wf.id, connectingFrom)) {
                                  setConnectingFrom(null)
                                  return
                                }
                                onAddDependency?.(connectingFrom, wf.id)
                                setLastAction({ type: 'add', fromId: connectingFrom, toId: wf.id })
                                setConnectingFrom(null)
                              } else if (selectionMode) {
                                onToggleSelect?.(wf.id)
                              } else {
                                onSelect?.(wf.id)
                              }
                            }}
                            onContextMenu={editable ? (e) => {
                              e.preventDefault()
                              setConnectingFrom(wf.id)
                            } : undefined}
                            className={`rounded-lg border-2 p-3 cursor-pointer transition-all ${colors.bg} ${
                              connectingFrom === wf.id
                                ? 'border-purple-500 ring-2 ring-purple-300 dark:ring-purple-700'
                                : isSelected
                                  ? 'border-purple-500 ring-2 ring-purple-200 dark:ring-purple-800'
                                  : colors.border
                            } hover:shadow-md`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                              <TruncatedText
                                text={getWorkflowDisplayName(wf.name, group.title)}
                                className={`text-sm font-medium truncate ${colors.text}`}
                              />
                              {!selectionMode && onTrigger && status !== 'running' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onTrigger(wf.id) }}
                                  className={`ml-auto inline-flex items-center justify-center rounded-full w-9 h-9 text-sm font-semibold transition-colors ${
                                    status === 'completed'
                                      ? 'bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50'
                                      : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50'
                                  }`}
                                  title={status === 'completed' ? 'Re-run workflow' : 'Run workflow'}
                                >
                                  {status === 'completed' ? '↻' : '▶'}
                                </button>
                              )}
                              {!selectionMode && onEditRun && status !== 'running' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onEditRun(wf.id) }}
                                  className="inline-flex items-center justify-center rounded-full w-9 h-9 text-sm font-semibold transition-colors bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
                                  title="Run with input"
                                >
                                  ✎
                                </button>
                              )}
                              {selectionMode && isSelected && (
                                <span className="ml-auto text-[10px] font-semibold text-purple-600 dark:text-purple-300">
                                  Selected
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
                              <span>{wf.schedule === 'manual' || (wf as any).type === 'once' ? '▶' : (wf as any).type === 'conditional' ? '◆' : '↻'}</span>
                              <span className="font-mono">{wf.schedule === 'manual' ? 'manual' : wf.schedule === 'once' ? 'once' : 'cron'}</span>
                              <span>{wf.executionMode}</span>
                            </div>

                            {editable && !connectingFrom && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setConnectingFrom(wf.id) }}
                                className="mt-1.5 text-[10px] text-purple-500 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-medium"
                              >
                                + Add dependency
                              </button>
                            )}

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

                            <div className="flex items-center justify-between mt-1.5">
                              <div className="flex items-center gap-1.5">
                                {status !== 'idle' && (
                                  <span className={`text-[10px] font-medium ${colors.text} capitalize`}>{status}</span>
                                )}
                                {(wf.runCount || 0) > 0 && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                                    {wf.runCount}x
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {onToggleEnabled && status === 'running' && wf.enabled && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onToggleEnabled(wf.id, wf.enabled) }}
                                    className="text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                                    title="Pause workflow"
                                  >
                                    ‖
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  </div>
</div>
  )
}
