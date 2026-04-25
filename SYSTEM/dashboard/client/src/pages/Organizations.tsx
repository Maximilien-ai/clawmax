import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import SaveAsOrgTemplateModal from '../components/SaveAsOrgTemplateModal'
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog'
import { PageLoading } from '../components/LoadingSpinner'
import { useWorkspace } from '../contexts/WorkspaceContext'

interface GroupEntry {
  name: string
  description: string | null
  tags: string[]
  community: string | null
  channels: string[]
}

interface Agent {
  id: string
  name: string
  status: 'online' | 'offline' | 'unknown'
  communities: GroupEntry[]
  groups: GroupEntry[]
}

interface Workflow {
  id: string
  name: string
  description: string
  schedule: string
  enabled: boolean
  executionMode: 'automated' | 'managed'
  owner?: string
  created: string
  modified: string
  author: string
  participantCount: number
  targeting: {
    communities: string[]
    groups: string[]
    tags: string[]
    agents: string[]
  }
}

interface WorkflowExecutionOutputSummary {
  status: 'completed' | 'failed' | 'running' | 'paused'
  summary?: string
  artifactPath?: string
  outputLabel?: string
}

interface OrganizationsProps {
  onNavigateToAgent?: (agentId: string) => void
  onNavigateToWorkflow?: (workflowId: string) => void
  onNavigateToGroup?: (groupName: string) => void
  onNavigateToDoc?: (file: string) => void
  initialCommunityName?: string
  initialGroupName?: string
  isActive?: boolean
}

interface Community {
  name: string
  description: string | null
  tags: string[]
  channels: string[]
  members: Agent[]
}

interface Group {
  name: string
  description: string | null
  tags: string[]
  channels: string[]
  community: string | null
  members: Agent[]
}

interface Team {
  id: string
  name: string
  purpose?: string
  leaderAgentId?: string
  memberAgentIds: string[]
  parentTeamId?: string
  tags: string[]
}

type OrganizationViewMode = 'structure' | 'org-chart'

const STATUS_DOT: Record<string, string> = {
  online: 'bg-green-400',
  offline: 'bg-yellow-400',
  unknown: 'bg-gray-300',
}

const WORKFLOW_OUTPUT_STATUS_BADGE: Record<WorkflowExecutionOutputSummary['status'], string> = {
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  running: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
}

function TeamTreeNode({
  team,
  depth,
  teamChildren,
  teamWorkflows,
  latestWorkflowOutputs,
  agentNameById,
  onNavigateToAgent,
  onNavigateToWorkflow,
  onNavigateToDoc,
  onDeleteTeam,
}: {
  team: Team
  depth: number
  teamChildren: Map<string, Team[]>
  teamWorkflows: Map<string, Workflow[]>
  latestWorkflowOutputs: Map<string, WorkflowExecutionOutputSummary>
  agentNameById: Record<string, string>
  onNavigateToAgent?: (agentId: string) => void
  onNavigateToWorkflow?: (workflowId: string) => void
  onNavigateToDoc?: (file: string) => void
  onDeleteTeam?: (teamId: string) => void
}) {
  const children = teamChildren.get(team.id) || []
  const workflows = teamWorkflows.get(team.id) || []
  const leaderLabel = team.leaderAgentId ? (agentNameById[team.leaderAgentId] || team.leaderAgentId) : null

  return (
    <div className="space-y-3">
      <div
        className="rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900/40 p-4"
        style={{ marginLeft: depth * 20 }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-amber-700 dark:text-amber-400">{team.id}</span>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{team.name}</h3>
              {children.length > 0 && (
                <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                  {children.length} subteam{children.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {team.purpose && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{team.purpose}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {leaderLabel && team.leaderAgentId && (
              <button
                onClick={() => onNavigateToAgent?.(team.leaderAgentId!)}
                className="rounded-full border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
              >
                Lead: {leaderLabel}
              </button>
            )}
            <span className="rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-gray-600 dark:text-gray-300">
              {team.memberAgentIds.length} member{team.memberAgentIds.length === 1 ? '' : 's'}
            </span>
            <button
              onClick={() => onDeleteTeam?.(team.id)}
              className="rounded-full border border-red-200 dark:border-red-800 p-1.5 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Delete team"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {team.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {team.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                {tag}
              </span>
            ))}
          </div>
        )}

        {workflows.length > 0 && (
          <div className="mt-3 rounded-md border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-900/10 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
              Workflows ({workflows.length})
            </div>
            <div className="mt-2 space-y-2">
              {workflows.map((workflow) => {
                const latestOutput = latestWorkflowOutputs.get(workflow.id)
                return (
                <div
                  key={workflow.id}
                  className="rounded border border-sky-200 dark:border-sky-700 bg-white/80 dark:bg-gray-900/40 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => onNavigateToWorkflow?.(workflow.id)}
                      className="text-left text-sm font-medium text-sky-900 hover:text-sky-700 hover:underline dark:text-sky-200 dark:hover:text-sky-100"
                    >
                      {workflow.name}
                    </button>
                    <span className="text-[11px] font-mono text-sky-700 dark:text-sky-300">{workflow.schedule === 'manual' ? 'Manual' : workflow.schedule}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-sky-700 dark:text-sky-300">
                    {workflow.owner && <span>Owner: {workflow.owner}</span>}
                    <span>{workflow.participantCount} participant{workflow.participantCount === 1 ? '' : 's'}</span>
                  </div>
                  {latestOutput && (
                    <div className="mt-2 rounded border border-sky-200 dark:border-sky-700 bg-sky-50/80 dark:bg-sky-900/20 p-2 text-[11px] text-sky-800 dark:text-sky-200">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">
                          Latest Output
                          {latestOutput.outputLabel ? `: ${latestOutput.outputLabel}` : ''}
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${WORKFLOW_OUTPUT_STATUS_BADGE[latestOutput.status]}`}>
                          {latestOutput.status}
                        </span>
                      </div>
                      {latestOutput.summary && (
                        <div className="mt-1 line-clamp-3 text-xs">{latestOutput.summary}</div>
                      )}
                      {latestOutput.artifactPath && (
                        <div className="mt-2 text-[11px] font-mono text-sky-700 dark:text-sky-300 break-all">
                          {latestOutput.artifactPath}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {latestOutput.artifactPath && onNavigateToDoc && (
                          <button
                            onClick={() => onNavigateToDoc(latestOutput.artifactPath!)}
                            className="rounded border border-sky-300 dark:border-sky-700 px-2 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/30"
                          >
                            Open Output File
                          </button>
                        )}
                        <button
                          onClick={() => onNavigateToWorkflow?.(workflow.id)}
                          className="rounded border border-sky-300 dark:border-sky-700 px-2 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/30"
                        >
                          Open Workflow
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )})}
            </div>
          </div>
        )}
      </div>

      {children.length > 0 && (
        <div className="space-y-3">
          {children.map((child) => (
            <TeamTreeNode
              key={child.id}
              team={child}
              depth={depth + 1}
              teamChildren={teamChildren}
              teamWorkflows={teamWorkflows}
              latestWorkflowOutputs={latestWorkflowOutputs}
              agentNameById={agentNameById}
              onNavigateToAgent={onNavigateToAgent}
              onNavigateToWorkflow={onNavigateToWorkflow}
              onNavigateToDoc={onNavigateToDoc}
              onDeleteTeam={onDeleteTeam}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OrgChartNode({
  team,
  teamChildren,
  teamWorkflows,
  latestWorkflowOutputs,
  agentNameById,
  onNavigateToAgent,
  onNavigateToWorkflow,
  onDeleteTeam,
}: {
  team: Team
  teamChildren: Map<string, Team[]>
  teamWorkflows: Map<string, Workflow[]>
  latestWorkflowOutputs: Map<string, WorkflowExecutionOutputSummary>
  agentNameById: Record<string, string>
  onNavigateToAgent?: (agentId: string) => void
  onNavigateToWorkflow?: (workflowId: string) => void
  onDeleteTeam?: (teamId: string) => void
}) {
  const children = teamChildren.get(team.id) || []
  const workflows = teamWorkflows.get(team.id) || []
  const leaderLabel = team.leaderAgentId ? (agentNameById[team.leaderAgentId] || team.leaderAgentId) : null

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm px-4 py-3">
        <div className="text-[11px] font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {team.id}
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {team.name}
        </div>
        {leaderLabel && team.leaderAgentId && (
          <button
            onClick={() => onNavigateToAgent?.(team.leaderAgentId!)}
            className="mt-2 inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Lead: {leaderLabel}
          </button>
        )}
        {team.purpose && (
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-400">
            {team.purpose}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] text-slate-600 dark:text-slate-300">
            {team.memberAgentIds.length} members
          </span>
          <button
            onClick={() => onDeleteTeam?.(team.id)}
            className="rounded-full border border-red-200 dark:border-red-800 p-1 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Delete team"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          {workflows.map((workflow) => {
            const output = latestWorkflowOutputs.get(workflow.id)
            return (
              <button
                key={workflow.id}
                onClick={() => onNavigateToWorkflow?.(workflow.id)}
                className="rounded-full border border-sky-200 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20 px-2 py-0.5 text-[10px] text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors"
                title={output?.summary || workflow.description}
              >
                {workflow.name}
              </button>
            )
          })}
        </div>
      </div>

      {children.length > 0 && (
        <>
          <div className="h-7 w-0.5 bg-slate-500 dark:bg-slate-500" />
          <div className="w-full max-w-5xl border-t-2 border-slate-500 dark:border-slate-500" />
          <div className="grid w-full gap-6 pt-6" style={{ gridTemplateColumns: `repeat(${children.length}, minmax(220px, 1fr))` }}>
            {children.map((child) => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="h-7 w-0.5 bg-slate-500 dark:bg-slate-500" />
                <OrgChartNode
                  team={child}
                  teamChildren={teamChildren}
                  teamWorkflows={teamWorkflows}
                  latestWorkflowOutputs={latestWorkflowOutputs}
                  agentNameById={agentNameById}
                  onNavigateToAgent={onNavigateToAgent}
                  onNavigateToWorkflow={onNavigateToWorkflow}
                  onDeleteTeam={onDeleteTeam}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function getOrgMetaStorageKey(workspaceId?: string | null) {
  return `org-meta:${workspaceId || 'default'}`
}

export default function Organizations({ onNavigateToAgent, onNavigateToWorkflow, onNavigateToGroup, onNavigateToDoc, initialCommunityName, initialGroupName, isActive = true }: OrganizationsProps) {
  const { activeWorkspace } = useWorkspace()
  const [agents, setAgents] = useState<Agent[]>([])
  const [workspaceCommunities, setWorkspaceCommunities] = useState<any[]>([])
  const [workspaceGroups, setWorkspaceGroups] = useState<any[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [allWorkflows, setAllWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCommunities, setExpandedCommunities] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [highlightedCommunity, setHighlightedCommunity] = useState<string | null>(null)
  const [highlightedGroup, setHighlightedGroup] = useState<string | null>(null)
  const communityRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const groupRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [communityWorkflows, setCommunityWorkflows] = useState<Map<string, Workflow[]>>(new Map())
  const [groupWorkflows, setGroupWorkflows] = useState<Map<string, Workflow[]>>(new Map())
  const [latestWorkflowOutputs, setLatestWorkflowOutputs] = useState<Map<string, WorkflowExecutionOutputSummary>>(new Map())
  const [communitiesSectionCollapsed, setCommunitiesSectionCollapsed] = useState(false)
  const [groupsSectionCollapsed, setGroupsSectionCollapsed] = useState(false)
  const [teamsSectionCollapsed, setTeamsSectionCollapsed] = useState(false)
  const [organizationViewMode, setOrganizationViewMode] = useState<OrganizationViewMode>(() => {
    if (typeof window === 'undefined') return 'structure'
    const saved = localStorage.getItem('organizations-view-mode')
    return saved === 'org-chart' ? 'org-chart' : 'structure'
  })
  const [orgChartZoom, setOrgChartZoom] = useState(1)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [orgName, setOrgName] = useState('Workspace Org')
  const [orgDescription, setOrgDescription] = useState('Describe this workspace organization')
  const [editingOrg, setEditingOrg] = useState(false)
  const [orgDraftName, setOrgDraftName] = useState('')
  const [orgDraftDescription, setOrgDraftDescription] = useState('')
  const [showCreateCommunity, setShowCreateCommunity] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [newCommunityName, setNewCommunityName] = useState('')
  const [newCommunityDesc, setNewCommunityDesc] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [newGroupCommunity, setNewGroupCommunity] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{
    type: 'community' | 'group' | 'team'
    name: string
    consequences: string[]
  } | null>(null)
  const [finalDeleteDialog, setFinalDeleteDialog] = useState<{
    type: 'community'
    name: string
    consequences: string[]
  } | null>(null)
  const [renameCommunityTarget, setRenameCommunityTarget] = useState<Community | null>(null)
  const [renameGroupTarget, setRenameGroupTarget] = useState<Group | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('organizations-view-mode', organizationViewMode)
  }, [organizationViewMode])

  useEffect(() => {
    if (organizationViewMode !== 'org-chart') return
    setCommunitiesSectionCollapsed(true)
    setGroupsSectionCollapsed(true)
  }, [organizationViewMode])

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    const suggestedName = activeWorkspace?.name?.trim() ? `${activeWorkspace.name} Org` : 'Workspace Org'
    let nextName = suggestedName
    let nextDescription = 'Describe this workspace organization'

    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(getOrgMetaStorageKey(activeWorkspace?.id))
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (typeof parsed?.name === 'string' && parsed.name.trim()) nextName = parsed.name.trim()
          if (typeof parsed?.description === 'string' && parsed.description.trim()) nextDescription = parsed.description.trim()
        } catch {}
      }
    }

    setOrgName(nextName)
    setOrgDescription(nextDescription)
    setOrgDraftName(nextName)
    setOrgDraftDescription(nextDescription)
  }, [activeWorkspace?.id, activeWorkspace?.name])

  const saveOrgMeta = () => {
    const nextName = orgDraftName.trim() || (activeWorkspace?.name?.trim() ? `${activeWorkspace.name} Org` : 'Workspace Org')
    const nextDescription = orgDraftDescription.trim() || 'Describe this workspace organization'
    if (typeof window !== 'undefined') {
      localStorage.setItem(getOrgMetaStorageKey(activeWorkspace?.id), JSON.stringify({
        name: nextName,
        description: nextDescription,
      }))
    }
    setOrgName(nextName)
    setOrgDescription(nextDescription)
    setEditingOrg(false)
    showToast('Organization details updated', 'success')
  }

  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, communitiesRes, groupsRes, teamsRes, workflowsRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/communities'),
        fetch('/api/groups'),
        fetch('/api/teams'),
        fetch('/api/workflows'),
      ])

      const agentsData = await agentsRes.json()
      const communitiesData = await communitiesRes.json()
      const groupsData = await groupsRes.json()
      const teamsData = await teamsRes.json().catch(() => ({ teams: [] }))
      const workflowsData = await workflowsRes.json().catch(() => ({ workflows: [] }))

      setAgents(agentsData.agents || [])
      setWorkspaceCommunities(communitiesData.communities || [])
      setWorkspaceGroups(groupsData.groups || [])
      setTeams(Array.isArray(teamsData.teams) ? teamsData.teams : [])
      setAllWorkflows(Array.isArray(workflowsData.workflows) ? workflowsData.workflows : [])
      setLoading(false)
    } catch (err) {
      console.error('Failed to fetch data:', err)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isActive) return
    if (!loading && agents.length > 0) return
    fetchData()
  }, [fetchData, isActive, loading, agents.length])

  useEffect(() => {
    const handleWorkspaceUpdate = () => fetchData()
    window.addEventListener('channels-updated', handleWorkspaceUpdate)
    window.addEventListener('agents-updated', handleWorkspaceUpdate)
    window.addEventListener('workflows-updated', handleWorkspaceUpdate)
    return () => {
      window.removeEventListener('channels-updated', handleWorkspaceUpdate)
      window.removeEventListener('agents-updated', handleWorkspaceUpdate)
      window.removeEventListener('workflows-updated', handleWorkspaceUpdate)
    }
  }, [fetchData])

  // Build communities and groups from workspace + agents (exclude archived agents)
  const { communities, groups } = useMemo(() => {
    const communityMap = new Map<string, Community>()
    const groupMap = new Map<string, Group>()
    const activeAgents = agents.filter((a: any) => !a.archived)

    // First, add workspace-level communities (from ORG/COMMUNITIES.md)
    for (const c of workspaceCommunities) {
      if (!communityMap.has(c.name)) {
        communityMap.set(c.name, {
          name: c.name,
          description: c.description,
          tags: c.tags || [],
          channels: c.channels || [],
          members: []
        })
      }
    }

    // First, add workspace-level groups (from ORG/GROUPS.md)
    for (const g of workspaceGroups) {
      if (!groupMap.has(g.name)) {
        groupMap.set(g.name, {
          name: g.name,
          description: g.description,
          tags: g.tags || [],
          channels: g.channels || [],
          community: g.community,
          members: []
        })
      }
    }

    // Extract communities
    for (const agent of activeAgents) {
      for (const c of agent.communities || []) {
        if (!communityMap.has(c.name)) {
          communityMap.set(c.name, {
            name: c.name,
            description: c.description,
            tags: c.tags,
            channels: c.channels,
            members: []
          })
        }
        communityMap.get(c.name)!.members.push(agent)
      }
    }

    // Extract groups
    for (const agent of activeAgents) {
      for (const g of agent.groups) {
        if (!groupMap.has(g.name)) {
          groupMap.set(g.name, {
            name: g.name,
            description: g.description,
            tags: g.tags,
            channels: g.channels,
            community: g.community,
            members: []
          })
        }
        groupMap.get(g.name)!.members.push(agent)
      }
    }

    return {
      communities: Array.from(communityMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      groups: Array.from(groupMap.values()).sort((a, b) => a.name.localeCompare(b.name))
    }
  }, [agents, workspaceCommunities, workspaceGroups])

  // Filter communities, groups, and check if agents match search query
  const filteredCommunities = useMemo(() => {
    if (!searchQuery.trim()) return communities
    const query = searchQuery.toLowerCase()
    return communities.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.description?.toLowerCase().includes(query) ||
      c.tags.some(t => t.toLowerCase().includes(query)) ||
      c.members.some(m => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query))
    )
  }, [communities, searchQuery])

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups
    const query = searchQuery.toLowerCase()
    return groups.filter(g =>
      g.name.toLowerCase().includes(query) ||
      g.description?.toLowerCase().includes(query) ||
      g.tags.some(t => t.toLowerCase().includes(query)) ||
      g.community?.toLowerCase().includes(query) ||
      g.members.some(m => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query))
    )
  }, [groups, searchQuery])

  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) return teams
    const query = searchQuery.toLowerCase()
    return teams.filter((team) =>
      team.name.toLowerCase().includes(query) ||
      team.id.toLowerCase().includes(query) ||
      team.purpose?.toLowerCase().includes(query) ||
      team.leaderAgentId?.toLowerCase().includes(query) ||
      team.memberAgentIds.some((memberId) => memberId.toLowerCase().includes(query)) ||
      team.tags.some((tag) => tag.toLowerCase().includes(query))
    )
  }, [teams, searchQuery])

  const teamChildren = useMemo(() => {
    const map = new Map<string, Team[]>()
    filteredTeams.forEach((team) => {
      const key = team.parentTeamId || '__root__'
      const list = map.get(key) || []
      list.push(team)
      map.set(key, list)
    })
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [filteredTeams])
  const teamWorkflows = useMemo(() => {
    const workflowsByTeam = new Map<string, Workflow[]>()
    const teamMembership = filteredTeams.map((team) => ({
      team,
      agentIds: new Set([team.leaderAgentId, ...(team.memberAgentIds || [])].filter(Boolean) as string[]),
    }))
    const groupNameToTeamIds = new Map<string, string[]>()
    for (const team of filteredTeams) {
      for (const key of [team.name.toLowerCase(), team.id.toLowerCase()]) {
        groupNameToTeamIds.set(key, [...(groupNameToTeamIds.get(key) || []), team.id])
      }
    }
    for (const workflow of allWorkflows) {
      const owner = workflow.owner?.toLowerCase()
      const targetedAgents = new Set((workflow.targeting?.agents || []).map((agentId) => agentId.toLowerCase()))
      const ownerMatchedTeam = owner
        ? teamMembership.find(({ agentIds }) => Array.from(agentIds).some((agentId) => agentId.toLowerCase() === owner))
        : undefined
      const targetedMatchedTeam = teamMembership.find(({ agentIds }) =>
        Array.from(agentIds).some((agentId) => targetedAgents.has(agentId.toLowerCase()))
      )
      const fallbackGroupMatch = (workflow.targeting?.groups || [])
        .flatMap((groupName) => groupNameToTeamIds.get(groupName.toLowerCase()) || [])
        .find(Boolean)
      const teamId = ownerMatchedTeam?.team.id || targetedMatchedTeam?.team.id || fallbackGroupMatch
      if (!teamId) continue
      workflowsByTeam.set(teamId, [...(workflowsByTeam.get(teamId) || []), workflow])
    }
    for (const workflows of workflowsByTeam.values()) {
      workflows.sort((a, b) => a.name.localeCompare(b.name))
    }
    return workflowsByTeam
  }, [allWorkflows, filteredTeams])

  useEffect(() => {
    if (!isActive) return
    const workflowIds = Array.from(new Set(Array.from(teamWorkflows.values()).flat().map((workflow) => workflow.id)))
    const missingIds = workflowIds.filter((id) => !latestWorkflowOutputs.has(id))
    if (missingIds.length === 0) return

    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(missingIds.map(async (workflowId) => {
        try {
          const executionsResp = await fetch(`/api/workflows/${workflowId}/executions?limit=1`)
          if (!executionsResp.ok) return null
          const executionsData = await executionsResp.json()
          const latestExecution = executionsData.executions?.[0]
          if (!latestExecution?.id) return [workflowId, { status: latestExecution?.status || 'completed' }] as const

          const detailResp = await fetch(`/api/workflows/${workflowId}/executions/${latestExecution.id}`)
          if (!detailResp.ok) return [workflowId, { status: latestExecution.status || 'completed' }] as const
          const detail = await detailResp.json()
          const outputs = detail?.outputs && typeof detail.outputs === 'object' ? Object.entries(detail.outputs) : []
          const firstOutput = outputs[0] as [string, any] | undefined
          const outputValue = typeof firstOutput?.[1]?.summary === 'string'
            ? firstOutput[1].summary
            : typeof firstOutput?.[1]?.value === 'string'
              ? firstOutput[1].value
              : undefined
          return [workflowId, {
            status: detail.status || latestExecution.status || 'completed',
            outputLabel: firstOutput?.[0],
            summary: outputValue ? `${outputValue}`.slice(0, 220) : undefined,
            artifactPath: typeof firstOutput?.[1]?.artifactPath === 'string' ? firstOutput[1].artifactPath : undefined,
          }] as const
        } catch {
          return null
        }
      }))

      if (cancelled) return
      setLatestWorkflowOutputs((prev) => {
        const next = new Map(prev)
        for (const entry of entries) {
          if (!entry) continue
          next.set(entry[0], entry[1])
        }
        return next
      })
    })()

    return () => {
      cancelled = true
    }
  }, [isActive, teamWorkflows, latestWorkflowOutputs])

  const agentNameById = useMemo(
    () => Object.fromEntries(agents.map((agent) => [agent.id, agent.name])) as Record<string, string>,
    [agents]
  )

  // Filter agents based on search query (exclude archived)
  const filteredAgents = useMemo(() => {
    const activeAgents = agents.filter((a: any) => !a.archived)
    if (!searchQuery.trim()) return activeAgents
    const query = searchQuery.toLowerCase()
    return activeAgents.filter(a =>
      a.name.toLowerCase().includes(query) ||
      a.id.toLowerCase().includes(query)
    )
  }, [agents, searchQuery])

  // Count total matching agents across all filtered communities and groups
  const matchingAgentsCount = useMemo(() => {
    if (!searchQuery.trim()) return 0
    const query = searchQuery.toLowerCase()
    const agentSet = new Set<string>()

    filteredCommunities.forEach(c => {
      c.members.forEach(m => {
        if (m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)) {
          agentSet.add(m.id)
        }
      })
    })

    filteredGroups.forEach(g => {
      g.members.forEach(m => {
        if (m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)) {
          agentSet.add(m.id)
        }
      })
    })

    return agentSet.size
  }, [filteredCommunities, filteredGroups, searchQuery])

  const fetchCommunityWorkflows = useCallback(async (name: string) => {
    // Skip if already fetched
    if (communityWorkflows.has(name)) return

    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(name)}/workflows`)
      if (response.ok) {
        const data = await response.json()
        setCommunityWorkflows(prev => new Map(prev).set(name, data.workflows || []))
      }
    } catch (err) {
      console.error('Failed to fetch community workflows:', err)
    }
  }, [communityWorkflows])

  const fetchGroupWorkflows = useCallback(async (name: string) => {
    // Skip if already fetched
    if (groupWorkflows.has(name)) return

    try {
      const response = await fetch(`/api/groups/${encodeURIComponent(name)}/workflows`)
      if (response.ok) {
        const data = await response.json()
        setGroupWorkflows(prev => new Map(prev).set(name, data.workflows || []))
      }
    } catch (err) {
      console.error('Failed to fetch group workflows:', err)
    }
  }, [groupWorkflows])

  const toggleCommunity = async (name: string) => {
    const isExpanding = !expandedCommunities.has(name)
    setExpandedCommunities(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

    // Fetch workflows when expanding
    if (isExpanding) {
      fetchCommunityWorkflows(name)
    }
  }

  const toggleGroup = async (name: string) => {
    const isExpanding = !expandedGroups.has(name)
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

    // Fetch workflows when expanding
    if (isExpanding) {
      fetchGroupWorkflows(name)
    }
  }

  // Fetch workflows for all communities and groups on initial load
  useEffect(() => {
    if (communities.length > 0) {
      communities.forEach(community => {
        fetchCommunityWorkflows(community.name)
      })
    }
  }, [communities, fetchCommunityWorkflows])

  useEffect(() => {
    if (groups.length > 0) {
      groups.forEach(group => {
        fetchGroupWorkflows(group.name)
      })
    }
  }, [groups, fetchGroupWorkflows])

  // Handle initial community/group highlighting
  useEffect(() => {
    if (initialCommunityName && communities.length > 0) {
      const community = communities.find(c => c.name === initialCommunityName)
      if (community) {
        setExpandedCommunities(prev => new Set(prev).add(initialCommunityName))
        setHighlightedCommunity(initialCommunityName)
        setTimeout(() => setHighlightedCommunity(null), 2000)

        // Scroll to the community after a brief delay to ensure it's rendered
        setTimeout(() => {
          const element = communityRefs.current.get(initialCommunityName)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 100)
      }
    }
  }, [initialCommunityName, communities])

  useEffect(() => {
    if (initialGroupName && groups.length > 0) {
      const group = groups.find(g => g.name === initialGroupName)
      if (group) {
        setExpandedGroups(prev => new Set(prev).add(initialGroupName))
        setHighlightedGroup(initialGroupName)
        setTimeout(() => setHighlightedGroup(null), 2000)

        // Scroll to the group after a brief delay to ensure it's rendered
        setTimeout(() => {
          const element = groupRefs.current.get(initialGroupName)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 100)
      }
    }
  }, [initialGroupName, groups])

  const expandAll = () => {
    setExpandedCommunities(new Set(communities.map(c => c.name)))
    setExpandedGroups(new Set(groups.map(g => g.name)))
  }

  const collapseAll = () => {
    setExpandedCommunities(new Set())
    setExpandedGroups(new Set())
  }

  const handleCreateCommunity = async () => {
    if (!newCommunityName.trim()) return

    // Check for duplicate names
    if (communities.some(c => c.name.toLowerCase() === newCommunityName.trim().toLowerCase())) {
      showToast(`Community "${newCommunityName}" already exists`, 'error')
      return
    }

    try {
      const response = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCommunityName.trim(),
          description: newCommunityDesc.trim() || undefined,
          channels: ['whatsapp']
        })
      })

      if (response.ok) {
        setShowCreateCommunity(false)
        setNewCommunityName('')
        setNewCommunityDesc('')
        showToast(`Community "${newCommunityName}" created successfully`, 'success')
        window.dispatchEvent(new CustomEvent('channels-updated'))
        fetchData()
      } else {
        showToast('Failed to create community', 'error')
      }
    } catch (err) {
      console.error('Error creating community:', err)
      showToast('Failed to create community', 'error')
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return

    // Check for duplicate names
    if (groups.some(g => g.name.toLowerCase() === newGroupName.trim().toLowerCase())) {
      showToast(`Group "${newGroupName}" already exists`, 'error')
      return
    }

    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim() || undefined,
          community: newGroupCommunity.trim() || undefined,
          channels: ['whatsapp']
        })
      })

      if (response.ok) {
        setShowCreateGroup(false)
        setNewGroupName('')
        setNewGroupDesc('')
        setNewGroupCommunity('')
        showToast(`Group "${newGroupName}" created successfully`, 'success')
        window.dispatchEvent(new CustomEvent('channels-updated'))
        fetchData()
      } else {
        showToast('Failed to create group', 'error')
      }
    } catch (err) {
      console.error('Error creating group:', err)
      showToast('Failed to create group', 'error')
    }
  }

  const handleDeleteCommunity = (communityName: string) => {
    const community = communities.find(c => c.name === communityName)
    if (!community) return

    const consequences: string[] = []

    // Find groups in this community
    const communityGroups = groups.filter(g => g.community === communityName)
    if (communityGroups.length > 0) {
      consequences.push(`${communityGroups.length} group${communityGroups.length !== 1 ? 's' : ''} will lose their community reference`)
      communityGroups.forEach(g => {
        consequences.push(`  • ${g.name}`)
      })
    }

    // Find agents
    if (community.members.length > 0) {
      consequences.push(`${community.members.length} agent${community.members.length !== 1 ? 's' : ''} are members`)
      community.members.forEach(a => {
        consequences.push(`  • ${a.name}`)
      })
    }

    const impactedWorkflows = Array.from(new Set([
      ...(communityWorkflows.get(communityName) || []).map(w => w.name),
      ...groups
        .filter(g => g.community === communityName)
        .flatMap(g => (groupWorkflows.get(g.name) || []).map(w => w.name)),
    ]))
    if (impactedWorkflows.length > 0) {
      consequences.push(`${impactedWorkflows.length} workflow${impactedWorkflows.length !== 1 ? 's' : ''} will also be deleted`)
      impactedWorkflows.slice(0, 8).forEach(name => {
        consequences.push(`  • ${name}`)
      })
    }

    consequences.push('Cascade delete removes linked groups, member agents, and related workflows for this community')

    setDeleteDialog({ type: 'community', name: communityName, consequences })
  }

  const handleDeleteGroup = (groupName: string) => {
    const group = groups.find(g => g.name === groupName)
    if (!group) return

    const consequences: string[] = []

    // Show community if exists
    if (group.community) {
      consequences.push(`Part of community: ${group.community}`)
    }

    // Find agents
    if (group.members.length > 0) {
      consequences.push(`${group.members.length} agent${group.members.length !== 1 ? 's' : ''} are members`)
      group.members.forEach(a => {
        consequences.push(`  • ${a.name}`)
      })
    }

    setDeleteDialog({ type: 'group', name: groupName, consequences })
  }

  const handleDeleteTeam = (teamId: string) => {
    const team = teams.find((entry) => entry.id === teamId)
    if (!team) return

    const consequences: string[] = []
    const childTeams = teams.filter((entry) => entry.parentTeamId === teamId)
    const workflows = teamWorkflows.get(teamId) || []

    if (team.parentTeamId) {
      consequences.push(`Reports to team: ${team.parentTeamId}`)
    }
    if (childTeams.length > 0) {
      consequences.push(`${childTeams.length} child team${childTeams.length !== 1 ? 's' : ''} will be re-parented to the root`)
      childTeams.forEach((child) => {
        consequences.push(`  • ${child.name} (${child.id})`)
      })
    }
    if (team.memberAgentIds.length > 0) {
      consequences.push(`${team.memberAgentIds.length} agent${team.memberAgentIds.length !== 1 ? 's' : ''} remain in the workspace`)
    }
    if (workflows.length > 0) {
      consequences.push(`${workflows.length} workflow${workflows.length !== 1 ? 's' : ''} remain, but lose this team attachment`)
      workflows.forEach((workflow) => {
        consequences.push(`  • ${workflow.name}`)
      })
    }
    consequences.push('This removes only the team record from the organization structure')

    setDeleteDialog({ type: 'team', name: teamId, consequences })
  }

  const confirmDelete = async () => {
    if (!deleteDialog) return

    const { type, name } = deleteDialog
    if (type === 'community') {
      setFinalDeleteDialog({ type, name, consequences: deleteDialog.consequences })
      setDeleteDialog(null)
      return
    }

    const endpoint = type === 'group'
      ? `/api/groups/${encodeURIComponent(name)}`
      : `/api/teams/${encodeURIComponent(name)}`

    try {
      const response = await fetch(endpoint, {
        method: 'DELETE'
      })

      if (response.ok) {
        showToast(`${type === 'group' ? 'Group' : 'Team'} "${name}" deleted`, 'success')
        setDeleteDialog(null)
        window.dispatchEvent(new CustomEvent('channels-updated'))
        window.dispatchEvent(new CustomEvent('agents-updated'))
        window.dispatchEvent(new CustomEvent('workflows-updated'))
        fetchData()
      } else {
        showToast(`Failed to delete ${type}`, 'error')
      }
    } catch (err) {
      console.error(`Error deleting ${type}:`, err)
      showToast(`Failed to delete ${type}`, 'error')
    }
  }

  const confirmFinalDelete = async () => {
    if (!finalDeleteDialog) return

    const { type, name } = finalDeleteDialog
    const endpoint = `/api/communities/${encodeURIComponent(name)}?cascade=1`

    try {
      const response = await fetch(endpoint, {
        method: 'DELETE'
      })

      if (response.ok) {
        showToast(`${type === 'community' ? 'Community' : 'Group'} "${name}" deleted`, 'success')
        setFinalDeleteDialog(null)
        window.dispatchEvent(new CustomEvent('channels-updated'))
        window.dispatchEvent(new CustomEvent('agents-updated'))
        window.dispatchEvent(new CustomEvent('workflows-updated'))
        fetchData()
      } else {
        const error = await response.json().catch(() => ({}))
        const remaining = error?.remaining
        const detail = remaining
          ? [
              remaining.community ? `community ${remaining.community}` : null,
              Array.isArray(remaining.groups) && remaining.groups.length > 0 ? `${remaining.groups.length} groups` : null,
              Array.isArray(remaining.agents) && remaining.agents.length > 0 ? `${remaining.agents.length} agents` : null,
              Array.isArray(remaining.workflows) && remaining.workflows.length > 0 ? `${remaining.workflows.length} workflows` : null,
            ].filter(Boolean).join(', ')
          : null
        showToast(detail ? `Cascade delete incomplete: ${detail} remain` : `Failed to delete ${type}`, 'error')
      }
    } catch (err) {
      console.error(`Error deleting ${type}:`, err)
      showToast(`Failed to delete ${type}`, 'error')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Organization Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {agents.length} agent{agents.length !== 1 ? 's' : ''}
            <span className="text-gray-300 mx-1.5">•</span>
            {communities.length} communit{communities.length !== 1 ? 'ies' : 'y'}
            <span className="text-gray-300 mx-1.5">•</span>
            {groups.length} group{groups.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
            <button
              onClick={() => setOrganizationViewMode('structure')}
              className={`px-3 py-2 text-sm transition-colors ${
                organizationViewMode === 'structure'
                  ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
              title="Structure view"
            >
              ☰
            </button>
            <button
              onClick={() => setOrganizationViewMode('org-chart')}
              className={`px-3 py-2 text-sm border-l border-gray-200 dark:border-gray-700 transition-colors ${
                organizationViewMode === 'org-chart'
                  ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
              title="Org chart view"
            >
              ◇
            </button>
          </div>
          <button
            onClick={expandAll}
            className="text-sm font-medium text-sky-600 hover:text-sky-800 transition-colors"
          >
            ▼ Expand All
          </button>
          <button
            onClick={collapseAll}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors dark:text-gray-200"
          >
            ▶ Collapse All
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            disabled={agents.length === 0}
            className={`px-4 py-2 text-sm rounded transition-colors ${
              agents.length === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-sky-600 text-white hover:bg-sky-700'
            }`}
            title={agents.length === 0 ? 'No agents to export' : 'Export organization as template'}
          >
            📦 Export as Template
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search communities, groups, tags, agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent dark:border-gray-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="mt-2 text-xs text-gray-500">
            Showing {filteredCommunities.length} {filteredCommunities.length !== 1 ? 'communities' : 'community'}
            {' • '}
            {filteredGroups.length} {filteredGroups.length !== 1 ? 'groups' : 'group'}
            {matchingAgentsCount > 0 && (
              <>
                {' • '}
                {matchingAgentsCount} {matchingAgentsCount !== 1 ? 'agents' : 'agent'}
              </>
            )}
          </div>
        )}
      </div>

      {loading && <PageLoading text="Loading organization data..." />}

      {!loading && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <span className="text-4xl mb-4">🏢</span>
          <p className="text-sm">No agents found</p>
          <p className="text-xs mt-1 text-gray-300">Add agents to see organization structure</p>
        </div>
      )}

      {!loading && agents.length > 0 && (
        <div className="space-y-6">
          {/* Organization Info */}
          <div className="bg-gradient-to-r from-sky-50 to-purple-50 dark:from-sky-900/20 dark:to-purple-900/20 rounded-lg border border-sky-200 dark:border-sky-700 shadow-sm p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🏢</span>
                  {editingOrg ? (
                    <input
                      type="text"
                      value={orgDraftName}
                      onChange={(e) => setOrgDraftName(e.target.value)}
                      className="min-w-0 flex-1 px-3 py-1.5 border border-sky-300 dark:border-sky-700 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-600 text-sm font-bold bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                      placeholder={activeWorkspace?.name?.trim() ? `${activeWorkspace.name} Org` : 'Workspace Org'}
                    />
                  ) : (
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{orgName}</h2>
                  )}
                  <button
                    onClick={() => {
                      if (editingOrg) {
                        saveOrgMeta()
                      } else {
                        setEditingOrg(true)
                      }
                    }}
                    className="text-sm text-sky-600 hover:text-sky-800 ml-2"
                  >
                    {editingOrg ? '✓ Done' : '✏️ Edit'}
                  </button>
                </div>
                {editingOrg ? (
                  <textarea
                    value={orgDraftDescription}
                    onChange={(e) => setOrgDraftDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-sky-300 dark:border-sky-700 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-600 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    rows={2}
                    placeholder="Describe your organization..."
                  />
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{orgDescription}</p>
                )}
              </div>
            </div>
          </div>

          {teams.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 shadow-sm dark:border-gray-700">
              <div className="px-4 py-3 border-b border-gray-200 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-between dark:border-gray-700">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setTeamsSectionCollapsed(!teamsSectionCollapsed)}>
                  <span className="text-sm">{teamsSectionCollapsed ? '▶' : '▼'}</span>
                  <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                    🏢 Company Structure ({teams.length})
                  </h2>
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  {filteredTeams.filter((team) => !team.parentTeamId).length} top-level · {filteredTeams.filter((team) => !!team.parentTeamId).length} nested
                </div>
              </div>
              {!teamsSectionCollapsed && (
                <div className="p-4">
                  <div className="mb-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/10 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-400">Top Level</div>
                      <div className="mt-1 text-2xl font-semibold text-amber-950 dark:text-amber-200">{filteredTeams.filter((team) => !team.parentTeamId).length}</div>
                    </div>
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/10 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-400">Nested Teams</div>
                      <div className="mt-1 text-2xl font-semibold text-amber-950 dark:text-amber-200">{filteredTeams.filter((team) => !!team.parentTeamId).length}</div>
                    </div>
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/10 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-400">Leaders</div>
                      <div className="mt-1 text-2xl font-semibold text-amber-950 dark:text-amber-200">{new Set(filteredTeams.map((team) => team.leaderAgentId).filter(Boolean)).size}</div>
                    </div>
                  </div>

                  {organizationViewMode === 'structure' ? (
                    <div className="space-y-3">
                      {(teamChildren.get('__root__') || []).map((team) => (
                        <TeamTreeNode
                          key={team.id}
                          team={team}
                          depth={0}
                          teamChildren={teamChildren}
                          teamWorkflows={teamWorkflows}
                          latestWorkflowOutputs={latestWorkflowOutputs}
                          agentNameById={agentNameById}
                          onNavigateToAgent={onNavigateToAgent}
                          onNavigateToWorkflow={onNavigateToWorkflow}
                          onNavigateToDoc={onNavigateToDoc}
                          onDeleteTeam={handleDeleteTeam}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      className="relative overflow-auto pb-2"
                      onWheel={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          e.preventDefault()
                          setOrgChartZoom((zoom) => Math.max(0.25, Math.min(2, zoom - e.deltaY * 0.002)))
                        }
                      }}
                    >
                      <div className="absolute top-2 right-2 z-20 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-1 py-0.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <button
                          onClick={() => setOrgChartZoom((zoom) => Math.max(0.25, zoom - 0.15))}
                          className="flex h-6 w-6 items-center justify-center text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          −
                        </button>
                        <span className="w-10 text-center text-[10px] text-gray-400">{Math.round(orgChartZoom * 100)}%</span>
                        <button
                          onClick={() => setOrgChartZoom((zoom) => Math.min(2, zoom + 0.15))}
                          className="flex h-6 w-6 items-center justify-center text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          +
                        </button>
                        {orgChartZoom !== 1 && (
                          <button
                            onClick={() => setOrgChartZoom(1)}
                            className="px-1 text-[10px] text-sky-500 hover:text-sky-700"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      <div
                        style={{
                          transform: `scale(${orgChartZoom})`,
                          transformOrigin: 'top left',
                          minWidth: orgChartZoom < 1 ? `${100 / orgChartZoom}%` : undefined,
                        }}
                      >
                        <div className="min-w-max px-6">
                          <div className="flex flex-col items-center gap-8">
                            {(teamChildren.get('__root__') || []).map((team) => (
                              <OrgChartNode
                                key={team.id}
                                team={team}
                                teamChildren={teamChildren}
                                teamWorkflows={teamWorkflows}
                                latestWorkflowOutputs={latestWorkflowOutputs}
                                agentNameById={agentNameById}
                                onNavigateToAgent={onNavigateToAgent}
                                onNavigateToWorkflow={onNavigateToWorkflow}
                                onDeleteTeam={handleDeleteTeam}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* All Agents */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 shadow-sm dark:border-gray-700">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                🤖 All Agents ({agents.length})
              </h2>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap gap-2">
                {filteredAgents.sort((a, b) => a.name.localeCompare(b.name)).map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => onNavigateToAgent?.(agent.id)}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-gray-200 bg-gray-50 font-medium hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer dark:border-gray-700 dark:bg-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700"
                    title={`Go to ${agent.name} in Agents page`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                    {agent.name}
                    <span className="text-gray-400">({agent.id})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Communities */}
          {communities.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 shadow-sm dark:border-gray-700">
              <div className="px-4 py-3 border-b border-gray-200 bg-purple-50 dark:bg-purple-900/30 flex items-center justify-between dark:border-gray-700">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCommunitiesSectionCollapsed(!communitiesSectionCollapsed)}>
                  <span className="text-sm">{communitiesSectionCollapsed ? '▶' : '▼'}</span>
                  <h2 className="text-sm font-semibold text-purple-800 dark:text-purple-400">
                    🏘 Communities ({communities.length})
                  </h2>
                </div>
                <button
                  onClick={() => setShowCreateCommunity(true)}
                  className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                >
                  + Create Community
                </button>
              </div>
              {!communitiesSectionCollapsed && (
                <div className="divide-y divide-gray-100">
                {filteredCommunities.map(community => (
                  <div
                    key={community.name}
                    ref={(el) => {
                      if (el) communityRefs.current.set(community.name, el)
                      else communityRefs.current.delete(community.name)
                    }}
                    className={`p-4 group relative transition-all ${highlightedCommunity === community.name ? 'ring-2 ring-purple-400 bg-purple-50 rounded-lg' : ''}`}
                  >
                    <div className="flex items-start justify-between -m-4 p-4 rounded transition-colors">
                      <div
                        onClick={() => toggleCommunity(community.name)}
                        className="flex-1 cursor-pointer hover:bg-gray-50 -m-4 p-4 rounded dark:bg-gray-900 dark:hover:bg-gray-700"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">
                            {expandedCommunities.has(community.name) ? '▼' : '▶'}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onNavigateToGroup?.(community.name)
                            }}
                            className="font-semibold text-gray-900 text-sm hover:text-purple-600 hover:underline transition-colors dark:text-gray-100"
                            title="View chat in Communication page"
                          >
                            {community.name}
                          </button>
                          <span className="text-xs text-gray-400">
                            ({community.members.length} member{community.members.length !== 1 ? 's' : ''})
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onNavigateToGroup?.(community.name)
                            }}
                            className="text-xs text-purple-600 hover:text-purple-800 font-medium transition-colors ml-1"
                            title="View chat in Communication page"
                          >
                            💬
                          </button>
                        </div>
                        {community.description && (
                          <p className="text-xs text-gray-500 ml-6">{community.description}</p>
                        )}
                        {community.tags.length > 0 && (
                          <div className="flex gap-1 ml-6 mt-1">
                            {community.tags.map(tag => (
                              <span
                                key={tag}
                                className="text-xs px-1.5 py-0.5 rounded border bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-700"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rename button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenameCommunityTarget(community)
                      }}
                      className="absolute right-10 top-6 opacity-0 group-hover:opacity-100 p-1 text-purple-600 hover:bg-purple-50 rounded transition-all"
                      title="Rename community"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteCommunity(community.name)
                      }}
                      className="absolute right-2 top-6 opacity-0 group-hover:opacity-100 p-1 text-red-600 hover:bg-red-50 rounded transition-all"
                      title="Delete community"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>

                    {/* Community Workflows - Always show */}
                    {communityWorkflows.has(community.name) && (
                      <div className="ml-10 mt-3 pl-4 border-l-2 border-purple-200">
                        <div className="mb-2">
                          <h4 className="text-xs font-semibold text-purple-700 mb-1.5">
                            Workflows ({communityWorkflows.get(community.name)?.length || 0})
                          </h4>
                          <div className="space-y-2">
                            {(communityWorkflows.get(community.name) || []).sort((a, b) => a.name.localeCompare(b.name)).map(workflow => (
                              <div
                                key={workflow.id}
                                className="rounded border border-purple-200 bg-purple-50/80 p-2 dark:border-purple-700 dark:bg-purple-900/20"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <button
                                    onClick={() => onNavigateToWorkflow?.(workflow.id)}
                                    className="text-left text-xs font-semibold text-purple-800 hover:text-purple-900 hover:underline dark:text-purple-300"
                                    title={`Go to ${workflow.name} in Workflows page`}
                                  >
                                    {workflow.name}
                                  </button>
                                  <span className="rounded-full border border-purple-200 px-2 py-0.5 text-[10px] text-purple-700 dark:border-purple-700 dark:text-purple-300">
                                    {workflow.schedule === 'manual' ? 'Manual' : workflow.schedule}
                                  </span>
                                </div>
                                {latestWorkflowOutputs.get(workflow.id)?.summary && (
                                  <div className="mt-1 text-xs text-purple-900 dark:text-purple-100 line-clamp-3">
                                    {latestWorkflowOutputs.get(workflow.id)?.summary}
                                  </div>
                                )}
                                {latestWorkflowOutputs.get(workflow.id)?.artifactPath && (
                                  <div className="mt-2 text-[11px] font-mono text-purple-700 dark:text-purple-300 break-all">
                                    {latestWorkflowOutputs.get(workflow.id)?.artifactPath}
                                  </div>
                                )}
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {latestWorkflowOutputs.get(workflow.id)?.artifactPath && onNavigateToDoc && (
                                    <button
                                      onClick={() => onNavigateToDoc(latestWorkflowOutputs.get(workflow.id)!.artifactPath!)}
                                      className="rounded border border-purple-300 px-2 py-1 text-[11px] font-medium text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900/30"
                                    >
                                      Open Output File
                                    </button>
                                  )}
                                  <button
                                    onClick={() => onNavigateToWorkflow?.(workflow.id)}
                                    className="rounded border border-purple-300 px-2 py-1 text-[11px] font-medium text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900/30"
                                  >
                                    Open Workflow
                                  </button>
                                </div>
                              </div>
                            ))}
                            {(communityWorkflows.get(community.name)?.length === 0) && (
                              <span className="text-xs text-gray-400 italic">No workflows</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Community Members */}
                    {expandedCommunities.has(community.name) && (
                      <div className="ml-10 mt-3 pl-4 border-l-2 border-purple-200">
                        <div className="mb-2">
                          <h4 className="text-xs font-semibold text-purple-700 mb-1.5">
                            Members ({community.members.length})
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {community.members.sort((a, b) => a.name.localeCompare(b.name)).map(agent => (
                              <button
                                key={agent.id}
                                onClick={() => onNavigateToAgent?.(agent.id)}
                                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-purple-200 bg-purple-50 font-medium hover:bg-purple-100 hover:border-purple-300 transition-colors cursor-pointer dark:border-purple-700 dark:bg-purple-900/30 dark:hover:bg-purple-800/40 dark:hover:border-purple-600 dark:text-purple-300"
                                title={`Go to ${agent.name} in Agents page`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                                {agent.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                </div>
              )}
            </div>
          )}

          {/* Groups */}
          {groups.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 shadow-sm dark:border-gray-700">
              <div className="px-4 py-3 border-b border-gray-200 bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-between dark:border-gray-700">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setGroupsSectionCollapsed(!groupsSectionCollapsed)}>
                  <span className="text-sm">{groupsSectionCollapsed ? '▶' : '▼'}</span>
                  <h2 className="text-sm font-semibold text-indigo-800 dark:text-indigo-400">
                    👥 Groups ({groups.length})
                  </h2>
                </div>
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                >
                  + Create Group
                </button>
              </div>
              {!groupsSectionCollapsed && (
                <div className="divide-y divide-gray-100">
                {filteredGroups.map(group => (
                  <div
                    key={group.name}
                    ref={(el) => {
                      if (el) groupRefs.current.set(group.name, el)
                      else groupRefs.current.delete(group.name)
                    }}
                    className={`p-4 group relative transition-all ${highlightedGroup === group.name ? 'ring-2 ring-indigo-400 bg-indigo-50 rounded-lg' : ''}`}
                  >
                    <div className="flex items-start justify-between -m-4 p-4 rounded transition-colors">
                      <div
                        onClick={() => toggleGroup(group.name)}
                        className="flex-1 cursor-pointer hover:bg-gray-50 -m-4 p-4 rounded dark:bg-gray-900 dark:hover:bg-gray-700"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">
                            {expandedGroups.has(group.name) ? '▼' : '▶'}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onNavigateToGroup?.(group.name)
                            }}
                            className="font-semibold text-gray-900 text-sm hover:text-indigo-600 hover:underline transition-colors dark:text-gray-100"
                            title="View chat in Communication page"
                          >
                            {group.name}
                          </button>
                          <span className="text-xs text-gray-400">
                            ({group.members.length} member{group.members.length !== 1 ? 's' : ''})
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onNavigateToGroup?.(group.name)
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors ml-1"
                            title="View chat in Communication page"
                          >
                            💬
                          </button>
                          {group.community && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onNavigateToGroup?.(group.community!)
                              }}
                              className="text-xs text-purple-600 hover:text-purple-800 hover:underline transition-colors"
                              title="View community chat in Communication page"
                            >
                              → {group.community}
                            </button>
                          )}
                        </div>
                        {group.description && (
                          <p className="text-xs text-gray-500 ml-6">{group.description}</p>
                        )}
                        {group.tags.length > 0 && (
                          <div className="flex gap-1 ml-6 mt-1">
                            {group.tags.map(tag => (
                              <span
                                key={tag}
                                className="text-xs px-1.5 py-0.5 rounded border bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-700"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rename button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenameGroupTarget(group)
                      }}
                      className="absolute right-10 top-6 opacity-0 group-hover:opacity-100 p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-all"
                      title="Rename group"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteGroup(group.name)
                      }}
                      className="absolute right-2 top-6 opacity-0 group-hover:opacity-100 p-1 text-red-600 hover:bg-red-50 rounded transition-all"
                      title="Delete group"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>

                    {/* Group Workflows - Always show */}
                    {groupWorkflows.has(group.name) && (
                      <div className="ml-10 mt-3 pl-4 border-l-2 border-indigo-200">
                        <div className="mb-2">
                          <h4 className="text-xs font-semibold text-indigo-700 mb-1.5">
                            Workflows ({groupWorkflows.get(group.name)?.length || 0})
                          </h4>
                          <div className="space-y-2">
                            {(groupWorkflows.get(group.name) || []).sort((a, b) => a.name.localeCompare(b.name)).map(workflow => (
                              <div
                                key={workflow.id}
                                className="rounded border border-indigo-200 bg-indigo-50/80 p-2 dark:border-indigo-700 dark:bg-indigo-900/20"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <button
                                    onClick={() => onNavigateToWorkflow?.(workflow.id)}
                                    className="text-left text-xs font-semibold text-indigo-800 hover:text-indigo-900 hover:underline dark:text-indigo-300"
                                    title={`Go to ${workflow.name} in Workflows page`}
                                  >
                                    {workflow.name}
                                  </button>
                                  <span className="rounded-full border border-indigo-200 px-2 py-0.5 text-[10px] text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">
                                    {workflow.schedule === 'manual' ? 'Manual' : workflow.schedule}
                                  </span>
                                </div>
                                {latestWorkflowOutputs.get(workflow.id)?.summary && (
                                  <div className="mt-1 text-xs text-indigo-900 dark:text-indigo-100 line-clamp-3">
                                    {latestWorkflowOutputs.get(workflow.id)?.summary}
                                  </div>
                                )}
                                {latestWorkflowOutputs.get(workflow.id)?.artifactPath && (
                                  <div className="mt-2 text-[11px] font-mono text-indigo-700 dark:text-indigo-300 break-all">
                                    {latestWorkflowOutputs.get(workflow.id)?.artifactPath}
                                  </div>
                                )}
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {latestWorkflowOutputs.get(workflow.id)?.artifactPath && onNavigateToDoc && (
                                    <button
                                      onClick={() => onNavigateToDoc(latestWorkflowOutputs.get(workflow.id)!.artifactPath!)}
                                      className="rounded border border-indigo-300 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
                                    >
                                      Open Output File
                                    </button>
                                  )}
                                  <button
                                    onClick={() => onNavigateToWorkflow?.(workflow.id)}
                                    className="rounded border border-indigo-300 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
                                  >
                                    Open Workflow
                                  </button>
                                </div>
                              </div>
                            ))}
                            {(groupWorkflows.get(group.name)?.length === 0) && (
                              <span className="text-xs text-gray-400 italic">No workflows</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Group Members */}
                    {expandedGroups.has(group.name) && (
                      <div className="ml-10 mt-3 pl-4 border-l-2 border-indigo-200">
                        <div className="mb-2">
                          <h4 className="text-xs font-semibold text-indigo-700 mb-1.5">
                            Members ({group.members.length})
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {group.members.sort((a, b) => a.name.localeCompare(b.name)).map(agent => (
                              <button
                                key={agent.id}
                                onClick={() => onNavigateToAgent?.(agent.id)}
                                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-indigo-200 bg-indigo-50 font-medium hover:bg-indigo-100 hover:border-indigo-300 transition-colors cursor-pointer dark:border-indigo-700 dark:bg-indigo-900/30 dark:hover:bg-indigo-800/40 dark:hover:border-indigo-600 dark:text-indigo-300"
                                title={`Go to ${agent.name} in Agents page`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                                {agent.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state for communities/groups */}
          {communities.length === 0 && groups.length === 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 shadow-sm p-8 dark:border-gray-700">
              <div className="flex flex-col items-center justify-center text-gray-400">
                <span className="text-4xl mb-4">💬</span>
                <p className="text-sm">No communities or groups configured</p>
                <p className="text-xs mt-1 text-gray-300 mb-4">Create your first community or group to get started</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCreateCommunity(true)}
                    className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                  >
                    + Create Community
                  </button>
                  <button
                    onClick={() => setShowCreateGroup(true)}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                  >
                    + Create Group
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save as Template Modal */}
      {showSaveModal && (
        <SaveAsOrgTemplateModal
          agentCount={agents.length}
          communityCount={communities.length}
          groupCount={groups.length}
          defaultName={orgName}
          defaultDescription={orgDescription}
          onClose={() => setShowSaveModal(false)}
          onSuccess={() => {
            setShowSaveModal(false)
            // Could show a success message or navigate to templates
          }}
        />
      )}

      {/* Create Community Modal */}
      {showCreateCommunity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Create Community</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Community Name *
                </label>
                <input
                  type="text"
                  value={newCommunityName}
                  onChange={(e) => setNewCommunityName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600"
                  placeholder="Engineering Team"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Description
                </label>
                <textarea
                  value={newCommunityDesc}
                  onChange={(e) => setNewCommunityDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600"
                  rows={3}
                  placeholder="Describe this community..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 dark:border-gray-700">
              <button
                onClick={() => {
                  setShowCreateCommunity(false)
                  setNewCommunityName('')
                  setNewCommunityDesc('')
                }}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 transition-colors dark:text-gray-100 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCommunity}
                disabled={!newCommunityName.trim()}
                className={`px-4 py-2 text-sm rounded transition-colors ${
                  newCommunityName.trim()
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                }`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Create Group</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Group Name *
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600"
                  placeholder="Backend Team"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Description
                </label>
                <textarea
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600"
                  rows={3}
                  placeholder="Describe this group..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Community (optional)
                </label>
                {workspaceCommunities.length > 0 ? (
                  <select
                    value={newGroupCommunity}
                    onChange={(e) => setNewGroupCommunity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600"
                  >
                    <option value="">No community</option>
                    {workspaceCommunities.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newGroupCommunity}
                    onChange={(e) => setNewGroupCommunity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600"
                    placeholder="Enter community name"
                  />
                )}
                {workspaceCommunities.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    No communities exist yet. Create one first or leave blank.
                  </p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 dark:border-gray-700">
              <button
                onClick={() => {
                  setShowCreateGroup(false)
                  setNewGroupName('')
                  setNewGroupDesc('')
                  setNewGroupCommunity('')
                }}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 transition-colors dark:text-gray-100 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
                className={`px-4 py-2 text-sm rounded transition-colors ${
                  newGroupName.trim()
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                }`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        isOpen={deleteDialog !== null}
        itemName={deleteDialog?.name || ''}
        itemType={deleteDialog?.type || 'item'}
        consequences={deleteDialog?.consequences}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog(null)}
      />

      <ConfirmDeleteDialog
        isOpen={finalDeleteDialog !== null}
        itemName={finalDeleteDialog?.name || ''}
        itemType="Final Warning"
        warningMessage="This is a cascading delete. It will remove the community and all linked groups, member agents, and related workflows. This action is intended for full teardown, not cleanup."
        consequences={finalDeleteDialog?.consequences}
        onConfirm={confirmFinalDelete}
        onCancel={() => setFinalDeleteDialog(null)}
      />

      {/* Rename Community Modal */}
      {renameCommunityTarget && (
        <RenameCommunityModal
          community={renameCommunityTarget}
          existingCommunities={communities}
          onClose={() => setRenameCommunityTarget(null)}
          onSave={async (newName) => {
            try {
              const res = await fetch(`/api/communities/${encodeURIComponent(renameCommunityTarget.name)}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newName }),
              })
              const data = await res.json()
              if (res.ok) {
                showToast(`Renamed "${renameCommunityTarget.name}" to "${newName}"`, 'success')
                fetchData()
                setRenameCommunityTarget(null)
              } else {
                showToast(data.error || 'Failed to rename community', 'error')
              }
            } catch (err) {
              showToast('Failed to rename community', 'error')
              console.error(err)
            }
          }}
        />
      )}

      {/* Rename Group Modal */}
      {renameGroupTarget && (
        <RenameGroupModal
          group={renameGroupTarget}
          existingGroups={groups}
          onClose={() => setRenameGroupTarget(null)}
          onSave={async (newName) => {
            try {
              const res = await fetch(`/api/groups/${encodeURIComponent(renameGroupTarget.name)}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newName }),
              })
              const data = await res.json()
              if (res.ok) {
                showToast(`Renamed "${renameGroupTarget.name}" to "${newName}"`, 'success')
                fetchData()
                setRenameGroupTarget(null)
              } else {
                showToast(data.error || 'Failed to rename group', 'error')
              }
            } catch (err) {
              showToast('Failed to rename group', 'error')
              console.error(err)
            }
          }}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg transition-opacity ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

function RenameCommunityModal({
  community,
  existingCommunities,
  onClose,
  onSave
}: {
  community: Community
  existingCommunities: Community[]
  onClose: () => void
  onSave: (newName: string) => void
}) {
  const [newName, setNewName] = React.useState(community.name)
  const [error, setError] = React.useState<string | null>(null)

  const validate = (name: string): string | null => {
    if (!name.trim()) return 'Community name is required'
    if (name === community.name) return 'New name must be different from current name'
    if (existingCommunities.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
      return `A community named "${name.trim()}" already exists`
    }
    return null
  }

  const handleSave = () => {
    const validationError = validate(newName)
    if (validationError) {
      setError(validationError)
      return
    }
    onSave(newName.trim())
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-gray-100">Rename Community</h3>
        <p className="text-xs text-gray-500 mb-4">
          Renaming will update all references in groups and agents
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
            Current name: <span className="font-medium text-purple-600">{community.name}</span>
          </label>
          <input
            type="text"
            value={newName}
            onChange={e => {
              setNewName(e.target.value)
              setError(null)
            }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Enter new community name..."
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:border-gray-700"
          />
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  )
}

function RenameGroupModal({
  group,
  existingGroups,
  onClose,
  onSave
}: {
  group: Group
  existingGroups: Group[]
  onClose: () => void
  onSave: (newName: string) => void
}) {
  const [newName, setNewName] = React.useState(group.name)
  const [error, setError] = React.useState<string | null>(null)

  const validate = (name: string): string | null => {
    if (!name.trim()) return 'Group name is required'
    if (name === group.name) return 'New name must be different from current name'
    if (existingGroups.some(g => g.name.toLowerCase() === name.trim().toLowerCase())) {
      return `A group named "${name.trim()}" already exists`
    }
    return null
  }

  const handleSave = () => {
    const validationError = validate(newName)
    if (validationError) {
      setError(validationError)
      return
    }
    onSave(newName.trim())
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-gray-100">Rename Group</h3>
        <p className="text-xs text-gray-500 mb-4">
          Renaming will update all references in agents
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
            Current name: <span className="font-medium text-indigo-600">{group.name}</span>
          </label>
          <input
            type="text"
            value={newName}
            onChange={e => {
              setNewName(e.target.value)
              setError(null)
            }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Enter new group name..."
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-gray-700"
          />
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  )
}
