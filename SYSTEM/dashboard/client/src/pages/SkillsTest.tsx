import { useState, useEffect, useMemo, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AIPromptEditorModal from '../components/AIPromptEditorModal'
import PromptQualityPanel from '../components/PromptQualityPanel'
import AIGenerationProgress from '../components/AIGenerationProgress'
import { SelectionActionBar } from '../components/SelectionActionBar'
import { SkillCard } from '../components/skills/SkillCard'
import { RegistryResultRow } from '../components/skills/RegistryResultRow'
import { useToast } from '../components/Toast'
import type { OpenClawSkill, SkillsResponse, AgentSkillsResponse } from '../types'
import { BROWSER_VAULT_UPDATED_EVENT, readLocalSecrets, readSharedSecrets, writeLocalSecrets, writeSharedSecrets } from '../lib/localSecrets'
import { getAiGenerationReadiness, hasAiGenerationAccess, readStoredByokKeys } from '../lib/byok'
import { getSkillAssignmentBuckets } from '../lib/skillAssignments'
import { summarizeSkillDeleteImpact } from '../lib/skillsDeletion'
import { filterAssignableAgents, isDeletableUserSkill, partitionSelectedSkills, toggleItemSelection, toggleVisibleSelections } from '../lib/skillsSelection'
import { getSkillSetupHint, maybeWarnSkillSetup, supportsDashboardInteractiveSkillSetup, supportsDashboardSkillSetup } from '../lib/skillSetup'
import { collectSkillTags, matchesSelectedSkillTags } from '../lib/skillTags'
import { buildAgentSkillsScope, buildAssignedSkillBadges } from '../lib/agentSkillsScope'
import { getRegistrySkillCompatibility, normalizeRuntimePlatform, type RuntimePlatform } from '../lib/skillPlatform'
import { getDashboardInstallRequirementCommands, getPendingSkillRequirementInstall } from '../lib/skillInstall'
import { buildSkillExportFilename, getSelectedSkillForExport } from '../lib/skillExport'
import { combineRegistrySearchResponses, normalizeRegistrySearchResponse, type SkillRegistryProvider } from '../lib/registrySearch'
import { buildRegistryCompatibilityNote, buildSkillsPageCountLabel, partitionSkillsBySection } from '../lib/skillsPageFlow'
import { getViewportSafeDropdownStyle } from '../lib/dropdownPosition'
import { getSuccessfulImportedSkillIds, LOCAL_SKILL_IMPORT_GUIDANCE, LOCAL_SKILL_IMPORT_PATH_PLACEHOLDER } from '../lib/skillImportPresentation'
import { useAuth } from '../contexts/AuthContext'
import { expandPromptWithAI } from '../lib/aiPrompt'
import {
  headerPrimaryButtonClass,
  headerSecondaryButtonActiveClass,
  headerSecondaryButtonClass,
  headerSecondaryButtonIdleClass,
  headerToggleButtonClass,
} from '../lib/headerControls'
import { ProductIconCell, resolveSkillVisual, resolveCategoryVisual } from '../lib/productIcons'
import { PartnerLogo } from '../components/PartnerLogo'
import { buildServerManagedWorkspaceEntries } from '../lib/keysSecretsInventory'

// Use relative path so it works with ngrok and localhost
const API_BASE = ''
const SKILLS_VIEW_MODE_STORAGE_KEY = 'clawmax-skills-view-mode'

type PartnerPluginAction = 'install' | 'uninstall'
type PartnerPluginRun = {
  slug: string
  name: string
  action: PartnerPluginAction
  status: 'confirming' | 'running' | 'success' | 'error'
  logs: string[]
  error?: string
}
type PartnerPluginStatus = {
  commandId: string
  pluginId: string
  installed: boolean
  enabled: boolean
  status: string
  name?: string
  version?: string
  origin?: string
}

function SkillsListTable({
  skills,
  assignedSkills,
  skillUsage,
  selectionMode,
  selectedSkillIds,
  onToggle,
  onView,
  onExport,
  onDelete,
  canDelete,
  onToggleSelect,
  onToggleSelectAll,
  getSetupHint,
}: {
  skills: OpenClawSkill[]
  assignedSkills: Set<string>
  skillUsage: Map<string, string[]>
  selectionMode: boolean
  selectedSkillIds: Set<string>
  onToggle: (skillName: string) => void
  onView: (skill: OpenClawSkill) => void
  onExport: (skill: OpenClawSkill) => void
  onDelete: (skill: OpenClawSkill) => void
  canDelete: (skill: OpenClawSkill) => boolean
  onToggleSelect: (skillName: string) => void
  onToggleSelectAll: () => void
  getSetupHint: (skill: OpenClawSkill) => ReturnType<typeof getSkillSetupHint>
}) {
  const allSelected = skills.length > 0 && skills.every((skill) => selectedSkillIds.has(skill.name))

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
            <tr>
              {selectionMode && (
                <th className="w-10 px-4 py-3 text-left">
                  <button
                    type="button"
                    onClick={onToggleSelectAll}
                    className={`flex h-6 w-6 items-center justify-center rounded border text-xs font-bold transition-colors ${
                      allSelected
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-gray-300 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                    }`}
                    title="Toggle select all"
                  >
                    {allSelected ? '✓' : '□'}
                  </button>
                </th>
              )}
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Skill</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Source</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Used By</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Tags</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => {
              const isSelected = selectedSkillIds.has(skill.name)
              const assigned = assignedSkills.has(skill.name)
              const users = skillUsage.get(skill.name) || []
              const setupHint = getSetupHint(skill)
              const visual = resolveSkillVisual(skill)
              const sourceLabel = skill.variantOf ? 'Workspace Copy' : skill.source === 'workspace' ? 'Workspace' : skill.source === 'managed' ? 'Managed' : 'Built-in'

              return (
                <tr key={skill.name} className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-700/40">
                  {selectionMode && (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onToggleSelect(skill.name)}
                        className={`flex h-6 w-6 items-center justify-center rounded border text-xs font-bold transition-colors ${
                          isSelected
                            ? 'border-sky-600 bg-sky-600 text-white'
                            : 'border-gray-300 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                        }`}
                        title={isSelected ? 'Deselect skill' : 'Select skill'}
                      >
                        {isSelected ? '✓' : '□'}
                      </button>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onView(skill)}
                      className="text-left"
                    >
                      <div className="flex items-start gap-2">
                        <ProductIconCell iconName={visual.iconName} emoji={visual.emoji} label={skill.name} size="sm" className="mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{skill.name}</div>
                          <div className="line-clamp-1 text-xs text-gray-500 dark:text-gray-400">{skill.description}</div>
                        </div>
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{sourceLabel}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {assigned && (
                        <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[11px] text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300">
                          Assigned
                        </span>
                      )}
                      {skill.dirty && (
                        <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                          DIRTY
                        </span>
                      )}
                      {setupHint && (
                        <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                          {setupHint.label}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{users.length}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(skill.tags || []).slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-600 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => onView(skill)}
                        className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                      >
                        View
                      </button>
                      <button
                        onClick={() => onExport(skill)}
                        className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
                      >
                        Export
                      </button>
                      <button
                        onClick={() => onToggle(skill.name)}
                        className={`rounded px-2 py-1 text-xs ${
                          assigned
                            ? 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/40'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {assigned ? 'Assigned' : 'Add'}
                      </button>
                      {!selectionMode && canDelete(skill) && (
                        <button
                          onClick={() => onDelete(skill)}
                          className="rounded bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/40"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function normalizePromptInput(override: unknown, fallback: string): string {
  return typeof override === 'string' ? override.trim() : fallback.trim()
}

function stripFrontmatter(content: string): string {
  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3)
    if (end !== -1) {
      return content.slice(end + 4).trim()
    }
  }
  return content
}

function openDashboardTermsOfService() {
  window.dispatchEvent(new CustomEvent('open-terms-of-service'))
}

function TermsRiskNotice({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <div className="font-medium">{title}</div>
      <div className="mt-1">{body}</div>
      <button
        type="button"
        onClick={openDashboardTermsOfService}
        className="mt-2 text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900 dark:text-amber-200 dark:hover:text-white"
      >
        View Dashboard Terms of Service
      </button>
    </div>
  )
}

function getSkillMatchScore(skill: OpenClawSkill, query: string): number {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return 0

  let score = 0
  const name = skill.name.toLowerCase()
  const description = skill.description.toLowerCase()
  const tags = (skill.tags || []).map((tag) => tag.toLowerCase())
  const tokens = normalized.split(/\s+/).filter(Boolean)

  if (name === normalized) score += 100
  if (name.startsWith(normalized)) score += 60
  if (name.includes(normalized)) score += 40
  if (description.includes(normalized)) score += 20
  if (tags.some((tag) => tag.includes(normalized))) score += 25

  for (const token of tokens) {
    if (name.includes(token)) score += 12
    if (description.includes(token)) score += 6
    if (tags.some((tag) => tag.includes(token))) score += 8
  }

  return score
}

const SKILL_SPEC_SECTIONS = [
  '## Purpose',
  '## When to Use',
  '## Instructions',
  '## Examples',
]

type RegistryProvider = SkillRegistryProvider
type RegistryProviderSelection = RegistryProvider | 'all'
type RegistrySkillResult = {
  name: string
  full_name?: string
  install_name?: string
  description?: string
  version?: string
  latest_version?: string
  downloads?: number
  downloads_weekly?: number
  categories?: string[]
  homepage?: string
  emoji?: string
  registry_provider?: RegistryProvider
  raw?: any
}

const REGISTRY_PROVIDERS: Array<{
  id: RegistryProvider
  label: string
  iconKey: string
  linkLabel: string
  homepage: string
  description: string
  searchPlaceholder: string
  catalogSizeLabel: string
}> = [
  {
    id: 'clawhub',
    label: 'ClawHub',
    iconKey: 'registry',
    linkLabel: 'ClawHub',
    homepage: 'https://clawhub.dev',
    description: 'OpenClaw’s native skill registry for discovering and installing skills.',
    searchPlaceholder: 'Search ClawHub... (e.g., gmail, github, docs)',
    catalogSizeLabel: 'about 100 skills',
  },
  {
    id: 'shipables',
    label: 'Shipables',
    iconKey: 'registry',
    linkLabel: 'Shipables.dev',
    homepage: 'https://shipables.dev',
    description: 'Discover and install skills from Shipables.dev using the agentskills.io standard.',
    searchPlaceholder: 'Search Shipables... (e.g., github, slack, salesforce)',
    catalogSizeLabel: 'about 250 skills',
  },
  {
    id: 'tessl',
    label: 'Tessl',
    iconKey: 'registry',
    linkLabel: 'Tessl',
    homepage: 'https://docs.tessl.io/use',
    description: 'Experimental: discover and install Tessl registry skills for OpenClaw workspaces.',
    searchPlaceholder: 'Search Tessl skills... (e.g., review, docs, research)',
    catalogSizeLabel: 'about 1,000 skills',
  },
]

const ALL_REGISTRIES_PROVIDER = {
  id: 'all' as const,
  label: 'All registries',
  iconKey: 'registry',
  description: 'Search ClawHub, Shipables, and Tessl together, then install from the matching source.',
  searchPlaceholder: 'Search all registries... (e.g., github, docs, research)',
  catalogSizeLabel: 'all supported catalogs',
}

export function SkillsTest({ initialAgentId, initialSkillName }: { initialAgentId?: string; initialSkillName?: string } = {}) {
  const { config } = useAuth()
  const { showSuccess, showWarning, showError: showToastError } = useToast()
  const aiEnabled = hasAiGenerationAccess(config)
  const aiReadiness = getAiGenerationReadiness(config)
  const [allSkills, setAllSkills] = useState<OpenClawSkill[]>([])
  const [assignedSkills, setAssignedSkills] = useState<Set<string>>(new Set())
  const [skillUsage, setSkillUsage] = useState<Map<string, string[]>>(new Map())
  const [agentSkillMap, setAgentSkillMap] = useState<Map<string, string[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid'
    return localStorage.getItem(SKILLS_VIEW_MODE_STORAGE_KEY) === 'list' ? 'list' : 'grid'
  })
  const [filterAssigned, setFilterAssigned] = useState<'all' | 'assigned' | 'available'>('all')
  const [selectedSkillTags, setSelectedSkillTags] = useState<Set<string>>(new Set())
  const [agentId, setAgentId] = useState(initialAgentId || '')
  const [availableAgents, setAvailableAgents] = useState<string[]>([])
  const [agentSearchQuery, setAgentSearchQuery] = useState('')
  const [showAgentDropdown, setShowAgentDropdown] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set())
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [pendingDeleteSkillNames, setPendingDeleteSkillNames] = useState<string[]>([])
  const [selectedBulkAgentIds, setSelectedBulkAgentIds] = useState<Set<string>>(new Set())
  const [bulkAgentSearchQuery, setBulkAgentSearchQuery] = useState('')
  const [bulkAssigningSkills, setBulkAssigningSkills] = useState(false)
  const [deletingSkills, setDeletingSkills] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSkillActionsMenu, setShowSkillActionsMenu] = useState(false)
  const skillActionsMenuButtonRef = useRef<HTMLButtonElement>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importPath, setImportPath] = useState('')
  const [importing, setImporting] = useState(false)
  const uploadSkillZipInputRef = useRef<HTMLInputElement>(null)
  const [importSource, setImportSource] = useState<'local' | 'github' | 'registry' | 'partner' | 'ai'>('local')
  const [registryProvider, setRegistryProvider] = useState<RegistryProviderSelection>('all')
  const [registryQuery, setRegistryQuery] = useState('')
  const [registryResults, setRegistryResults] = useState<RegistrySkillResult[]>([])
  const [registrySearching, setRegistrySearching] = useState(false)
  const [registryInstalling, setRegistryInstalling] = useState<string | null>(null)
  const [registryTotal, setRegistryTotal] = useState(0)
  const [registryInstalledNames, setRegistryInstalledNames] = useState<Set<string>>(new Set())
  const [inlineRegistrySuggestions, setInlineRegistrySuggestions] = useState<Record<RegistryProvider, RegistrySkillResult[]>>({
    clawhub: [],
    shipables: [],
    tessl: [],
  })
  const [inlineRegistryLoading, setInlineRegistryLoading] = useState(false)
  const [partnerInstallers, setPartnerInstallers] = useState<Array<{
    slug: string
    name: string
    description: string
    logoUrl?: string
    website?: string
    docsUrl?: string
    skills: {
      mode: 'shipables' | 'curated-installer' | 'planned' | 'catalog'
      commandId?: string
      label?: string
      items?: string[]
      matchNames?: string[]
      matchPrefixes?: string[]
      sourceUrl?: string
    }
  }>>([])
  const [focusedPartnerSlug, setFocusedPartnerSlug] = useState<string | null>(null)
  const [partnerInstalling, setPartnerInstalling] = useState<string | null>(null)
  const [partnerPluginRun, setPartnerPluginRun] = useState<PartnerPluginRun | null>(null)
  const [partnerPluginStatuses, setPartnerPluginStatuses] = useState<Record<string, PartnerPluginStatus>>({})
  const [showPartnerInstallers, setShowPartnerInstallers] = useState(false)
  const [showAllSkillTags, setShowAllSkillTags] = useState(false)
  const [showAllPopularSkills, setShowAllPopularSkills] = useState(false)
  const [aiSkillPrompt, setAiSkillPrompt] = useState('')
  const [showAiPromptEditor, setShowAiPromptEditor] = useState(false)
  const [aiSkillRefinementPrompt, setAiSkillRefinementPrompt] = useState('')
  const [aiSkillGenerating, setAiSkillGenerating] = useState(false)
  useEffect(() => {
    localStorage.setItem(SKILLS_VIEW_MODE_STORAGE_KEY, viewMode)
  }, [viewMode])
  const [aiSkillCreating, setAiSkillCreating] = useState(false)
  const [generatedSkillDraft, setGeneratedSkillDraft] = useState<null | {
    name: string
    description: string
    emoji?: string
    tags: string[]
    content: string
  }>(null)
  const [viewingSkill, setViewingSkill] = useState<OpenClawSkill | null>(null)
  const [skillContent, setSkillContent] = useState('')
  const [editingSkill, setEditingSkill] = useState(false)
  const [editingSkillName, setEditingSkillName] = useState('')
  const [editingSkillDescription, setEditingSkillDescription] = useState('')
  const [editingSkillTags, setEditingSkillTags] = useState('')
  const [editingDraft, setEditingDraft] = useState('')
  const [loadingSkillContent, setLoadingSkillContent] = useState(false)
  const [savingSkillContent, setSavingSkillContent] = useState(false)
  const [installingSkillRequirementsName, setInstallingSkillRequirementsName] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [showInstallRequirementsModal, setShowInstallRequirementsModal] = useState(false)
  const [pendingInstallSkill, setPendingInstallSkill] = useState<OpenClawSkill | null>(null)
  const [installRequirementsCommands, setInstallRequirementsCommands] = useState<string[]>([])
  const [installRequirementsLogs, setInstallRequirementsLogs] = useState<string[]>([])
  const [installRequirementsError, setInstallRequirementsError] = useState<string | null>(null)
  const [installRequirementsDone, setInstallRequirementsDone] = useState(false)
  const [showSkillSetupModal, setShowSkillSetupModal] = useState(false)
  const [pendingSetupSkill, setPendingSetupSkill] = useState<OpenClawSkill | null>(null)
  const [skillSetupLogs, setSkillSetupLogs] = useState<string[]>([])
  const [skillSetupError, setSkillSetupError] = useState<string | null>(null)
  const [skillSetupDone, setSkillSetupDone] = useState(false)
  const [runningSkillSetupName, setRunningSkillSetupName] = useState<string | null>(null)
  const [skillSetupValues, setSkillSetupValues] = useState<Record<string, string>>({})
  const [interactiveSkillSetupSessionId, setInteractiveSkillSetupSessionId] = useState<string | null>(null)
  const [interactiveSkillSetupInput, setInteractiveSkillSetupInput] = useState('')
  const [didHandleInitialSkillName, setDidHandleInitialSkillName] = useState(false)
  const [skillSecrets, setSkillSecrets] = useState<Record<string, string>>({})
  const [sharedGlobalSecrets, setSharedGlobalSecrets] = useState<Record<string, string>>({})
  const [sharedWorkspaceSecrets, setSharedWorkspaceSecrets] = useState<Record<string, string>>({})
  const [viewerAgentSearchQuery, setViewerAgentSearchQuery] = useState('')
  const [savingSkillAssignmentAgentId, setSavingSkillAssignmentAgentId] = useState<string | null>(null)
  const [removingAssignedSkillName, setRemovingAssignedSkillName] = useState<string | null>(null)
  const [runtimePlatform, setRuntimePlatform] = useState<RuntimePlatform>('unknown')
  const [partnerDefinitions, setPartnerDefinitions] = useState<Array<{
    slug: string
    fields?: Array<{ key: string; secret?: boolean; storage?: 'browser' | 'server' }>
  }>>([])
  const [serverPartnerSecretSummaries, setServerPartnerSecretSummaries] = useState<Record<string, Record<string, { present?: boolean; preview?: string }>>>({})
  const popularSkills = Array.from(skillUsage.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
  const collapsedPopularSkills = popularSkills.slice(0, 4)

  const focusSkill = (skillName: string) => {
    const normalized = skillName.trim().toLowerCase()
    if (!normalized) return
    setSearchQuery(skillName)
    const exactSkill = allSkills.find((skill) => skill.name.toLowerCase() === normalized)
    if (exactSkill) {
      void openSkillViewer(exactSkill)
    }
  }

  function parseTagInput(value: string): string[] {
    return Array.from(new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    ))
  }

  const viewingSkillVisual = viewingSkill ? resolveSkillVisual(viewingSkill) : null
  const generatedSkillVisual = generatedSkillDraft
    ? resolveSkillVisual({ ...generatedSkillDraft, iconKey: (generatedSkillDraft as any).iconKey, icon: (generatedSkillDraft as any).icon })
    : null

  // Load agents list on mount
  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    const handleAgentsUpdated = () => {
      loadAgents()
    }

    window.addEventListener('agents-updated', handleAgentsUpdated)
    return () => window.removeEventListener('agents-updated', handleAgentsUpdated)
  }, [agentId])

  useEffect(() => {
    fetch('/api/integrations/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const definitions = Array.isArray(data?.partnerDefinitions) ? data.partnerDefinitions : []
        setPartnerDefinitions(definitions)
        setPartnerInstallers(
          definitions.filter((partner: any) => {
            const mode = partner?.skills?.mode
            return mode === 'curated-installer' || mode === 'catalog' || mode === 'shipables' || mode === 'planned'
          })
        )
      })
      .catch(() => setPartnerInstallers([]))
  }, [])

  function refreshIntegrationSecretPresence() {
    fetch('/api/integrations/config')
      .then((res) => (res.ok ? res.json() : { secretPresence: {}, secretSummaries: {} }))
      .then((data) => {
        setServerPartnerSecretSummaries(typeof data?.secretSummaries === 'object' && data.secretSummaries ? data.secretSummaries : {})
      })
      .catch(() => {
        setServerPartnerSecretSummaries({})
      })
  }

  useEffect(() => {
    refreshIntegrationSecretPresence()
  }, [])

  async function refreshPartnerPluginStatuses() {
    try {
      const res = await fetch(`${API_BASE}/api/skills/partner-install/status`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load partner plugin status')
      setPartnerPluginStatuses(typeof data?.statuses === 'object' && data.statuses ? data.statuses : {})
    } catch {
      setPartnerPluginStatuses({})
    }
  }

  useEffect(() => {
    void refreshPartnerPluginStatuses()
  }, [])

  useEffect(() => {
    window.addEventListener('integrations-saved', refreshIntegrationSecretPresence)
    return () => window.removeEventListener('integrations-saved', refreshIntegrationSecretPresence)
  }, [])

  useEffect(() => {
    const refreshSharedSecrets = () => {
      setSharedGlobalSecrets(readSharedSecrets('global'))
      setSharedWorkspaceSecrets(readSharedSecrets('workspace'))
    }
    refreshSharedSecrets()
    window.addEventListener(BROWSER_VAULT_UPDATED_EVENT, refreshSharedSecrets)
    return () => window.removeEventListener(BROWSER_VAULT_UPDATED_EVENT, refreshSharedSecrets)
  }, [])

  useEffect(() => {
    fetch('/api/system')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setRuntimePlatform(normalizeRuntimePlatform(typeof data?.platform === 'string' ? data.platform : null))
      })
      .catch(() => setRuntimePlatform('unknown'))
  }, [])

  useEffect(() => {
    const handleOpenSkillSearch = (event: Event) => {
      const detail = (event as CustomEvent<{ skill?: string }>).detail
      if (detail?.skill) {
        focusSkill(detail.skill)
      }
    }
    window.addEventListener('clawmax-open-skill-search', handleOpenSkillSearch as EventListener)
    return () => window.removeEventListener('clawmax-open-skill-search', handleOpenSkillSearch as EventListener)
  }, [allSkills])

  useEffect(() => {
    const handleBuilderCreateSkill = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string; agentId?: string }>).detail
      if (typeof detail?.prompt === 'string') {
        setAiSkillPrompt(detail.prompt)
      }
      if (typeof detail?.agentId === 'string' && detail.agentId.trim()) {
        setAgentId(detail.agentId)
      }
      setImportSource('ai')
      setShowImportDialog(true)
      setGeneratedSkillDraft(null)
      setAiSkillRefinementPrompt('')
      setError(null)
      setShowAiPromptEditor(false)
    }

    window.addEventListener('clawmax-open-builder-skill-draft', handleBuilderCreateSkill as EventListener)
    return () => window.removeEventListener('clawmax-open-builder-skill-draft', handleBuilderCreateSkill as EventListener)
  }, [])

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setInlineRegistrySuggestions({ clawhub: [], shipables: [], tessl: [] })
      setInlineRegistryLoading(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setInlineRegistryLoading(true)
      try {
        const [clawhubResp, shipablesResp, tesslResp] = await Promise.all([
          fetch(`/api/skills/registry/search?provider=clawhub&q=${encodeURIComponent(searchQuery.trim())}&limit=6`, {
            signal: controller.signal,
          }),
          fetch(`/api/skills/registry/search?provider=shipables&q=${encodeURIComponent(searchQuery.trim())}&limit=6`, {
            signal: controller.signal,
          }),
          fetch(`/api/skills/registry/search?provider=tessl&q=${encodeURIComponent(searchQuery.trim())}&limit=6`, {
            signal: controller.signal,
          }),
        ])
        const [clawhubData, shipablesData, tesslData] = await Promise.all([
          clawhubResp.json(),
          shipablesResp.json(),
          tesslResp.json(),
        ])
        setInlineRegistrySuggestions({
          clawhub: Array.isArray(clawhubData.results) ? clawhubData.results : [],
          shipables: Array.isArray(shipablesData.results) ? shipablesData.results : [],
          tessl: Array.isArray(tesslData.results) ? tesslData.results : [],
        })
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setInlineRegistrySuggestions({ clawhub: [], shipables: [], tessl: [] })
        }
      } finally {
        setInlineRegistryLoading(false)
      }
    }, 350)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [searchQuery])

  // Update agent when initialAgentId prop changes
  useEffect(() => {
    if (initialAgentId) {
      setAgentId(initialAgentId)
      setFilterAssigned('assigned')
    }
  }, [initialAgentId])

  useEffect(() => {
    setDidHandleInitialSkillName(false)
  }, [initialSkillName])

  // Reload skills when agent changes (or on mount if no agents)
  useEffect(() => {
    loadSkills()
  }, [agentId])

  useEffect(() => {
    if (loading || typeof window === 'undefined') return
    const supportsDesktopAutofocus = window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches
    if (supportsDesktopAutofocus) searchInputRef.current?.focus()
  }, [loading, filterAssigned])

  async function loadAgents() {
    try {
      const res = await fetch(`${API_BASE}/api/agents`)
      if (!res.ok) throw new Error('Failed to load agents')
      const data = await res.json()
      const agents = Array.isArray(data.agents) ? data.agents : []
      const agentIds = agents.map((a: any) => a.id)
      setAvailableAgents(agentIds)
      const skillsByAgent = new Map<string, string[]>()

      // Set default agent to first available, or reset if current agent isn't in this workspace
      if (agentIds.length > 0 && (!agentId || !agentIds.includes(agentId))) {
        setAgentId(agentIds[0])
      }

      // Compute skill usage across all agents
      const usage = new Map<string, string[]>()
      for (const agent of agents) {
        const agentSkills = Array.isArray(agent.skills) ? agent.skills : []
        skillsByAgent.set(agent.id, agentSkills)
        if (agentSkills.length > 0) {
          for (const skill of agentSkills) {
            const users = usage.get(skill) || []
            users.push(agent.id)
            usage.set(skill, users)
          }
        }
      }
      setAgentSkillMap(skillsByAgent)
      setSkillUsage(usage)
    } catch (error) {
      console.error('Failed to load agents:', error)
      setAvailableAgents([])
      setAgentSkillMap(new Map())
    }
  }

  async function loadSkills(): Promise<OpenClawSkill[]> {
    setLoading(true)
    setError(null)
    try {
      // Fetch all available skills
      const skillsRes = await fetch(`${API_BASE}/api/skills`)
      if (!skillsRes.ok) throw new Error('Failed to load skills')
      const skillsData: SkillsResponse = await skillsRes.json()
      const loadedSkills = Array.isArray(skillsData.skills) ? skillsData.skills : []

      // Fetch agent's assigned skills (only if agentId is set)
      if (agentId) {
        const agentSkillsRes = await fetch(`${API_BASE}/api/skills/agent/${agentId}`)
        if (!agentSkillsRes.ok) throw new Error('Failed to load assigned skills')
        const agentSkillsData: AgentSkillsResponse = await agentSkillsRes.json()
        setAssignedSkills(new Set(Array.isArray(agentSkillsData.skillIds) ? agentSkillsData.skillIds : []))
      } else {
        setAssignedSkills(new Set())
      }

      setAllSkills(loadedSkills)
      return loadedSkills
    } catch (error) {
      console.error('Failed to load skills:', error)
      setAllSkills([])
      setAssignedSkills(new Set())
      setError('Failed to load skills. Make sure the server is running and you are signed in.')
      return []
    } finally {
      setLoading(false)
    }
  }

  async function fetchSkillsByNames(skillNames: Array<string | null | undefined>): Promise<OpenClawSkill[]> {
    const uniqueNames = Array.from(new Set(
      skillNames
        .filter((name): name is string => typeof name === 'string')
        .map((name) => name.trim())
        .filter(Boolean)
    ))
    if (uniqueNames.length === 0) return []

    const resolved = await Promise.all(uniqueNames.map(async (skillName) => {
      try {
        const response = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skillName)}`)
        if (!response.ok) return null
        return await response.json() as OpenClawSkill
      } catch {
        return null
      }
    }))

    return resolved.filter((skill): skill is OpenClawSkill => !!skill)
  }

  async function warnForSkillSetupByNames(skillNames: Array<string | null | undefined>) {
    const resolvedSkills = await fetchSkillsByNames(skillNames)
    if (resolvedSkills.length > 0) {
      const installableSkill = getPendingSkillRequirementInstall(resolvedSkills, runtimePlatform)
      if (installableSkill) {
        openInstallRequirementsModal(installableSkill)
        return
      }
      maybeWarnSkillSetup(showWarning, resolvedSkills)
      return
    }
    maybeWarnSkillSetup(showWarning, skillNames)
  }

  function updateLocalAgentSkillState(targetAgentId: string, nextSkills: string[]) {
    setAgentSkillMap((current) => {
      const next = new Map(current)
      next.set(targetAgentId, nextSkills)
      return next
    })
    setSkillUsage((current) => {
      const next = new Map<string, string[]>()
      for (const [skillName, users] of current.entries()) {
        const filtered = users.filter((id) => id !== targetAgentId)
        if (filtered.length > 0) {
          next.set(skillName, filtered)
        }
      }
      for (const skillName of nextSkills) {
        const users = next.get(skillName) || []
        if (!users.includes(targetAgentId)) {
          next.set(skillName, [...users, targetAgentId].sort((a, b) => a.localeCompare(b)))
        }
      }
      return next
    })
    if (targetAgentId === agentId) {
      setAssignedSkills(new Set(nextSkills))
    }
  }

  async function persistAgentSkills(targetAgentId: string, skillsList: string[]) {
    const response = await fetch(`${API_BASE}/api/skills/agent/${targetAgentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skills: skillsList })
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update skills')
    }

    updateLocalAgentSkillState(targetAgentId, skillsList)
    if (Array.isArray(data.warnings) && data.warnings.length > 0) {
      showWarning(data.warnings.join(' '))
    }
  }

  async function toggleSkill(skillId: string) {
    console.log('Toggle skill:', skillId, 'for agent:', agentId)

    const currentSkills = agentSkillMap.get(agentId) || Array.from(assignedSkills)
    const nextSkills = currentSkills.includes(skillId)
      ? currentSkills.filter((skill) => skill !== skillId)
      : [...currentSkills, skillId]

    setError(null)
    setSaving(true)

    try {
      console.log('Sending PUT request:', nextSkills)
      await persistAgentSkills(agentId, nextSkills)
      if (!currentSkills.includes(skillId)) {
        const addedSkill = allSkills.find((skill) => skill.name === skillId)
        maybeWarnSkillSetup(showWarning, addedSkill ? [addedSkill] : [skillId])
      }
      setError(null)
    } catch (error: any) {
      console.error('Failed to update skills:', error)
      setError(error.message || 'Failed to update skills')
    } finally {
      setSaving(false)
    }
  }

  async function searchRegistry(query: string, limit = 20, providerOverride?: RegistryProviderSelection) {
    setRegistrySearching(true)
    try {
      const provider = providerOverride || registryProvider
      const providers = provider === 'all' ? REGISTRY_PROVIDERS.map((entry) => entry.id) : [provider]
      const responses = await Promise.all(providers.map(async (providerId) => {
        try {
          const resp = await fetch(`/api/skills/registry/search?provider=${providerId}&q=${encodeURIComponent(query)}&limit=${limit}`)
          const data = await resp.json()
          return normalizeRegistrySearchResponse<RegistrySkillResult>(providerId, data)
        } catch {
          return { results: [] as RegistrySkillResult[], total: 0 }
        }
      }))
      const combined = combineRegistrySearchResponses(responses)
      setRegistryResults(combined.results)
      setRegistryTotal(combined.total)
    } catch { setRegistryResults([]) }
    finally { setRegistrySearching(false) }
  }

  async function installRegistrySkill(
    installName: string,
    providerOverride?: RegistryProvider,
    overwrite = false,
    registryResult?: RegistrySkillResult,
  ) {
    const provider = providerOverride || registryProvider
    setRegistryInstalling(installName)
    try {
      const resp = await fetch('/api/skills/registry/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, name: installName, overwrite, registryResult }),
      })
      const data = await resp.json()
      if (resp.status === 409 && data?.canOverwrite) {
        const conflictList = Array.isArray(data.conflicts) && data.conflicts.length > 0
          ? data.conflicts.join(', ')
          : installName
        const shouldOverwrite = window.confirm(
          `The skill already exists in this workspace: ${conflictList}.\n\nReinstalling will replace the current user skill with the registry version.\n\nDo you want to continue?`
        )
        if (shouldOverwrite) {
          await installRegistrySkill(installName, provider, true, registryResult)
        }
        return
      }
      if (data.ok) {
        const providerLabel = REGISTRY_PROVIDERS.find((entry) => entry.id === provider)?.label || 'registry'
        const replacedSuffix = data.replaced ? ` (${data.replaced} replaced)` : ''
        showSuccess(`Installed "${installName}" from ${providerLabel}${replacedSuffix}`)
        setRegistryInstalledNames(prev => new Set([...prev, `${provider}:${installName}`]))
        await loadSkills()
        await warnForSkillSetupByNames([data.skillId || installName])
      } else {
        showToastError(data.error || 'Install failed')
      }
    } catch {
      showToastError('Network error installing skill')
    } finally {
      setRegistryInstalling(null)
    }
  }

  function openImportDialog(source: 'local' | 'github' | 'registry' | 'partner' | 'ai', partnerSlug?: string | null) {
    setError(null)
    setImportSource(source)
    setFocusedPartnerSlug(source === 'partner' ? (partnerSlug || null) : null)
    setShowImportDialog(true)
    setShowSkillActionsMenu(false)
    if (source !== 'registry') {
      setRegistryQuery('')
      setRegistryResults([])
    }
  }

  async function handleImportSkill() {
    if (!importPath.trim()) {
      setError('Please enter a skill directory path or GitHub URL')
      return
    }

    setImporting(true)
    setError(null)

    try {
      const isGitHub = importSource === 'github' || importPath.includes('github.com')
      const endpoint = isGitHub ? '/api/skills/import-github' : '/api/skills/import'
      const payload = isGitHub
        ? { githubUrl: importPath }
        : { sourcePath: importPath }

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (res.ok) {
        setShowImportDialog(false)
        setImportPath('')
        setImportSource('local')
        await loadSkills() // Reload skills list
        if (data.warning) {
          showWarning(data.warning)
        }
        const importedSkillNames = getSuccessfulImportedSkillIds(data)
        // Repositories with a skills/ directory return this shape even when
        // they contain exactly one skill.
        if (Array.isArray(data.skills)) {
          const failed = data.skills?.filter((s: any) => !s.ok) || []
          const warnings = data.skills?.filter((s: any) => s.warning).map((s: any) => s.warning) || []
          if ((data.imported || 0) === 0 && (data.existing || 0) > 0) {
            showSuccess(`${data.existing}/${data.total} skills already installed`)
          } else {
            showSuccess(`Imported ${data.imported}/${data.total} skills`)
          }
          if (warnings.length > 0) {
            showWarning(warnings.join(' '))
          }
          if (importedSkillNames.length > 0) {
            await warnForSkillSetupByNames(importedSkillNames)
          }
          if (failed.length > 0) {
            showToastError(`Failed: ${failed.map((f: any) => f.skillId).join(', ')}`)
          }
        } else {
          showSuccess(`Imported skill: ${data.skillId}`)
          await warnForSkillSetupByNames(importedSkillNames)
        }
      } else {
        setError(data.error || 'Failed to import skill')
      }
    } catch (error: any) {
      setError(error.message || 'Error importing skill')
    } finally {
      setImporting(false)
    }
  }

  async function handleUploadSkillZip(file: File) {
    setImporting(true)
    setError(null)

    try {
      const payload = await file.arrayBuffer()
      const res = await fetch(`${API_BASE}/api/skills/import-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/zip',
          'x-file-name': file.name,
        },
        body: payload,
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to import uploaded ZIP')
        return
      }

      setShowImportDialog(false)
      setImportPath('')
      setImportSource('local')
      await loadSkills()
      if (data.warning) {
        showWarning(data.warning)
      }
      if (data.total && data.total > 1) {
        const failed = data.skills?.filter((s: any) => !s.ok) || []
        const warnings = data.skills?.filter((s: any) => s.warning).map((s: any) => s.warning) || []
        const importedSkillNames = data.skills?.filter((s: any) => s.ok).map((s: any) => s.skillId).filter(Boolean) || []
        showSuccess(`Imported ${data.imported}/${data.total} skills from ${file.name}`)
        if (warnings.length > 0) {
          showWarning(warnings.join(' '))
        }
        if (importedSkillNames.length > 0) {
          await warnForSkillSetupByNames(importedSkillNames)
        }
        if (failed.length > 0) {
          showToastError(`Failed: ${failed.map((f: any) => f.skillId).join(', ')}`)
        }
      } else {
        showSuccess(`Imported skill from ${file.name}: ${data.skillId}`)
        await warnForSkillSetupByNames([data.skillId])
      }
    } catch (error: any) {
      setError(error.message || 'Error importing uploaded ZIP')
    } finally {
      if (uploadSkillZipInputRef.current) {
        uploadSkillZipInputRef.current.value = ''
      }
      setImporting(false)
    }
  }

  async function ensureBundledPartnerSkillMaterialized(skillName: string, availableSkills: OpenClawSkill[]): Promise<boolean> {
    const existingSkill = availableSkills.find((skill) => skill.name === skillName)
    if (!existingSkill || existingSkill.source !== 'bundled' || existingSkill.variantOf) {
      return false
    }

    const contentRes = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skillName)}/content`)
    const contentData = await contentRes.json().catch(() => ({}))
    if (!contentRes.ok || typeof contentData.content !== 'string') {
      throw new Error(contentData.error || `Failed to load ${skillName}`)
    }

    const saveRes = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skillName)}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: contentData.content,
        name: existingSkill.name,
        description: existingSkill.description,
        tags: existingSkill.tags || [],
      }),
    })
    const saveData = await saveRes.json().catch(() => ({}))
    if (!saveRes.ok) {
      throw new Error(saveData.error || `Failed to materialize ${skillName}`)
    }
    return true
  }

  async function importPartnerCatalog(partner: {
    slug?: string
    name: string
    skills: { sourceUrl?: string; items?: string[] }
  }) {
    if (!partner.skills.sourceUrl) {
      showToastError(`No import source configured for ${partner.name}`)
      return
    }
    setImporting(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/skills/import-github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubUrl: partner.skills.sourceUrl })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || `Failed to import ${partner.name} skills`)
      }
      let loadedSkills = await loadSkills()
      const materializedBundledSkills: string[] = []
      for (const skillName of partner.skills.items || []) {
        try {
          if (await ensureBundledPartnerSkillMaterialized(skillName, loadedSkills)) {
            materializedBundledSkills.push(skillName)
            loadedSkills = await loadSkills()
          }
        } catch (err: any) {
          showWarning(err?.message || `Failed to prepare ${skillName}`)
        }
      }
      if (data.warning) {
        showWarning(data.warning)
      }
      if (data.total && data.total > 1) {
        const failed = data.skills?.filter((s: any) => !s.ok) || []
        const importedSkillNames = [
          ...(data.skills?.filter((s: any) => s.ok).map((s: any) => s.skillId).filter(Boolean) || []),
          ...materializedBundledSkills,
        ]
        const materializedSuffix = materializedBundledSkills.length > 0
          ? ` (+${materializedBundledSkills.length} bundled helper${materializedBundledSkills.length !== 1 ? 's' : ''})`
          : ''
        if ((data.imported || 0) === 0 && (data.existing || 0) > 0) {
          showSuccess(`${data.existing}/${data.total} ${partner.name} skills already installed${materializedSuffix}`)
        } else {
          showSuccess(`Imported ${data.imported}/${data.total} ${partner.name} skills${materializedSuffix}`)
        }
        if (importedSkillNames.length > 0) {
          await warnForSkillSetupByNames(importedSkillNames)
        }
        if (failed.length > 0) {
          showToastError(`Failed: ${failed.map((f: any) => f.skillId).join(', ')}`)
        }
      } else if (data.skillId || materializedBundledSkills.length > 0) {
        const importedNames = [data.skillId, ...materializedBundledSkills].filter(Boolean)
        showSuccess(`Imported ${partner.name} skill${importedNames.length !== 1 ? 's' : ''}: ${importedNames.join(', ')}`)
        await warnForSkillSetupByNames(importedNames as string[])
      } else {
        showSuccess(`Imported ${partner.name} skills`)
      }
      setShowImportDialog(false)
    } catch (err: any) {
      setError(err.message || `Failed to import ${partner.name} skills`)
    } finally {
      setImporting(false)
    }
  }

  async function runPartnerPluginAction(partner: {
    slug: string
    name: string
    skills: { commandId?: string }
  }, action: PartnerPluginAction) {
    if (!partner.skills.commandId) return
    const endpoint = action === 'install' ? '/api/skills/partner-install' : '/api/skills/partner-uninstall'
    const actionLabel = action === 'install' ? 'Install' : 'Uninstall'
    const presentParticiple = action === 'install' ? 'Installing' : 'Uninstalling'
    const existingSkillNames = new Set(allSkills.map((skill) => skill.name))

    setPartnerInstalling(partner.slug)
    setError(null)
    setPartnerPluginRun({
      slug: partner.slug,
      name: partner.name,
      action,
      status: 'running',
      logs: [
        `# ${actionLabel} ${partner.name} partner plugin`,
        `${presentParticiple} via the dashboard's curated OpenClaw plugin allowlist...`,
        'Waiting for OpenClaw command output...',
      ],
    })

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId: partner.skills.commandId }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        throw new Error(data.detail || data.error || `${actionLabel} failed`)
      }
      const nextLogs = [
        `# ${actionLabel} ${partner.name} partner plugin`,
        data.command ? `$ ${data.command}` : `${presentParticiple} partner plugin...`,
      ]
      if (data.stdout) nextLogs.push(data.stdout)
      if (data.stderr) nextLogs.push(data.stderr)
      nextLogs.push(`✓ ${actionLabel} completed for ${partner.name}`)
      setPartnerPluginRun({
        slug: partner.slug,
        name: partner.name,
        action,
        status: 'success',
        logs: nextLogs,
      })
      if (action === 'install') {
        showSuccess(`Installed ${partner.name} plugin`)
        const loadedSkills = await loadSkills()
        const addedSkills = loadedSkills
          .map((skill) => skill.name)
          .filter((skillName) => !existingSkillNames.has(skillName))
        if (addedSkills.length > 0) {
          await warnForSkillSetupByNames(addedSkills)
        }
      } else {
        showSuccess(`Uninstalled ${partner.name} plugin`)
        await loadSkills()
      }
      await refreshPartnerPluginStatuses()
    } catch (err: any) {
      const message = err.message || `Failed to ${action} ${partner.name} plugin`
      setPartnerPluginRun((current) => ({
        slug: partner.slug,
        name: partner.name,
        action,
        status: 'error',
        logs: [
          ...(current?.logs || [`# ${actionLabel} ${partner.name} partner plugin`]),
          `✗ ${message}`,
        ],
        error: message,
      }))
      showToastError(message)
    } finally {
      setPartnerInstalling(null)
    }
  }

  function confirmPartnerPluginUninstall(partner: {
    slug: string
    name: string
    skills: { commandId?: string }
  }) {
    if (!partner.skills.commandId) return
    setPartnerPluginRun({
      slug: partner.slug,
      name: partner.name,
      action: 'uninstall',
      status: 'confirming',
      logs: [
        `# Uninstall ${partner.name} partner plugin`,
        'This will remove the OpenClaw plugin install record and plugin files for this runtime.',
        'Choose Uninstall to continue, or Cancel to leave it installed.',
      ],
    })
  }

  async function handleGenerateSkill(refine = false, promptOverride?: string) {
    const activePrompt = refine
      ? aiSkillRefinementPrompt.trim()
      : normalizePromptInput(promptOverride, aiSkillPrompt)
    if (!activePrompt) {
      setError(refine ? 'Describe how you want to refine the draft' : 'Describe the skill you want to create')
      return
    }
    if (!aiEnabled) {
      setError('AI skill generation needs browser-local keys or a usable shared execution path first. Open Workspaces Integrations or Keys & Secrets before generating.')
      return
    }

    setAiSkillGenerating(true)
    setError(null)
    try {
      const byok = readStoredByokKeys()
      const res = await fetch(`${API_BASE}/api/skills/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: activePrompt,
          currentDraft: refine ? generatedSkillDraft : undefined,
          byokKeys: {
            openai: byok.openai,
            anthropic: byok.anthropic,
            gemini: byok.geminiApiKey,
            openaiCompatibleApiKey: byok.openaiCompatibleApiKey,
            openaiCompatibleBaseUrl: byok.openaiCompatibleBaseUrl,
            openaiCompatibleDefaultModel: byok.openaiCompatibleDefaultModel,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.skill) {
        throw new Error(data.error || 'Failed to generate skill')
      }
      setGeneratedSkillDraft(data.skill)
      if (refine) {
        setAiSkillRefinementPrompt('')
        showSuccess(`Refined skill draft: ${data.skill.name}`)
      } else {
        showSuccess(`Generated skill draft: ${data.skill.name}`)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate skill')
    } finally {
      setAiSkillGenerating(false)
    }
  }

  async function handleCreateGeneratedSkill() {
    if (!generatedSkillDraft) return

    setAiSkillCreating(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generatedSkillDraft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.skill) {
        throw new Error(data.error || 'Failed to create skill')
      }
      await loadSkills()
      setShowImportDialog(false)
      setImportSource('local')
      setAiSkillPrompt('')
      setAiSkillRefinementPrompt('')
      setGeneratedSkillDraft(null)
      showSuccess(`Created skill: ${data.skill.name}`)
      maybeWarnSkillSetup(showWarning, [data.skill as OpenClawSkill])
    } catch (err: any) {
      setError(err.message || 'Failed to create skill')
    } finally {
      setAiSkillCreating(false)
    }
  }

  async function openSkillViewer(skill: OpenClawSkill) {
    setViewingSkill(skill)
    setSkillSecrets(readLocalSecrets('skill', skill.name))
    setEditingSkill(false)
    setViewerAgentSearchQuery('')
    setLoadingSkillContent(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skill.name)}/content`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load skill content')
      }
      setSkillContent(data.content || '')
      setEditingDraft(data.content || '')
      setEditingSkillName(data.skill?.name || skill.name)
      setEditingSkillDescription(data.skill?.description || skill.description || '')
      setEditingSkillTags(((data.skill?.tags || skill.tags || []) as string[]).join(', '))
    } catch (err: any) {
      setError(err.message || 'Failed to load skill content')
    } finally {
      setLoadingSkillContent(false)
    }
  }

  async function exportSkill(skill: OpenClawSkill) {
    try {
      const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skill.name)}/content`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to export skill')
      }

      const blob = new Blob([data.content || ''], { type: 'text/markdown;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = buildSkillExportFilename(skill.name)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
      showSuccess(`Exported ${skill.name}`)
    } catch (err: any) {
      showError(err.message || 'Failed to export skill')
    }
  }

  async function exportSelectedSkill() {
    if (!selectedSkillForExport) {
      showWarning('Select exactly one skill to export.')
      return
    }
    await exportSkill(selectedSkillForExport)
  }

  useEffect(() => {
    if (!initialSkillName || didHandleInitialSkillName || allSkills.length === 0) return
    const matchedSkill = allSkills.find((skill) => skill.name === initialSkillName)
    if (!matchedSkill) return
    setSearchQuery(initialSkillName)
    setDidHandleInitialSkillName(true)
    void openSkillViewer(matchedSkill)
  }, [allSkills, didHandleInitialSkillName, initialSkillName])

  async function saveSkillContent() {
    if (!viewingSkill) return

    setSavingSkillContent(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(viewingSkill.name)}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editingDraft,
          name: editingSkillName,
          description: editingSkillDescription,
          tags: parseTagInput(editingSkillTags),
        })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save skill')
      }

      setSkillContent(data.content || editingDraft)
      setEditingDraft(data.content || editingDraft)
      setEditingSkillName(data.skill?.name || editingSkillName)
      setEditingSkillDescription(data.skill?.description || editingSkillDescription)
      setEditingSkillTags(((data.skill?.tags || parseTagInput(editingSkillTags)) as string[]).join(', '))
      setEditingSkill(false)
      showSuccess(viewingSkill.source === 'bundled'
        ? `Saved ${data.skill?.name || viewingSkill.name} as a workspace copy and marked it dirty`
        : `Saved ${data.skill?.name || viewingSkill.name} and marked it dirty`)
      await loadSkills()
      setViewingSkill(data.skill || viewingSkill)
    } catch (err: any) {
      setError(err.message || 'Failed to save skill')
    } finally {
      setSavingSkillContent(false)
    }
  }

  function getInstallRequirementCommands(skill: OpenClawSkill): string[] {
    return getDashboardInstallRequirementCommands(skill, runtimePlatform)
  }

  function openInstallRequirementsModal(skill: OpenClawSkill) {
    const installCommands = getInstallRequirementCommands(skill)
    if (installCommands.length === 0) {
      setError(`Skill "${skill.name}" has no dashboard-installable requirements yet`)
      return
    }

    setPendingInstallSkill(skill)
    setInstallRequirementsCommands(installCommands)
    setInstallRequirementsLogs(installCommands.map((command) => `$ ${command}`))
    setInstallRequirementsError(null)
    setInstallRequirementsDone(false)
    setShowInstallRequirementsModal(true)
  }

  function openSkillSetupModal(skill: OpenClawSkill) {
    const setupHint = getSetupHintForSkill(skill)
    if (!setupHint) {
      setError(`Skill "${skill.name}" has no dashboard-guided setup flow yet`)
      return
    }
    const initialValues = Object.fromEntries((setupHint.inputs || []).map((input) => [input.key, '']))
    setPendingSetupSkill(skill)
    setSkillSetupValues(initialValues)
    setSkillSetupLogs([`# ${skill.name} setup`, ...((setupHint.commands || []).map((command) => `$ ${command}`))])
    setSkillSetupError(null)
    setSkillSetupDone(false)
    setInteractiveSkillSetupSessionId(null)
    setInteractiveSkillSetupInput('')
    setShowSkillSetupModal(true)
  }

  async function completeSkillSetup(skill: OpenClawSkill) {
    setRunningSkillSetupName(skill.name)
    setSkillSetupError(null)
    setSkillSetupDone(false)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skill.name)}/complete-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: skillSetupValues,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.detail || data.error || `Failed to complete setup for ${skill.name}`)
      }
      const nextLogs = [...skillSetupLogs]
      if (Array.isArray(data.commands)) {
        for (const command of data.commands) {
          if (!nextLogs.includes(`$ ${command}`)) nextLogs.push(`$ ${command}`)
        }
      }
      if (Array.isArray(data.outputs)) {
        for (const output of data.outputs) {
          if (output?.stdout) nextLogs.push(output.stdout)
          if (output?.stderr) nextLogs.push(output.stderr)
        }
      }
      nextLogs.push(`✓ Completed setup flow for ${skill.name}`)
      setSkillSetupLogs(nextLogs)
      setSkillSetupDone(true)
      showSuccess(getSetupHintForSkill(skill)?.successMessage || `Completed setup flow for ${skill.name}`)
    } catch (err: any) {
      const message = err.message || `Failed to complete setup for ${skill.name}`
      setSkillSetupError(message)
      setSkillSetupLogs((current) => [...current, `✗ ${message}`])
      showToastError(message)
    } finally {
      setRunningSkillSetupName(null)
    }
  }

  async function pollInteractiveSkillSetupSession(sessionId: string) {
    const res = await fetch(`${API_BASE}/api/skills/setup-session/${encodeURIComponent(sessionId)}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || 'Failed to refresh setup session')
    }
    if (Array.isArray(data.logs)) {
      setSkillSetupLogs(data.logs)
    }
    if (data.error) {
      setSkillSetupError(data.error)
    }
    if (data.status === 'completed') {
      setRunningSkillSetupName(null)
      setSkillSetupDone(true)
      setInteractiveSkillSetupSessionId(null)
      showSuccess(getSetupHintForSkill(pendingSetupSkill || { name: '' })?.successMessage || 'Setup session completed')
    } else if (data.status === 'failed') {
      setRunningSkillSetupName(null)
      setInteractiveSkillSetupSessionId(null)
      if (data.error) {
        setSkillSetupError(data.error)
      }
    }
  }

  async function startInteractiveSkillSetup(skill: OpenClawSkill) {
    setRunningSkillSetupName(skill.name)
    setSkillSetupError(null)
    setSkillSetupDone(false)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skill.name)}/setup-session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: skillSetupValues }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || `Failed to start setup for ${skill.name}`)
      }
      setInteractiveSkillSetupSessionId(data.sessionId || null)
      setSkillSetupLogs(Array.isArray(data.logs) ? data.logs : skillSetupLogs)
      if (data.status !== 'running') {
        setRunningSkillSetupName(null)
      }
    } catch (err: any) {
      const message = err.message || `Failed to start setup for ${skill.name}`
      setSkillSetupError(message)
      setSkillSetupLogs((current) => [...current, `✗ ${message}`])
      setRunningSkillSetupName(null)
      showToastError(message)
    }
  }

  async function sendInteractiveSkillSetupInput() {
    if (!interactiveSkillSetupSessionId || !interactiveSkillSetupInput.trim()) return
    try {
      const res = await fetch(`${API_BASE}/api/skills/setup-session/${encodeURIComponent(interactiveSkillSetupSessionId)}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: interactiveSkillSetupInput }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send setup input')
      }
      setInteractiveSkillSetupInput('')
      await pollInteractiveSkillSetupSession(interactiveSkillSetupSessionId)
    } catch (err: any) {
      const message = err.message || 'Failed to send setup input'
      setSkillSetupError(message)
      showToastError(message)
    }
  }

  async function closeInteractiveSkillSetupSession() {
    if (!interactiveSkillSetupSessionId) return
    try {
      await fetch(`${API_BASE}/api/skills/setup-session/${encodeURIComponent(interactiveSkillSetupSessionId)}/close`, {
        method: 'POST',
      })
    } catch {}
    setInteractiveSkillSetupSessionId(null)
    setRunningSkillSetupName(null)
  }

  async function installSkillRequirements(skill: OpenClawSkill) {
    const installCommands = getInstallRequirementCommands(skill)

    if (installCommands.length === 0) {
      setError(`Skill "${skill.name}" has no dashboard-installable requirements yet`)
      return
    }

    setInstallingSkillRequirementsName(skill.name)
    setError(null)
    setInstallRequirementsLogs(installCommands.map((command) => `$ ${command}`))
    setInstallRequirementsError(null)
    setInstallRequirementsDone(false)
    try {
      const res = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skill.name)}/install-requirements`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.detail || data.error || `Failed to install requirements for ${skill.name}`)
      }
      const nextLogs = [...installCommands.map((command) => `$ ${command}`)]
      if (Array.isArray(data.outputs)) {
        for (const output of data.outputs) {
          if (output?.stdout) {
            nextLogs.push(output.stdout)
          }
          if (output?.stderr) {
            nextLogs.push(output.stderr)
          }
        }
      }
      nextLogs.push(`✓ Installed requirements for ${skill.name}`)
      setInstallRequirementsLogs(nextLogs)
      setInstallRequirementsDone(true)
      showSuccess(`Installed requirements for ${skill.name}`)
      maybeWarnSkillSetup(showWarning, [skill], { availableSecretKeys: getAvailableSecretKeysForSkill(skill) })
      await loadSkills()
    } catch (err: any) {
      setError(err.message || `Failed to install requirements for ${skill.name}`)
      setInstallRequirementsError(err.message || `Failed to install requirements for ${skill.name}`)
      setInstallRequirementsLogs((current) => [...current, `✗ ${err.message || `Failed to install requirements for ${skill.name}`}`])
      showToastError(err.message || `Failed to install requirements for ${skill.name}`)
    } finally {
      setInstallingSkillRequirementsName(null)
    }
  }

  // Filter skills
  const filteredSkills = allSkills.filter(skill => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesSearch =
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        (skill.tags || []).some(t => t.toLowerCase().includes(query))
      if (!matchesSearch) return false
    }

    // Assignment filter
    if (filterAssigned === 'assigned' && !assignedSkills.has(skill.name)) return false
    if (filterAssigned === 'available' && assignedSkills.has(skill.name)) return false
    if (!matchesSelectedSkillTags(skill, selectedSkillTags)) return false

    return true
  })

  // Sort: assigned first, then alphabetical
  const sortedSkills = [...filteredSkills].sort((a, b) => {
    const aAssigned = assignedSkills.has(a.name)
    const bAssigned = assignedSkills.has(b.name)

    if (aAssigned && !bAssigned) return -1
    if (!aAssigned && bAssigned) return 1
    return a.name.localeCompare(b.name)
  })

  const partnerSkillMatchers = useMemo(
    () => partnerInstallers.map((partner) => ({
      items: partner.skills.items || [],
      matchNames: partner.skills.matchNames || [],
      matchPrefixes: partner.skills.matchPrefixes || [],
    })),
    [partnerInstallers]
  )

  const {
    userSkills: sortedUserSkills,
    partnerSkills: sortedPartnerSkills,
    builtInSkills: sortedBuiltInSkills,
  } = useMemo(
    () => partitionSkillsBySection(sortedSkills, partnerSkillMatchers),
    [partnerSkillMatchers, sortedSkills]
  )

  const closeMatchSkills = useMemo(() => {
    if (!searchQuery.trim()) return []
    const exactNames = new Set(filteredSkills.map((skill) => skill.name))
    return [...allSkills]
      .filter((skill) => !exactNames.has(skill.name))
      .map((skill) => ({ skill, score: getSkillMatchScore(skill, searchQuery) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
      .slice(0, 5)
      .map((entry) => entry.skill)
  }, [allSkills, filteredSkills, searchQuery])

  const visibleInlineRegistrySuggestionsByProvider = useMemo(() => ({
    clawhub: inlineRegistrySuggestions.clawhub
      .map((skill) => ({ ...skill, installName: skill.install_name || skill.full_name || skill.name }))
      .filter((skill) => getRegistrySkillCompatibility(skill, runtimePlatform).compatible)
      .filter((skill) => !registryInstalledNames.has(`clawhub:${skill.installName}`))
      .slice(0, 5),
    shipables: inlineRegistrySuggestions.shipables
      .map((skill) => ({ ...skill, installName: skill.install_name || skill.full_name || skill.name }))
      .filter((skill) => getRegistrySkillCompatibility(skill, runtimePlatform).compatible)
      .filter((skill) => !registryInstalledNames.has(`shipables:${skill.installName}`))
      .slice(0, 5),
    tessl: inlineRegistrySuggestions.tessl
      .map((skill) => ({ ...skill, installName: skill.install_name || skill.full_name || skill.name }))
      .filter((skill) => getRegistrySkillCompatibility(skill, runtimePlatform).compatible)
      .filter((skill) => !registryInstalledNames.has(`tessl:${skill.installName}`))
      .slice(0, 5),
  }), [inlineRegistrySuggestions, registryInstalledNames, runtimePlatform])
  const hiddenInlineRegistrySuggestionsCount = useMemo(() => (
    inlineRegistrySuggestions.clawhub.filter((skill) => !getRegistrySkillCompatibility(skill, runtimePlatform).compatible).length +
    inlineRegistrySuggestions.shipables.filter((skill) => !getRegistrySkillCompatibility(skill, runtimePlatform).compatible).length +
    inlineRegistrySuggestions.tessl.filter((skill) => !getRegistrySkillCompatibility(skill, runtimePlatform).compatible).length
  ), [inlineRegistrySuggestions, runtimePlatform])
  const visibleRegistryResults = useMemo(
    () => registryResults.filter((skill) => getRegistrySkillCompatibility(skill, runtimePlatform).compatible),
    [registryResults, runtimePlatform]
  )
  const hiddenRegistryResultsCount = registryResults.length - visibleRegistryResults.length
  const registryCompatibilityNote = buildRegistryCompatibilityNote(runtimePlatform)
  const activeRegistryProvider = registryProvider === 'all'
    ? ALL_REGISTRIES_PROVIDER
    : (REGISTRY_PROVIDERS.find((provider) => provider.id === registryProvider) || REGISTRY_PROVIDERS[0])
  const serverManagedIntegrationSecrets = useMemo(
    () => buildServerManagedWorkspaceEntries(partnerDefinitions, serverPartnerSecretSummaries),
    [partnerDefinitions, serverPartnerSecretSummaries]
  )
  const sharedAvailableSecretKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const [key, value] of Object.entries(sharedGlobalSecrets)) {
      if (value.trim()) keys.add(key)
    }
    for (const [key, value] of Object.entries(sharedWorkspaceSecrets)) {
      if (value.trim()) keys.add(key)
    }
    for (const [key, value] of Object.entries(serverManagedIntegrationSecrets)) {
      if (value.trim()) keys.add(key)
    }
    return keys
  }, [serverManagedIntegrationSecrets, sharedGlobalSecrets, sharedWorkspaceSecrets])
  function getAvailableSecretKeysForSkill(skill: Pick<OpenClawSkill, 'name'>, localSecretsOverride?: Record<string, string>) {
    const keys = new Set(sharedAvailableSecretKeys)
    const localSecrets = localSecretsOverride || readLocalSecrets('skill', skill.name)
    for (const [key, value] of Object.entries(localSecrets)) {
      if (typeof value === 'string' && value.trim()) {
        keys.add(key)
      }
    }
    return keys
  }
  function getSetupHintForSkill(skill: Pick<OpenClawSkill, 'name' | 'setupRequirements' | 'requires' | 'secretRequirements'>, localSecretsOverride?: Record<string, string>) {
    return getSkillSetupHint(skill, { availableSecretKeys: getAvailableSecretKeysForSkill(skill, localSecretsOverride) })
  }
  const viewingSkillSetupHint = viewingSkill ? getSetupHintForSkill(viewingSkill, skillSecrets) : null
  const pendingSkillSetupHint = pendingSetupSkill ? getSetupHintForSkill(pendingSetupSkill, skillSetupValues) : null
  const pendingSkillSupportsDashboardSetup = pendingSetupSkill ? supportsDashboardSkillSetup(pendingSetupSkill) : false
  const pendingSkillSupportsInteractiveSetup = pendingSetupSkill ? supportsDashboardInteractiveSkillSetup(pendingSetupSkill) : false

  useEffect(() => {
    if (!interactiveSkillSetupSessionId) return
    const timer = window.setInterval(() => {
      void pollInteractiveSkillSetupSession(interactiveSkillSetupSessionId)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [interactiveSkillSetupSessionId])
  const allSkillTags = useMemo(() => collectSkillTags(allSkills), [allSkills])
  const selectedSkillTagNames = allSkillTags.filter((tag) => selectedSkillTags.has(tag))
  const collapsedSkillTags = [
    ...selectedSkillTagNames,
    ...allSkillTags.filter((tag) => !selectedSkillTags.has(tag)).slice(0, Math.max(0, 12 - selectedSkillTagNames.length)),
  ]
  const visibleSkillTags = showAllSkillTags ? allSkillTags : collapsedSkillTags
  const visiblePartnerInstallers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return partnerInstallers.filter((partner) => {
      if (!query) return true
      return [
        partner.name,
        partner.description,
        partner.skills.label || '',
        ...(partner.skills.items || []),
      ].join(' ').toLowerCase().includes(query)
    })
  }, [partnerInstallers, searchQuery])
  const partnerInstallerBySlug = useMemo(() => (
    Object.fromEntries(partnerInstallers.map((partner) => [partner.slug, partner]))
  ), [partnerInstallers])
  const missingGeneratedSkillSections = generatedSkillDraft
    ? SKILL_SPEC_SECTIONS.filter((section) => !generatedSkillDraft.content.includes(section))
    : []
  const viewingSkillAssignmentBuckets = useMemo(() => {
    if (!viewingSkill) {
      return { assignedAgentIds: [], unassignedAgentIds: [] }
    }
    return getSkillAssignmentBuckets(viewingSkill.name, availableAgents, agentSkillMap)
  }, [agentSkillMap, availableAgents, viewingSkill])
  const filteredViewerAvailableAgents = viewingSkillAssignmentBuckets.unassignedAgentIds.filter((agent) =>
    agent.toLowerCase().includes(viewerAgentSearchQuery.trim().toLowerCase())
  )
  const filteredBulkAgents = useMemo(
    () => filterAssignableAgents(availableAgents, bulkAgentSearchQuery),
    [availableAgents, bulkAgentSearchQuery]
  )
  const selectedSkillPartition = useMemo(
    () => partitionSelectedSkills(allSkills, selectedSkillIds),
    [allSkills, selectedSkillIds]
  )
  const selectedSkillForExport = useMemo(
    () => getSelectedSkillForExport(allSkills, selectedSkillIds),
    [allSkills, selectedSkillIds]
  )
  const pendingDeletePartition = useMemo(
    () => partitionSelectedSkills(allSkills, new Set(pendingDeleteSkillNames)),
    [allSkills, pendingDeleteSkillNames]
  )
  const pendingDeleteImpact = useMemo(
    () => summarizeSkillDeleteImpact(pendingDeletePartition.deletableSkills, skillUsage),
    [pendingDeletePartition.deletableSkills, skillUsage]
  )
  const selectedAgentAssignedSkills = useMemo(
    () => Array.from(assignedSkills).sort((a, b) => a.localeCompare(b)),
    [assignedSkills]
  )
  const assignedSkillBadges = useMemo(
    () => buildAssignedSkillBadges(selectedAgentAssignedSkills),
    [selectedAgentAssignedSkills]
  )
  const agentScope = useMemo(
    () => buildAgentSkillsScope({
      agentId,
      initialAgentId,
      assignedSkillNames: selectedAgentAssignedSkills,
    }),
    [agentId, initialAgentId, selectedAgentAssignedSkills]
  )

  async function deleteSkillByName(skillName: string) {
    const response = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(skillName)}`, {
      method: 'DELETE',
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.error || `Failed to delete ${skillName}`)
    }
  }

  async function handleDeleteSelectedSkills(skillNames: string[]) {
    if (skillNames.length === 0) return
    setDeletingSkills(true)
    setError(null)
    try {
      for (const skillName of skillNames) {
        await deleteSkillByName(skillName)
      }
      if (viewingSkill && skillNames.includes(viewingSkill.name)) {
        setViewingSkill(null)
        setEditingSkill(false)
        setEditingSkillName('')
        setEditingSkillDescription('')
        setSkillContent('')
        setEditingDraft('')
      }
      showSuccess(`Deleted ${skillNames.length} user skill${skillNames.length !== 1 ? 's' : ''}`)
      await loadSkills()
      setSelectedSkillIds((current) => {
        const next = new Set(current)
        skillNames.forEach((skillName) => next.delete(skillName))
        return next
      })
      setPendingDeleteSkillNames([])
      setShowBulkDeleteConfirm(false)
    } catch (err: any) {
      setError(err.message || 'Failed to delete selected skills')
    } finally {
      setDeletingSkills(false)
    }
  }

  // Filter agents for searchable dropdown
  const filteredAgents = availableAgents.filter(agent =>
    agent.toLowerCase().includes(agentSearchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading skills...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 flex-1 overflow-y-auto bg-gray-50 px-4 py-4 dark:bg-gray-900 sm:px-6 sm:py-6">
      <div className="w-full min-w-0 max-w-none">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                  Skills
                </h1>
              {availableAgents.length > 0 && (
                <div className="relative">
                  <input
                    type="text"
                    value={agentSearchQuery || agentId}
                    onChange={(e) => {
                      setAgentSearchQuery(e.target.value)
                      setShowAgentDropdown(true)
                    }}
                    onFocus={() => setShowAgentDropdown(true)}
                    placeholder="Selected agent"
                    className="h-11 min-w-48 rounded-lg border border-gray-200 bg-white px-4 py-2 pr-10 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                  {(agentSearchQuery || agentId) && (
                    <button
                      onClick={() => {
                        setAgentId(availableAgents.length > 0 ? availableAgents[0] : '')
                        setAgentSearchQuery('')
                        setShowAgentDropdown(false)
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Clear agent selection"
                    >
                      ✕
                    </button>
                  )}
                  {showAgentDropdown && filteredAgents.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-60 overflow-y-auto dark:border-gray-700 dark:bg-gray-800">
                      {filteredAgents.map(id => (
                        <button
                          key={id}
                          onClick={() => {
                            setAgentId(id)
                            setAgentSearchQuery('')
                            setShowAgentDropdown(false)
                            setFilterAssigned('assigned')
                          }}
                          className={`w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors ${
                            id === agentId ? 'bg-blue-100 dark:bg-blue-900/30 font-medium' : ''
                          }`}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </div>
              <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {allSkills.length} skill{allSkills.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <button
                  onClick={() => setViewMode('grid')}
                  title="Grid view"
                  className={`${headerToggleButtonClass} ${viewMode === 'grid' ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300'}`}
                >
                  <ProductIconCell iconName="grid" label="Grid view" size="sm" className="border-transparent bg-transparent text-current" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  title="List view"
                  className={`border-l border-gray-200 dark:border-gray-700 ${headerToggleButtonClass} ${viewMode === 'list' ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300'}`}
                >
                  <ProductIconCell iconName="list" label="List view" size="sm" className="border-transparent bg-transparent text-current" />
                </button>
              </div>
              <button
                onClick={() => {
                  setSelectionMode((current) => {
                    if (current) {
                      setSelectedSkillIds(new Set())
                    }
                    return !current
                  })
                }}
                className={`${headerSecondaryButtonClass} ${
                  selectionMode
                    ? headerSecondaryButtonActiveClass
                    : headerSecondaryButtonIdleClass
                }`}
              >
                <span className="text-base leading-none">☑</span>
                {selectionMode ? 'Cancel' : 'Select'}
              </button>
              {selectionMode && filteredSkills.length > 0 && (
                <button
                  onClick={() => setSelectedSkillIds((current) => toggleVisibleSelections(current, filteredSkills.map((skill) => skill.name)))}
                  className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}
                  title="Toggle select all visible skills"
                >
                  {filteredSkills.every((skill) => selectedSkillIds.has(skill.name)) ? 'Deselect All' : 'Select All'}
                </button>
              )}
              <button
                onClick={() => openImportDialog('ai')}
                className={headerPrimaryButtonClass}
              >
                <span className="inline-flex items-center gap-1.5">
                  <ProductIconCell iconName="ai" label="Create with AI" size="sm" className="border-white/20 bg-white/10 text-white" />
                  Create
                </span>
              </button>
              <div className="relative">
                <button
                  ref={skillActionsMenuButtonRef}
                  onClick={() => setShowSkillActionsMenu(!showSkillActionsMenu)}
                  className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}
                  title="Actions"
                >
                  <ProductIconCell iconName="skill" label="Actions" size="sm" className="border-transparent bg-transparent text-current" /> Actions <span className="text-xs">▾</span>
                </button>
                {showSkillActionsMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSkillActionsMenu(false)} />
                    <div
                      className="z-20 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
                      style={skillActionsMenuButtonRef.current ? getViewportSafeDropdownStyle(skillActionsMenuButtonRef.current.getBoundingClientRect(), 224) : undefined}
                    >
                      <button
                        onClick={() => {
                          setShowSkillActionsMenu(false)
                          openImportDialog('local')
                        }}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <ProductIconCell iconName="directory" label="Import Local Skill" size="sm" className="border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Import Local Skill</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowSkillActionsMenu(false)
                          openImportDialog('github')
                        }}
                        className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
                      >
                        <ProductIconCell iconName="github" label="Import from GitHub" size="sm" className="border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Import from GitHub</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowSkillActionsMenu(false)
                          openImportDialog('registry')
                        }}
                        className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
                      >
                        <ProductIconCell iconName="registry" label="Browse Registries" size="sm" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Browse Registries</span>
                      </button>
                      {partnerInstallers.length > 0 && (
                        <button
                          onClick={() => {
                            setShowSkillActionsMenu(false)
                            openImportDialog('partner')
                          }}
                          className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
                        >
                          <ProductIconCell iconName="partner" label="Partner Skills" size="sm" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" />
                          <span className="font-medium text-gray-900 dark:text-gray-100">Partner Skills</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setShowSkillActionsMenu(false)
                          void exportSelectedSkill()
                        }}
                        disabled={!selectedSkillForExport}
                        className={`flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-left text-sm dark:border-gray-700 ${
                          selectedSkillForExport
                            ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            : 'cursor-not-allowed text-gray-400 dark:text-gray-500'
                        }`}
                      >
                        <ProductIconCell iconName="export" label="Export Skill" size="sm" className="border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Export Skill</span>
                      </button>
                      <button
                        onClick={async () => {
                          setShowSkillActionsMenu(false)
                          await loadSkills()
                        }}
                        className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
                      >
                        <ProductIconCell iconName="refresh" label="Refresh Skills" size="sm" className="border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Refresh Skills</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {availableAgents.length > 0 ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/20">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-blue-900 dark:text-blue-200">{agentScope.title}</div>
                    <div className="mt-1 text-xs text-blue-800/80 dark:text-blue-300/80">{agentScope.subtitle}</div>
                  </div>
                  {agentScope.isAgentScoped && (
                    <div className="inline-flex items-center gap-2">
                      <span className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-700 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300">
                        {agentScope.assignedCountLabel}
                      </span>
                      {agentScope.isInitialScoped && (
                        <span className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-700 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300">
                          Agent Flow
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {agentId && (
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Assigned Skills
                  </div>
                  {selectedAgentAssignedSkills.length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">No skills assigned yet.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {assignedSkillBadges.map(({ name: skillName, needsSetup }) => (
                        <div
                          key={`selected-agent-skill-${skillName}`}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-medium pr-1"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery(skillName)
                              setFilterAssigned('assigned')
                            }}
                            className="rounded-full rounded-r-none px-3 py-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                            title={`Focus ${skillName}`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {skillName}
                              {needsSetup && <span className="text-[10px]">⚠</span>}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={removingAssignedSkillName === skillName}
                            onClick={async () => {
                              if (!agentId) return
                              setRemovingAssignedSkillName(skillName)
                              setError(null)
                              try {
                                const nextSkills = selectedAgentAssignedSkills.filter((skill) => skill !== skillName)
                                await persistAgentSkills(agentId, nextSkills)
                                showSuccess(`Removed ${skillName} from ${agentId}`)
                              } catch (err: any) {
                                setError(err.message || `Failed to remove ${skillName}`)
                              } finally {
                                setRemovingAssignedSkillName(null)
                              }
                            }}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-blue-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors"
                            title={`Remove ${skillName}`}
                            aria-label={`Remove ${skillName}`}
                          >
                            {removingAssignedSkillName === skillName ? '…' : '×'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-600">
              No agents found in workspace. Create an agent to manage skills.
            </p>
          )}
        </div>

        {availableAgents.length === 0 && !loading && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-300">
            No agents in workspace — browsing skill catalog. Create an agent to start assigning skills.
          </div>
        )}

        {(availableAgents.length > 0 || allSkills.length > 0) && (
          <>
        {/* Filters */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                onClick={() => setFilterAssigned('all')}
                className={`${headerSecondaryButtonClass} ${
                  filterAssigned === 'all'
                    ? headerSecondaryButtonActiveClass
                    : headerSecondaryButtonIdleClass
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterAssigned('assigned')}
                className={`${headerSecondaryButtonClass} ${
                  filterAssigned === 'assigned'
                    ? headerSecondaryButtonActiveClass
                    : headerSecondaryButtonIdleClass
                }`}
              >
                Assigned
              </button>
              <button
                onClick={() => setFilterAssigned('available')}
                className={`${headerSecondaryButtonClass} ${
                  filterAssigned === 'available'
                    ? headerSecondaryButtonActiveClass
                    : headerSecondaryButtonIdleClass
                }`}
              >
                Available
              </button>
            </div>

            <div className="relative min-w-0 flex-1">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 w-full rounded-xl border-2 border-sky-200 bg-sky-50/55 py-2 pl-10 pr-10 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-500 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100 dark:border-sky-800 dark:bg-slate-900 dark:text-gray-100 dark:placeholder:text-gray-400 dark:focus:border-sky-400 dark:focus:bg-slate-950 dark:focus:ring-sky-950/70"
              />
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sky-500 dark:text-sky-400">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.5 14.5 4 4m-1.833-8.167a6.333 6.333 0 1 1-12.667 0 6.333 6.333 0 0 1 12.667 0Z" />
                </svg>
              </div>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 transition-colors hover:bg-white/80 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {allSkillTags.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">Filter by tags:</span>
                <div className={`min-w-0 flex-1 gap-2 ${showAllSkillTags ? 'flex flex-wrap' : 'flex flex-nowrap overflow-hidden'}`}>
                  {visibleSkillTags.map((tag) => {
                    const selected = selectedSkillTags.has(tag)
                    return (
                      <button
                        key={tag}
                        onClick={() => setSelectedSkillTags((current) => {
                          const next = new Set(current)
                          if (next.has(tag)) next.delete(tag)
                          else next.add(tag)
                          return next
                        })}
                        className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? 'border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300 dark:hover:bg-gray-800'
                        }`}
                      >
                        {tag}
                      </button>
                    )
                  })}
                </div>
                {allSkillTags.length > collapsedSkillTags.length && (
                  <button
                    type="button"
                    onClick={() => setShowAllSkillTags((current) => !current)}
                    className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    aria-label={showAllSkillTags ? 'Collapse tag filters' : 'Expand tag filters'}
                    title={showAllSkillTags ? 'Show fewer tags' : 'Show more tags'}
                  >
                    {showAllSkillTags ? '▼' : '▶'}
                  </button>
                )}
                {selectedSkillTags.size > 0 && (
                  <button
                    onClick={() => setSelectedSkillTags(new Set())}
                    className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Popular Skills */}
        {skillUsage.size > 0 && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border mb-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Most Popular Skills</h3>
            <div className="flex items-center gap-3">
              {popularSkills.length > collapsedPopularSkills.length ? (
                <button
                  type="button"
                  onClick={() => setShowAllPopularSkills((current) => !current)}
                  className="shrink-0 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  aria-label={showAllPopularSkills ? 'Collapse popular skills' : 'Expand popular skills'}
                  title={showAllPopularSkills ? 'Show fewer popular skills' : 'Show more popular skills'}
                >
                  {showAllPopularSkills ? '▼' : '▶'}
                </button>
              ) : (
                <span className="w-4 shrink-0" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className={`flex min-w-0 gap-2 ${showAllPopularSkills ? 'flex-wrap' : 'flex-nowrap overflow-hidden'}`}>
                  {(showAllPopularSkills ? popularSkills : collapsedPopularSkills)
                    .map(([skillName, users]) => (
                      <button
                        key={skillName}
                        onClick={() => {
                          setSearchQuery(skillName)
                          setFilterAssigned('all')
                        }}
                        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 transition-colors hover:border-purple-300 hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-900/30 dark:hover:border-purple-600 dark:hover:bg-purple-900/50"
                        title={`Search for ${skillName}`}
                      >
                        <span className="text-sm font-medium text-purple-900 dark:text-purple-400">{skillName}</span>
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-600 dark:bg-purple-900/50 dark:text-purple-400">
                          {users.length}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
              {!showAllPopularSkills && popularSkills.length > collapsedPopularSkills.length && (
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  +{popularSkills.length - collapsedPopularSkills.length} more
                </span>
              )}
            </div>
          </div>
        )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-300">
            <span>{buildSkillsPageCountLabel(filteredSkills.length, allSkills.length)}</span>
            {selectionMode && filteredSkills.length > 0 && (
              <button
                onClick={() => setSelectedSkillIds((current) => toggleVisibleSelections(current, filteredSkills.map((skill) => skill.name)))}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
                title="Toggle select all visible skills"
              >
                {filteredSkills.every((skill) => selectedSkillIds.has(skill.name)) ? 'Deselect All Visible' : 'Select All Visible'}
              </button>
            )}
          </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-100 border border-red-300 text-red-800 px-4 py-2 rounded-lg mb-4 flex items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <ProductIconCell iconName="delete" label="Error" size="sm" className="border-transparent bg-transparent text-current" />
              {error}
            </span>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Saving indicator */}
        {saving && (
          <div className="bg-blue-100 border border-blue-300 text-blue-800 px-4 py-2 rounded-lg mb-4">
            <span className="inline-flex items-center gap-2">
              <ProductIconCell iconName="save" label="Saving changes" size="sm" className="border-transparent bg-transparent text-current" />
              Saving changes...
            </span>
          </div>
        )}

        {visiblePartnerInstallers.length > 0 && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border mb-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={() => setShowPartnerInstallers((current) => !current)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  <span>{showPartnerInstallers ? '▼' : '▶'}</span>
                  <span>Partner Capabilities</span>
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Agent skills and separately installed OpenClaw runtime plugins from enabled partner integrations.
                </p>
              </div>
              <button
                onClick={() => openImportDialog('partner')}
                className="text-xs font-medium text-purple-600 hover:text-purple-700"
              >
                Browse all
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-partners-wizard'))}
                className="text-xs font-medium text-sky-600 hover:text-sky-700"
              >
                Configure partners
              </button>
            </div>
            {showPartnerInstallers && (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="md:col-span-2 xl:col-span-3">
                <TermsRiskNotice
                  title="Partner install reminder"
                  body="Agent skills are assigned to agents. Curated OpenClaw plugins extend the runtime and are not ClawMax dashboard plugins. Both can add dependencies and external access; review them before installing."
                />
              </div>
              {visiblePartnerInstallers.map((partner) => (
                <div key={`partner-surface-${partner.slug}`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center gap-2">
                    <PartnerLogo
                      slug={partner.slug}
                      name={partner.name}
                      logoUrl={partner.logoUrl}
                    />
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{partner.name}</div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{partner.description}</div>
                  {partner.skills.items && partner.skills.items.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {partner.skills.items.map((item) => (
                        <button
                          key={`${partner.slug}-${item}`}
                          type="button"
                          onClick={() => focusSkill(item)}
                          className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0 flex-1 text-xs text-gray-500 dark:text-gray-400">
                      {partner.skills.label || 'Partner skill installer'}
                      {partner.skills.mode === 'curated-installer' ? ' · usually 1-3 minutes' : ''}
                    </div>
                    {partner.skills.mode === 'curated-installer' ? (
                      (() => {
                        const status = partner.skills.commandId ? partnerPluginStatuses[partner.skills.commandId] : undefined
                        const installed = !!status?.installed
                        const running = partnerInstalling === partner.slug
                        return (
                          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                            {installed && (
                              <span className="px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded-md">
                                Installed
                              </span>
                            )}
                            <button
                              onClick={() => void runPartnerPluginAction(partner, 'install')}
                              disabled={!!partnerInstalling || installed}
                              title={installed ? `${partner.name} plugin is already installed` : undefined}
                              className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                            >
                              {running ? 'Running...' : 'Install OpenClaw Plugin'}
                            </button>
                            <button
                              onClick={() => confirmPartnerPluginUninstall(partner)}
                              disabled={!!partnerInstalling || !installed}
                              title={!installed ? `${partner.name} plugin is not installed` : undefined}
                              className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              Uninstall
                            </button>
                          </div>
                        )
                      })()
                    ) : (
                      <button
                        onClick={() => openImportDialog('partner', partner.slug)}
                        className="px-3 py-1.5 text-xs font-medium rounded-md border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                      >
                        Browse
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* Skills Grid */}
        {filteredSkills.length === 0 ? (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border text-center">
              <div className="mb-2 inline-flex">
                <ProductIconCell iconName="details" label="No exact skill matches" size="lg" className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">No exact skill matches yet</p>
              {searchQuery.trim() && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Try a close match below or discover something new from the registry.
                </p>
              )}
            </div>
            {searchQuery.trim() && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {closeMatchSkills.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Close matches in this workspace</div>
                    <div className="space-y-2">
                      {closeMatchSkills.map((skill) => (
                        <button
                          key={skill.name}
                          onClick={() => setSearchQuery(skill.name)}
                          className="w-full text-left rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="inline-flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                          <ProductIconCell
                            iconName={resolveSkillVisual(skill).iconName}
                            emoji={resolveSkillVisual(skill).emoji}
                            label={skill.name}
                            size="sm"
                            className="border-transparent bg-transparent text-current"
                          />
                          {skill.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{skill.description}</div>
                      </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className={`bg-white dark:bg-gray-800 p-5 rounded-lg border ${closeMatchSkills.length === 0 ? 'lg:col-span-2' : ''}`}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Discover in Registry</div>
                    <button
                      onClick={() => {
                        setShowImportDialog(true)
                        setImportSource('registry')
                        setRegistryProvider('clawhub')
                        setRegistryQuery(searchQuery.trim())
                        searchRegistry(searchQuery.trim(), 20, 'clawhub')
                      }}
                      className="text-xs font-medium text-purple-600 hover:text-purple-700"
                    >
                      Open registry
                    </button>
                  </div>
                  <div className="mb-3">
                    <TermsRiskNotice
                      title="Registry install reminder"
                      body="Registry skills may come from third parties and can require binaries, credentials, or setup flows. Review the skill before installing it into your workspace."
                    />
                  </div>
                  {inlineRegistryLoading ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">Searching registry…</div>
                  ) : (visibleInlineRegistrySuggestionsByProvider.clawhub.length > 0 || visibleInlineRegistrySuggestionsByProvider.shipables.length > 0 || visibleInlineRegistrySuggestionsByProvider.tessl.length > 0) ? (
                    <div className="space-y-3">
                      {hiddenInlineRegistrySuggestionsCount > 0 && runtimePlatform !== 'unknown' && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Showing only skills compatible with this {runtimePlatform === 'darwin' ? 'macOS' : runtimePlatform} runtime.
                        </div>
                      )}
                      <div className="grid gap-3 lg:grid-cols-2">
                      {(['clawhub', 'shipables', 'tessl'] as RegistryProvider[]).map((provider) => {
                        const suggestions = visibleInlineRegistrySuggestionsByProvider[provider]
                        if (suggestions.length === 0) return null
                        const providerMeta = REGISTRY_PROVIDERS.find((entry) => entry.id === provider)!
                        return (
                          <div key={provider} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {providerMeta.label}
                              </div>
                              <button
                                onClick={() => {
                                  setShowImportDialog(true)
                                  setImportSource('registry')
                                  setRegistryProvider(provider)
                                  setRegistryQuery(searchQuery.trim())
                                  searchRegistry(searchQuery.trim(), 20, provider)
                                }}
                                className="text-xs font-medium text-purple-600 hover:text-purple-700"
                              >
                                Open
                              </button>
                            </div>
                            <div className="space-y-2">
                              {suggestions.map((skill) => (
                                <div key={`${provider}:${skill.installName}`} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{skill.installName}</div>
                                      {skill.description && <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{skill.description}</div>}
                                    </div>
                                    <button
                                      onClick={() => installRegistrySkill(skill.installName, provider, false, skill)}
                                      disabled={!!registryInstalling}
                                      className="shrink-0 px-2.5 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                                    >
                                      {registryInstalling === skill.installName ? 'Installing...' : 'Install'}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400">No registry suggestions yet for “{searchQuery.trim()}”.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {searchQuery.trim() && (closeMatchSkills.length > 0 || inlineRegistryLoading || visibleInlineRegistrySuggestionsByProvider.clawhub.length > 0 || visibleInlineRegistrySuggestionsByProvider.shipables.length > 0 || visibleInlineRegistrySuggestionsByProvider.tessl.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {closeMatchSkills.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Close installed-skill matches</div>
                    <div className="flex flex-wrap gap-2">
                      {closeMatchSkills.map((skill) => (
                        <button
                          key={skill.name}
                          onClick={() => setSearchQuery(skill.name)}
                          className="inline-flex items-center rounded-full border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                        >
                          {skill.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {(inlineRegistryLoading || visibleInlineRegistrySuggestionsByProvider.clawhub.length > 0 || visibleInlineRegistrySuggestionsByProvider.shipables.length > 0 || visibleInlineRegistrySuggestionsByProvider.tessl.length > 0) && (
                  <div className={`bg-white dark:bg-gray-800 p-4 rounded-lg border ${closeMatchSkills.length === 0 ? 'lg:col-span-2' : ''}`}>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Also discover in Registry</div>
                      <button
                        onClick={() => {
                          setShowImportDialog(true)
                          setImportSource('registry')
                          setRegistryProvider('clawhub')
                          setRegistryQuery(searchQuery.trim())
                          searchRegistry(searchQuery.trim(), 20, 'clawhub')
                        }}
                        className="text-xs font-medium text-purple-600 hover:text-purple-700"
                      >
                        Open registry
                      </button>
                    </div>
                    {inlineRegistryLoading ? (
                      <div className="text-sm text-gray-500 dark:text-gray-400">Searching registry…</div>
                    ) : (
                      <div className="space-y-3">
                        {hiddenInlineRegistrySuggestionsCount > 0 && runtimePlatform !== 'unknown' && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Showing only skills compatible with this {runtimePlatform === 'darwin' ? 'macOS' : runtimePlatform} runtime.
                          </div>
                        )}
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {(['clawhub', 'shipables', 'tessl'] as RegistryProvider[]).map((provider) => {
                          const suggestions = visibleInlineRegistrySuggestionsByProvider[provider]
                          if (suggestions.length === 0) return null
                          const providerMeta = REGISTRY_PROVIDERS.find((entry) => entry.id === provider)!
                          return (
                            <div key={provider} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  {providerMeta.label}
                                </div>
                                <button
                                  onClick={() => {
                                    setShowImportDialog(true)
                                    setImportSource('registry')
                                    setRegistryProvider(provider)
                                    setRegistryQuery(searchQuery.trim())
                                    searchRegistry(searchQuery.trim(), 20, provider)
                                  }}
                                  className="text-xs font-medium text-purple-600 hover:text-purple-700"
                                >
                                  Open
                                </button>
                              </div>
                              <div className="space-y-2">
                                {suggestions.map((skill) => (
                                  <div key={`${provider}:${skill.installName}`} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{skill.installName}</div>
                                      {skill.description && <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{skill.description}</div>}
                                    </div>
                                    <button
                                      onClick={() => installRegistrySkill(skill.installName, provider, false, skill)}
                                      disabled={!!registryInstalling}
                                      className="shrink-0 px-2.5 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                                    >
                                      {registryInstalling === skill.installName ? 'Installing...' : 'Install'}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {sortedUserSkills.length > 0 && (
              <div className="mb-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">User Skills</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Imported, managed, or workspace-copy skills created in this workspace.
                    </p>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {sortedUserSkills.length} skill{sortedUserSkills.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {viewMode === 'list' ? (
                  <SkillsListTable
                    skills={sortedUserSkills}
                    assignedSkills={assignedSkills}
                    skillUsage={skillUsage}
                    selectionMode={selectionMode}
                    selectedSkillIds={selectedSkillIds}
                    onToggle={toggleSkill}
                    onView={openSkillViewer}
                    onExport={exportSkill}
                    onDelete={(skill) => {
                      setPendingDeleteSkillNames([skill.name])
                      setShowBulkDeleteConfirm(true)
                    }}
                    canDelete={isDeletableUserSkill}
                    onToggleSelect={(skillName) => setSelectedSkillIds((current) => toggleItemSelection(current, skillName))}
                    onToggleSelectAll={() => setSelectedSkillIds((current) => toggleVisibleSelections(current, sortedUserSkills.map((skill) => skill.name)))}
                    getSetupHint={getSkillSetupHint}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {sortedUserSkills.map(skill => {
                      const users = skillUsage.get(skill.name) || []
                      return (
                        <SkillCard
                          key={skill.name}
                          skill={skill}
                          assigned={assignedSkills.has(skill.name)}
                          onToggle={() => toggleSkill(skill.name)}
                          onView={() => openSkillViewer(skill)}
                          onExport={() => { void exportSkill(skill) }}
                          canDelete={isDeletableUserSkill(skill)}
                          onDelete={() => {
                            setPendingDeleteSkillNames([skill.name])
                            setShowBulkDeleteConfirm(true)
                          }}
                          usageCount={users.length}
                          usedBy={users}
                          selectionMode={selectionMode}
                          isSelected={selectedSkillIds.has(skill.name)}
                          onToggleSelect={() => setSelectedSkillIds((current) => toggleItemSelection(current, skill.name))}
                          onInstallRequirements={skill.install && skill.install.length > 0 ? () => openInstallRequirementsModal(skill) : undefined}
                          installingRequirements={installingSkillRequirementsName === skill.name}
                          setupHint={getSetupHintForSkill(skill)}
                          onOpenSetup={getSetupHintForSkill(skill) ? () => openSkillSetupModal(skill) : undefined}
                          runtimePlatform={runtimePlatform}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            {sortedPartnerSkills.length > 0 && (
              <div className="mb-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Partner Skills</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Skills imported from enabled partner integrations and partner-backed catalogs.
                    </p>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {sortedPartnerSkills.length} skill{sortedPartnerSkills.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {viewMode === 'list' ? (
                  <SkillsListTable
                    skills={sortedPartnerSkills}
                    assignedSkills={assignedSkills}
                    skillUsage={skillUsage}
                    selectionMode={selectionMode}
                    selectedSkillIds={selectedSkillIds}
                    onToggle={toggleSkill}
                    onView={openSkillViewer}
                    onExport={exportSkill}
                    onDelete={(skill) => {
                      setPendingDeleteSkillNames([skill.name])
                      setShowBulkDeleteConfirm(true)
                    }}
                    canDelete={isDeletableUserSkill}
                    onToggleSelect={(skillName) => setSelectedSkillIds((current) => toggleItemSelection(current, skillName))}
                    onToggleSelectAll={() => setSelectedSkillIds((current) => toggleVisibleSelections(current, sortedPartnerSkills.map((skill) => skill.name)))}
                    getSetupHint={getSkillSetupHint}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {sortedPartnerSkills.map(skill => {
                      const users = skillUsage.get(skill.name) || []
                      return (
                        <SkillCard
                          key={skill.name}
                          skill={skill}
                          assigned={assignedSkills.has(skill.name)}
                          onToggle={() => toggleSkill(skill.name)}
                          onView={() => openSkillViewer(skill)}
                          onExport={() => { void exportSkill(skill) }}
                          canDelete={isDeletableUserSkill(skill)}
                          onDelete={() => {
                            setPendingDeleteSkillNames([skill.name])
                            setShowBulkDeleteConfirm(true)
                          }}
                          usageCount={users.length}
                          usedBy={users}
                          selectionMode={selectionMode}
                          isSelected={selectedSkillIds.has(skill.name)}
                          onToggleSelect={() => setSelectedSkillIds((current) => toggleItemSelection(current, skill.name))}
                          onInstallRequirements={skill.install && skill.install.length > 0 ? () => openInstallRequirementsModal(skill) : undefined}
                          installingRequirements={installingSkillRequirementsName === skill.name}
                          setupHint={getSetupHintForSkill(skill)}
                          onOpenSetup={getSetupHintForSkill(skill) ? () => openSkillSetupModal(skill) : undefined}
                          runtimePlatform={runtimePlatform}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            {(sortedUserSkills.length > 0 || sortedPartnerSkills.length > 0) && sortedBuiltInSkills.length > 0 && (
              <div className="pt-2">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Built-in Skills</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Core skills shipped with ClawMax and OpenClaw.
                    </p>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {sortedBuiltInSkills.length} skill{sortedBuiltInSkills.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            )}
            {viewMode === 'list' ? (
              <SkillsListTable
                skills={sortedBuiltInSkills}
                assignedSkills={assignedSkills}
                skillUsage={skillUsage}
                selectionMode={selectionMode}
                selectedSkillIds={selectedSkillIds}
                onToggle={toggleSkill}
                onView={openSkillViewer}
                onExport={exportSkill}
                onDelete={() => {}}
                canDelete={() => false}
                onToggleSelect={(skillName) => setSelectedSkillIds((current) => toggleItemSelection(current, skillName))}
                onToggleSelectAll={() => setSelectedSkillIds((current) => toggleVisibleSelections(current, sortedBuiltInSkills.map((skill) => skill.name)))}
                getSetupHint={getSkillSetupHint}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {sortedBuiltInSkills.map(skill => {
                  const users = skillUsage.get(skill.name) || []
                  return (
                    <SkillCard
                      key={skill.name}
                      skill={skill}
                      assigned={assignedSkills.has(skill.name)}
                      onToggle={() => toggleSkill(skill.name)}
                      onView={() => openSkillViewer(skill)}
                      onExport={() => { void exportSkill(skill) }}
                      canDelete={false}
                      usageCount={users.length}
                      usedBy={users}
                      selectionMode={selectionMode}
                      isSelected={selectedSkillIds.has(skill.name)}
                      onToggleSelect={() => setSelectedSkillIds((current) => toggleItemSelection(current, skill.name))}
                      onInstallRequirements={skill.install && skill.install.length > 0 ? () => openInstallRequirementsModal(skill) : undefined}
                      installingRequirements={installingSkillRequirementsName === skill.name}
                      setupHint={getSetupHintForSkill(skill)}
                      onOpenSetup={getSetupHintForSkill(skill) ? () => openSkillSetupModal(skill) : undefined}
                      runtimePlatform={runtimePlatform}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )}
        </>
        )}

        {viewingSkill && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 p-4 sm:py-6">
            <div className="mx-auto flex min-h-full w-full items-start justify-center">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ProductIconCell iconName={viewingSkillVisual?.iconName} emoji={viewingSkillVisual?.emoji} label={viewingSkill.name} size="sm" />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{viewingSkill.name}</h2>
                    <span className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                      {viewingSkill.source}
                    </span>
                    {viewingSkill.registryProvider && (
                      <span className="text-xs px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        {viewingSkill.registryProvider}
                      </span>
                    )}
                    {viewingSkill.dirty && (
                      <span className="text-xs px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        DIRTY
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{viewingSkill.filePath}</p>
                  {(viewingSkill.registryName || viewingSkill.registryVersion || viewingSkill.registryDownloadsWeekly) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      {viewingSkill.registryName && <span>Registry name: {viewingSkill.registryName}</span>}
                      {viewingSkill.registryVersion && <span>Version: {viewingSkill.registryVersion}</span>}
                      {typeof viewingSkill.registryDownloadsWeekly === 'number' && <span>Downloads: {viewingSkill.registryDownloadsWeekly}</span>}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setViewingSkill(null)
                    setEditingSkill(false)
                    setEditingSkillName('')
                    setEditingSkillDescription('')
                    setSkillContent('')
                    setEditingDraft('')
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <ProductIconCell iconName="close" label="Close" size="sm" className="border-transparent bg-transparent text-current" />
                </button>
              </div>

              <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                  View the raw `skill.md` or inspect the rendered markdown. Editing a built-in skill creates a workspace copy before saving.
                </div>
                <div className="flex items-center gap-2">
                  {!editingSkill && (
                    <button
                      onClick={() => { void exportSkill(viewingSkill) }}
                      className="px-3 py-1.5 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/30 text-sm font-medium"
                    >
                      <span className="inline-flex items-center gap-2">
                        <ProductIconCell iconName="export" label="Export .md" size="sm" className="border-transparent bg-transparent text-current" />
                        Export .md
                      </span>
                    </button>
                  )}
                  {!editingSkill && viewingSkill.install && viewingSkill.install.length > 0 && (
                    viewingSkill.requirementStatus?.checkable && viewingSkill.requirementStatus.installSatisfied ? (
                      <div className="px-3 py-1.5 rounded-md border border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300 text-sm font-medium">
                        <span className="inline-flex items-center gap-2">
                          <ProductIconCell iconName="status" label="Requirements installed" size="sm" className="border-transparent bg-transparent text-current" />
                          Requirements installed
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => openInstallRequirementsModal(viewingSkill)}
                        disabled={installingSkillRequirementsName === viewingSkill.name}
                        className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-sm font-medium"
                      >
                        {installingSkillRequirementsName === viewingSkill.name ? 'Installing...' : 'Install Requirements'}
                      </button>
                    )
                  )}
                  {!editingSkill && viewingSkillSetupHint && (
                    <button
                      onClick={() => openSkillSetupModal(viewingSkill)}
                      className="px-3 py-1.5 rounded-md bg-emerald-700 text-white hover:bg-emerald-800 text-sm font-medium"
                    >
                      {viewingSkillSetupHint.mode === 'guided' ? 'Complete Setup' : 'View Setup'}
                    </button>
                  )}
                  {!editingSkill && (
                    <button
                      onClick={() => {
                        showWarning(viewingSkill.source === 'bundled'
                          ? 'Editing this built-in skill will create a workspace copy that you can rename and refine, and mark that copy DIRTY.'
                          : 'Editing this skill will keep it editable and mark it DIRTY so the divergence stays visible.')
                        setEditingSkillName(viewingSkill.name)
                        setEditingSkillDescription(viewingSkill.description || '')
                        setEditingDraft(skillContent)
                        setEditingSkill(true)
                      }}
                      className="px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 text-sm font-medium"
                    >
                      {viewingSkill.source === 'bundled' ? 'Edit as Workspace Copy' : 'Edit Skill'}
                    </button>
                  )}
                  {editingSkill && (
                    <>
                      <button
                        onClick={() => {
                          setEditingSkillName(viewingSkill.name)
                          setEditingSkillDescription(viewingSkill.description || '')
                          setEditingDraft(skillContent)
                          setEditingSkill(false)
                        }}
                        className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveSkillContent}
                        disabled={savingSkillContent}
                        className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-sm font-medium"
                      >
                        {savingSkillContent ? 'Saving...' : 'Save and Mark Dirty'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                {viewingSkillSetupHint && (
                  <div className="shrink-0 px-6 py-4 border-b border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                    <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">Setup required</div>
                    <div className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                      {viewingSkillSetupHint.message}
                    </div>
                    {viewingSkillSetupHint.commands && viewingSkillSetupHint.commands.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {viewingSkillSetupHint.commands.map((command) => (
                          <div
                            key={command}
                            className="rounded-md border border-amber-200 bg-white/70 px-3 py-2 text-xs font-mono text-amber-900 dark:border-amber-700 dark:bg-gray-900/40 dark:text-amber-100"
                          >
                            {command}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {viewingSkill.secretRequirements && viewingSkill.secretRequirements.length > 0 && (
                  <div className="shrink-0 px-6 py-4 border-b border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">Browser-Local Secrets</div>
                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          Stored in this browser only. The central `Keys & Secrets` vault is the source of truth, and these skill values can be promoted there for reuse.
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            writeSharedSecrets(skillSecrets, { scope: 'workspace' })
                            showSuccess('Saved skill secrets to workspace keys')
                          }}
                          className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
                        >
                          Save to Workspace Keys
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            writeSharedSecrets(skillSecrets, { scope: 'global' })
                            showSuccess('Saved skill secrets to global keys')
                          }}
                          className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
                        >
                          Save to Global Keys
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {viewingSkill.secretRequirements.map((requirement) => {
                        const inputType = requirement.sensitive || requirement.kind === 'api_key' || requirement.kind === 'token'
                          ? 'password'
                          : requirement.kind === 'url'
                            ? 'url'
                            : 'text'
                        const value = skillSecrets[requirement.key] || ''
                        return (
                          <div key={requirement.key} className="space-y-1.5">
                            <label className="block text-sm font-medium text-amber-900 dark:text-amber-200">
                              {requirement.label}
                              {requirement.required !== false && <span className="ml-1 text-red-500">*</span>}
                            </label>
                            <input
                              type={inputType}
                              value={value}
                              onChange={(e) => {
                                const next = { ...skillSecrets, [requirement.key]: e.target.value }
                                setSkillSecrets(next)
                                writeLocalSecrets('skill', viewingSkill.name, next)
                              }}
                              placeholder={requirement.placeholder || requirement.key}
                              className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-700 dark:bg-gray-900 dark:text-gray-100"
                            />
                            {requirement.help && (
                              <div className="text-xs text-amber-800 dark:text-amber-200">{requirement.help}</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {editingSkill && (
                  <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-6 py-4 dark:border-amber-800 dark:bg-amber-900/20">
                    <div className="text-sm text-amber-800 dark:text-amber-300">
                      You are editing this skill in the dashboard. Saving will set `metadata.openclaw.dirty: true`.
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-amber-900 dark:text-amber-200">
                          Skill Name
                        </label>
                        <input
                          type="text"
                          value={editingSkillName}
                          onChange={(e) => setEditingSkillName(e.target.value)}
                          placeholder="e.g. customer-research"
                          className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-700 dark:bg-gray-900 dark:text-gray-100"
                        />
                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          Letters, numbers, dashes, and underscores only.
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-amber-900 dark:text-amber-200">
                          Description
                        </label>
                        <input
                          type="text"
                          value={editingSkillDescription}
                          onChange={(e) => setEditingSkillDescription(e.target.value)}
                          placeholder="Short summary of what this skill does"
                          className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-700 dark:bg-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1.5 block text-sm font-medium text-amber-900 dark:text-amber-200">
                          Tags
                        </label>
                        <input
                          type="text"
                          value={editingSkillTags}
                          onChange={(e) => setEditingSkillTags(e.target.value)}
                          placeholder="research, email, crm"
                          className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-700 dark:bg-gray-900 dark:text-gray-100"
                        />
                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          Comma-separated tags for filtering and discovery.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {viewingSkill && availableAgents.length > 0 && (
                  <div className="shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Assign Agents To This Skill</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Manage who has <span className="font-medium text-gray-700 dark:text-gray-200">{viewingSkill.name}</span> directly from the skill view.
                        </div>
                      </div>
                      <div className="rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                        {viewingSkillAssignmentBuckets.assignedAgentIds.length} assigned · {viewingSkillAssignmentBuckets.unassignedAgentIds.length} available
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-800 dark:bg-gray-800/80">
                        <div className="mb-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300">Assigned Agents</div>
                        {viewingSkillAssignmentBuckets.assignedAgentIds.length === 0 ? (
                          <div className="text-sm text-gray-500 dark:text-gray-400">No agents have this skill yet.</div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {viewingSkillAssignmentBuckets.assignedAgentIds.map((targetAgentId) => (
                              <button
                                key={`remove-${targetAgentId}`}
                                type="button"
                                disabled={savingSkillAssignmentAgentId === targetAgentId}
                                onClick={async () => {
                                  setSavingSkillAssignmentAgentId(targetAgentId)
                                  setError(null)
                                  try {
                                    const currentSkills = agentSkillMap.get(targetAgentId) || []
                                    const nextSkills = currentSkills.filter((skill) => skill !== viewingSkill.name)
                                    await persistAgentSkills(targetAgentId, nextSkills)
                                    showSuccess(`Removed ${viewingSkill.name} from ${targetAgentId}`)
                                  } catch (err: any) {
                                    setError(err.message || 'Failed to remove skill from agent')
                                  } finally {
                                    setSavingSkillAssignmentAgentId(null)
                                  }
                                }}
                                className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                                title={`Remove ${viewingSkill.name} from ${targetAgentId}`}
                              >
                                <span>{targetAgentId}</span>
                                <span className="text-xs">Remove</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-800 dark:bg-gray-800/80">
                        <div className="mb-3 text-sm font-semibold text-blue-800 dark:text-blue-300">Add Agents</div>
                        <input
                          type="text"
                          value={viewerAgentSearchQuery}
                          onChange={(e) => setViewerAgentSearchQuery(e.target.value)}
                          placeholder="Search agents to add..."
                          className="mb-3 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        {filteredViewerAvailableAgents.length === 0 ? (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {viewingSkillAssignmentBuckets.unassignedAgentIds.length === 0
                              ? 'Every agent in this workspace already has this skill.'
                              : 'No matching agents found.'}
                          </div>
                        ) : (
                          <div className="max-h-44 space-y-2 overflow-auto pr-1">
                            {filteredViewerAvailableAgents.map((targetAgentId) => (
                              <button
                                key={`add-${targetAgentId}`}
                                type="button"
                                disabled={savingSkillAssignmentAgentId === targetAgentId}
                                onClick={async () => {
                                  setSavingSkillAssignmentAgentId(targetAgentId)
                                  setError(null)
                                  try {
                                    const currentSkills = agentSkillMap.get(targetAgentId) || []
                                    const nextSkills = Array.from(new Set([...currentSkills, viewingSkill.name])).sort((a, b) => a.localeCompare(b))
                                    await persistAgentSkills(targetAgentId, nextSkills)
                                    showSuccess(`Added ${viewingSkill.name} to ${targetAgentId}`)
                                  } catch (err: any) {
                                    setError(err.message || 'Failed to add skill to agent')
                                  } finally {
                                    setSavingSkillAssignmentAgentId(null)
                                  }
                                }}
                                className="flex w-full items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm text-blue-900 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/40"
                              >
                                <span className="truncate">{targetAgentId}</span>
                                <span className="shrink-0 text-xs font-medium">Add</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid min-h-[28rem] h-[32rem] lg:h-[50vh] grid-cols-1 lg:grid-cols-2">
                  <div className="border-r border-gray-200 dark:border-gray-700 min-h-0 flex flex-col">
                    <div className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      Raw skill.md
                    </div>
                    {loadingSkillContent ? (
                      <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading skill content...</div>
                    ) : editingSkill ? (
                      <textarea
                        value={editingDraft}
                        onChange={(e) => setEditingDraft(e.target.value)}
                        className="flex-1 min-h-0 w-full p-6 font-mono text-sm bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 outline-none resize-none overflow-auto"
                        spellCheck={false}
                      />
                    ) : (
                      <div className="flex-1 min-h-0 overflow-auto">
                        <pre className="p-6 text-sm whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200">{skillContent}</pre>
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900/40 min-h-0 flex flex-col">
                    <div className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      Rendered View
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto">
                      <div className="prose prose-sm max-w-none p-6 dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {stripFrontmatter(editingSkill ? editingDraft : skillContent)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}

        {showBulkAssignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Add Selected Skills to Agents</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Add {selectedSkillIds.size} selected skill{selectedSkillIds.size !== 1 ? 's' : ''} to one or more agents from this workspace.
                  </p>
                </div>
                <button
                  onClick={() => setShowBulkAssignModal(false)}
                  className="text-2xl leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4 px-6 py-4">
                <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-900 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-200">
                  Skills: <span className="font-medium">{Array.from(selectedSkillIds).sort((a, b) => a.localeCompare(b)).join(', ')}</span>
                </div>
                <input
                  type="text"
                  value={bulkAgentSearchQuery}
                  onChange={(e) => setBulkAgentSearchQuery(e.target.value)}
                  placeholder="Search agents in this workspace..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
                <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  {filteredBulkAgents.map((candidateAgentId) => {
                    const isSelected = selectedBulkAgentIds.has(candidateAgentId)
                    return (
                      <label
                        key={candidateAgentId}
                        className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30'
                            : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900/40'
                        }`}
                      >
                        <span className="truncate text-gray-900 dark:text-gray-100">{candidateAgentId}</span>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => setSelectedBulkAgentIds((current) => toggleItemSelection(current, candidateAgentId))}
                          className="h-4 w-4"
                        />
                      </label>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
                  <span>{selectedBulkAgentIds.size} agent{selectedBulkAgentIds.size !== 1 ? 's' : ''} selected</span>
                  <button
                    onClick={() => setSelectedBulkAgentIds(new Set(filteredBulkAgents))}
                    className="font-medium text-blue-600 hover:text-blue-700"
                  >
                    Select Visible Agents
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                <button
                  onClick={() => setShowBulkAssignModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setBulkAssigningSkills(true)
                    setError(null)
                    try {
                      const response = await fetch(`${API_BASE}/api/skills/bulk-assign`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          agentIds: Array.from(selectedBulkAgentIds),
                          addSkills: Array.from(selectedSkillIds),
                        }),
                      })
                      const data = await response.json().catch(() => ({}))
                      if (!response.ok) {
                        throw new Error(data.error || 'Failed to bulk assign skills')
                      }
                      const warnings = Array.isArray(data.results)
                        ? data.results.flatMap((result: any) => Array.isArray(result.warnings) ? result.warnings : [])
                        : []
                      if (warnings.length > 0) {
                        showWarning(Array.from(new Set(warnings)).join(' '))
                      }
                      showSuccess(`Added ${selectedSkillIds.size} skill${selectedSkillIds.size !== 1 ? 's' : ''} to ${selectedBulkAgentIds.size} agent${selectedBulkAgentIds.size !== 1 ? 's' : ''}`)
                      await loadAgents()
                      if (agentId) {
                        await loadSkills()
                      }
                      setShowBulkAssignModal(false)
                      setSelectedSkillIds(new Set())
                      setSelectionMode(false)
                    } catch (err: any) {
                      setError(err.message || 'Failed to bulk assign skills')
                    } finally {
                      setBulkAssigningSkills(false)
                    }
                  }}
                  disabled={selectedBulkAgentIds.size === 0 || selectedSkillIds.size === 0 || bulkAssigningSkills}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-600"
                >
                  {bulkAssigningSkills ? 'Assigning…' : 'Add Skills'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showInstallRequirementsModal && pendingInstallSkill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Install Requirements</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Install machine dependencies for <span className="font-medium text-gray-900 dark:text-gray-100">{pendingInstallSkill.name}</span>. This is separate from adding the skill to an agent.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (installingSkillRequirementsName) return
                    setShowInstallRequirementsModal(false)
                    setPendingInstallSkill(null)
                  }}
                  className="text-2xl leading-none text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed dark:hover:text-gray-300"
                  disabled={!!installingSkillRequirementsName}
                >
                  ×
                </button>
              </div>

              <div className="space-y-4 px-6 py-4">
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-100">
                  This setup does not block creating or saving an agent. It is required only before an assigned agent can use <span className="font-medium">{pendingSetupSkill.name}</span> at runtime; you can create now and configure this optional capability later.
                </div>
                <TermsRiskNotice
                  title="Machine command reminder"
                  body="Installing skill requirements can modify this machine or runtime environment. Only continue if you trust the skill and the displayed install commands."
                />
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
                  {pendingInstallSkill.requirementStatus?.checkable && pendingInstallSkill.requirementStatus.installSatisfied ? (
                    <>
                      Requirements already satisfied for <span className="font-medium">{pendingInstallSkill.name}</span>. Installed binaries: <span className="font-medium">{pendingInstallSkill.requirementStatus.presentBins.join(', ')}</span>
                    </>
                  ) : (
                    <>
                      Commands: <span className="font-medium">{installRequirementsCommands.join(', ')}</span>
                    </>
                  )}
                </div>
                <div className="bg-gray-900 text-green-400 font-mono text-xs rounded-lg p-3 h-56 overflow-y-auto whitespace-pre-wrap">
                  {installRequirementsLogs.join('\n')}
                  {installingSkillRequirementsName === pendingInstallSkill.name && <span className="animate-pulse">▌</span>}
                </div>
                {installRequirementsError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                    {installRequirementsError}
                  </div>
                )}
                {installRequirementsDone && !installRequirementsError && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                    Requirements installed. The runtime can use them immediately if the current PATH already includes the binary, otherwise restart the dashboard/runtime once.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                <button
                  onClick={() => {
                    setShowInstallRequirementsModal(false)
                    setPendingInstallSkill(null)
                  }}
                  disabled={!!installingSkillRequirementsName}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {installRequirementsDone ? 'Close' : 'Cancel'}
                </button>
                <button
                  onClick={() => void installSkillRequirements(pendingInstallSkill)}
                  disabled={
                    installingSkillRequirementsName === pendingInstallSkill.name
                    || installRequirementsDone
                    || !!(pendingInstallSkill.requirementStatus?.checkable && pendingInstallSkill.requirementStatus.installSatisfied)
                  }
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-600"
                >
                  {pendingInstallSkill.requirementStatus?.checkable && pendingInstallSkill.requirementStatus.installSatisfied
                    ? 'Requirements Installed'
                    : (installingSkillRequirementsName === pendingInstallSkill.name ? 'Installing…' : 'Install Requirements')}
                </button>
              </div>
            </div>
          </div>
        )}

        {partnerPluginRun && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {partnerPluginRun.action === 'install' ? 'Install OpenClaw Partner Plugin' : 'Uninstall OpenClaw Partner Plugin'}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {partnerPluginRun.status === 'confirming'
                      ? <>Confirm removal of <span className="font-medium text-gray-900 dark:text-gray-100">{partnerPluginRun.name}</span> from this dashboard runtime.</>
                      : <>{partnerPluginRun.action === 'install' ? 'Installing' : 'Uninstalling'} <span className="font-medium text-gray-900 dark:text-gray-100">{partnerPluginRun.name}</span> through the curated OpenClaw plugin allowlist.</>}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (partnerPluginRun.status === 'running') return
                    setPartnerPluginRun(null)
                  }}
                  className="text-2xl leading-none text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed dark:hover:text-gray-300"
                  disabled={partnerPluginRun.status === 'running'}
                >
                  ×
                </button>
              </div>

              <div className="space-y-4 px-6 py-4">
                <TermsRiskNotice
                  title="Partner plugin command reminder"
                  body="Installing or uninstalling partner plugins can modify this dashboard runtime. Continue only for partner plugins you trust and review the command output below."
                />
                <div className="bg-gray-900 text-green-400 font-mono text-xs rounded-lg p-3 h-64 overflow-y-auto whitespace-pre-wrap">
                  {partnerPluginRun.logs.join('\n')}
                  {partnerPluginRun.status === 'running' && <span className="animate-pulse">▌</span>}
                </div>
                {partnerPluginRun.error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                    {partnerPluginRun.error}
                  </div>
                )}
                {partnerPluginRun.status === 'success' && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                    {partnerPluginRun.action === 'install' ? 'Install completed.' : 'Uninstall completed.'} Plugin status was refreshed automatically. The status shown in Partner Capabilities is authoritative; no restart is needed when it shows the expected state.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                <button
                  onClick={() => setPartnerPluginRun(null)}
                  disabled={partnerPluginRun.status === 'running'}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {partnerPluginRun.status === 'confirming' ? 'Cancel' : 'Close'}
                </button>
                {partnerPluginRun.status === 'confirming' && (
                  <button
                    onClick={() => {
                      const partner = partnerInstallerBySlug[partnerPluginRun.slug]
                      if (partner) void runPartnerPluginAction(partner, 'uninstall')
                    }}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Uninstall
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showSkillSetupModal && pendingSetupSkill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {pendingSkillSupportsDashboardSetup ? 'Complete Setup' : pendingSkillSupportsInteractiveSetup ? 'Interactive Setup' : 'Setup Instructions'}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {pendingSkillSupportsDashboardSetup
                      ? <>Finish auth/setup for <span className="font-medium text-gray-900 dark:text-gray-100">{pendingSetupSkill.name}</span> so agents can actually use it.</>
                      : pendingSkillSupportsInteractiveSetup
                        ? <>Run the setup wizard for <span className="font-medium text-gray-900 dark:text-gray-100">{pendingSetupSkill.name}</span> in a constrained skill-only session, then respond to its prompts below.</>
                        : <>Review the manual setup steps for <span className="font-medium text-gray-900 dark:text-gray-100">{pendingSetupSkill.name}</span>. Some CLIs still require an interactive terminal flow that the dashboard cannot safely automate yet.</>}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (runningSkillSetupName && !interactiveSkillSetupSessionId) return
                    setShowSkillSetupModal(false)
                    setPendingSetupSkill(null)
                    void closeInteractiveSkillSetupSession()
                  }}
                  className="text-2xl leading-none text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed dark:hover:text-gray-300"
                  disabled={!!runningSkillSetupName && !interactiveSkillSetupSessionId}
                >
                  ×
                </button>
              </div>

              <div className="space-y-4 px-6 py-4">
                <TermsRiskNotice
                  title="Auth and setup reminder"
                  body={pendingSkillSupportsDashboardSetup
                    ? 'Completing skill setup may authenticate external accounts, grant runtime access, or store credentials and configuration. Only continue if you trust the skill and understand the permissions being granted.'
                    : pendingSkillSupportsInteractiveSetup
                      ? 'This setup session is limited to the selected skill flow, but it still runs real commands inside your runtime and may store credentials or configuration. Only continue if you trust the skill and understand the permissions being granted.'
                    : 'Some skills still require manual setup in the host runtime or terminal. Review the commands and finish any interactive login or account configuration steps outside the dashboard before retrying the agent.'}
                />
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  {pendingSkillSetupHint?.message}
                </div>
                {(pendingSkillSupportsDashboardSetup || pendingSkillSupportsInteractiveSetup) && (pendingSkillSetupHint?.inputs || []).length > 0 && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {(pendingSkillSetupHint?.inputs || []).map((input) => (
                      <div key={input.key}>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
                          {input.label}
                        </label>
                        <input
                          type={input.kind === 'password' ? 'password' : input.kind === 'email' ? 'email' : input.kind === 'url' ? 'url' : 'text'}
                          value={skillSetupValues[input.key] || ''}
                          onChange={(e) => setSkillSetupValues((current) => ({ ...current, [input.key]: e.target.value }))}
                          placeholder={input.placeholder || ''}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                        />
                        {input.help && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{input.help}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="bg-gray-900 text-green-400 font-mono text-xs rounded-lg p-3 h-64 overflow-y-auto whitespace-pre-wrap">
                  {skillSetupLogs.join('\n')}
                  {runningSkillSetupName === pendingSetupSkill.name && <span className="animate-pulse">▌</span>}
                </div>
                {pendingSkillSupportsInteractiveSetup && interactiveSkillSetupSessionId && (
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={interactiveSkillSetupInput}
                      onChange={(e) => setInteractiveSkillSetupInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void sendInteractiveSkillSetupInput()
                        }
                      }}
                      placeholder="Type a response for the setup wizard and press Enter"
                      className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => void sendInteractiveSkillSetupInput()}
                      disabled={!interactiveSkillSetupInput.trim()}
                      className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/20 dark:disabled:border-gray-700 dark:disabled:text-gray-500"
                    >
                      Send
                    </button>
                  </div>
                )}
                {skillSetupError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                    {skillSetupError}
                  </div>
                )}
                {skillSetupDone && !skillSetupError && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                    Setup flow completed. If the auth tool opened a browser, finish the consent flow there and then retry the agent.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                <button
                  onClick={() => {
                    setShowSkillSetupModal(false)
                    setPendingSetupSkill(null)
                    void closeInteractiveSkillSetupSession()
                  }}
                  disabled={!!runningSkillSetupName && !interactiveSkillSetupSessionId}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {skillSetupDone ? 'Close' : 'Cancel'}
                </button>
                {(pendingSkillSupportsDashboardSetup || pendingSkillSupportsInteractiveSetup) && (
                  <button
                    onClick={() => void (pendingSkillSupportsDashboardSetup ? completeSkillSetup(pendingSetupSkill) : startInteractiveSkillSetup(pendingSetupSkill))}
                    disabled={
                      runningSkillSetupName === pendingSetupSkill.name ||
                      !!interactiveSkillSetupSessionId ||
                      (pendingSkillSetupHint?.inputs || []).some((input) => input.required && !String(skillSetupValues[input.key] || '').trim())
                    }
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-600"
                  >
                    {runningSkillSetupName === pendingSetupSkill.name
                      ? (pendingSkillSupportsInteractiveSetup ? 'Setup Running…' : 'Running Setup…')
                      : (pendingSkillSetupHint?.actionLabel || 'Complete Setup')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showBulkDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    Delete {pendingDeleteSkillNames.length === 1 ? 'Skill' : 'Selected Skills'}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Only user-added skills can be deleted. Built-in skills will be skipped.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowBulkDeleteConfirm(false)
                    setPendingDeleteSkillNames([])
                  }}
                  className="text-2xl leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4 px-6 py-4">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                  Deleting: <span className="font-medium">{pendingDeletePartition.deletableSkills.map((skill) => skill.name).sort((a, b) => a.localeCompare(b)).join(', ') || 'None'}</span>
                </div>
                {pendingDeleteImpact.assignedSkillCount > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    <div className="font-medium">
                      {pendingDeleteImpact.assignedSkillCount} skill{pendingDeleteImpact.assignedSkillCount !== 1 ? 's are' : ' is'} currently assigned to {pendingDeleteImpact.affectedAgentCount} agent{pendingDeleteImpact.affectedAgentCount !== 1 ? 's' : ''}.
                    </div>
                    <div className="mt-1">
                      Deleting a skill removes it from the workspace catalog, but does not automatically remove stale references from agents that already have it assigned. Those agents may need their skill lists updated afterward.
                    </div>
                    <div className="mt-3 space-y-2">
                      {pendingDeleteImpact.rows.filter((row) => row.assignedAgents.length > 0).map((row) => (
                        <div key={row.skillName}>
                          <div className="font-medium">{row.skillName}</div>
                          <div className="text-xs">
                            Assigned to: {row.assignedAgents.join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pendingDeletePartition.nonDeletableSkills.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    Not deletable (built-in): <span className="font-medium">{pendingDeletePartition.nonDeletableSkills.map((skill) => skill.name).sort((a, b) => a.localeCompare(b)).join(', ')}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                <button
                  onClick={() => {
                    setShowBulkDeleteConfirm(false)
                    setPendingDeleteSkillNames([])
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteSelectedSkills(pendingDeletePartition.deletableSkills.map((skill) => skill.name))}
                  disabled={pendingDeletePartition.deletableSkills.length === 0 || deletingSkills}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-600"
                >
                  {deletingSkills ? 'Deleting…' : `Delete ${pendingDeletePartition.deletableSkills.length} User Skill${pendingDeletePartition.deletableSkills.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectionMode && selectedSkillIds.size > 0 && (
          <SelectionActionBar
            summary={
              <>
                {selectedSkillIds.size} skill{selectedSkillIds.size !== 1 ? 's' : ''} selected
              </>
            }
          >
            <button
              onClick={() => {
                setSelectedSkillIds((current) => toggleVisibleSelections(current, filteredSkills.map((skill) => skill.name)))
              }}
              disabled={filteredSkills.length === 0}
              className="whitespace-nowrap rounded bg-blue-700 px-3 py-1 text-sm transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {filteredSkills.length > 0 && filteredSkills.every((skill) => selectedSkillIds.has(skill.name)) ? 'Deselect All Visible' : 'Select All Visible'}
            </button>
            <button
              onClick={() => {
                setSelectedBulkAgentIds(new Set(agentId ? [agentId] : []))
                setBulkAgentSearchQuery('')
                setShowBulkAssignModal(true)
              }}
              disabled={selectedSkillIds.size === 0 || availableAgents.length === 0}
              className="whitespace-nowrap rounded bg-emerald-600 px-3 py-1 text-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Assign to Agents
            </button>
            <button
              onClick={() => {
                if (selectedSkillPartition.deletableSkills.length === 0) {
                  showWarning('Only user-added skills can be deleted. The current selection contains built-in skills only.')
                  return
                }
                setPendingDeleteSkillNames(selectedSkillPartition.selectedSkills.map((skill) => skill.name))
                setShowBulkDeleteConfirm(true)
              }}
              disabled={selectedSkillIds.size === 0}
              className="whitespace-nowrap rounded bg-red-600 px-3 py-1 text-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete Selected ({selectedSkillIds.size})
            </button>
            <button
              onClick={() => setSelectedSkillIds(new Set())}
              disabled={selectedSkillIds.size === 0}
              className="whitespace-nowrap rounded bg-blue-700 px-3 py-1 text-sm transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear
            </button>
            <button
              onClick={() => {
                setSelectionMode(false)
                setSelectedSkillIds(new Set())
              }}
              className="whitespace-nowrap rounded bg-blue-700 px-3 py-1 text-sm transition-colors hover:bg-blue-800"
            >
              Done Selecting
            </button>
          </SelectionActionBar>
        )}

        {/* Import Skill Dialog */}
        {showImportDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] mx-4 flex flex-col overflow-hidden">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import Custom Skill</h2>
                  <button
                    onClick={() => {
                      setShowImportDialog(false)
                      setImportPath('')
                      setError(null)
                    }}
                    className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="px-6 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setImportSource('local')}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                      importSource === 'local'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ProductIconCell iconName={resolveCategoryVisual('directory').iconName} emoji={resolveCategoryVisual('directory').emoji} label="Local Directory" size="sm" />
                      Local Directory
                    </span>
                  </button>
                  <button
                    onClick={() => setImportSource('github')}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                      importSource === 'github'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ProductIconCell iconName={resolveCategoryVisual('github').iconName} emoji={resolveCategoryVisual('github').emoji} label="GitHub Repository" size="sm" />
                      GitHub Repository
                    </span>
                  </button>
                  <button
                    onClick={() => setImportSource('registry')}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                      importSource === 'registry'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ProductIconCell iconName={resolveCategoryVisual('registry').iconName} emoji={resolveCategoryVisual('registry').emoji} label="Skill Registries" size="sm" />
                      Skill Registries
                    </span>
                  </button>
                  <button
                    onClick={() => setImportSource('ai')}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                      importSource === 'ai'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ProductIconCell iconName={resolveCategoryVisual('ai').iconName} emoji={resolveCategoryVisual('ai').emoji} label="AI Create" size="sm" />
                      AI Create
                    </span>
                  </button>
                  <button
                    onClick={() => setImportSource('partner')}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                      importSource === 'partner'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ProductIconCell iconName={resolveCategoryVisual('partner').iconName} emoji={resolveCategoryVisual('partner').emoji} label="Partner Skills" size="sm" />
                      Partner Skills
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6">
                {(importSource === 'local' || importSource === 'github' || importSource === 'registry' || importSource === 'partner') && (
                  <div className="mb-5">
                    <TermsRiskNotice
                      title="External skill risk reminder"
                      body="Third-party skills, partner installers, GitHub repositories, local directories, and registries can add new capabilities, binaries, secrets, and machine-level commands. Review what you are importing or installing before you continue."
                    />
                  </div>
                )}

                {/* Local Import */}
                {importSource === 'local' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Enter the path to a skill directory or a directory containing multiple skills. Each skill needs:
                    </p>
                    <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc list-inside space-y-1 ml-2">
                      <li><code className="bg-gray-100 px-1 rounded dark:bg-gray-800">skill.md</code> - Skill description (YAML frontmatter + markdown)</li>
                      <li><code className="bg-gray-100 px-1 rounded dark:bg-gray-800">index.ts</code> - Skill implementation (optional)</li>
                    </ul>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                        Directory Path
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={importPath}
                          onChange={(e) => setImportPath(e.target.value)}
                          placeholder={LOCAL_SKILL_IMPORT_PATH_PLACEHOLDER}
                          className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        />
                        <button
                          type="button"
                          onClick={() => uploadSkillZipInputRef.current?.click()}
                          disabled={importing}
                          className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 font-medium whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-900/30"
                        >
                          <span className="inline-flex items-center gap-2">
                            <ProductIconCell iconName="import" label="Upload ZIP" size="sm" className="border-transparent bg-transparent text-current" />
                            Upload ZIP...
                          </span>
                        </button>
                        <input
                          ref={uploadSkillZipInputRef}
                          type="file"
                          accept=".zip,application/zip"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            void handleUploadSkillZip(file)
                          }}
                        />
                      </div>
                      {LOCAL_SKILL_IMPORT_GUIDANCE.map((message, index) => (
                        <p key={index} className={`text-xs text-gray-500${index === 0 ? ' mt-1' : ''}`}>
                          {message}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* GitHub Import */}
                {importSource === 'github' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Import skills from a GitHub repository. Supports single-skill repos and multi-skill repos (auto-detects <code className="bg-gray-100 px-1 rounded dark:bg-gray-800">skills/</code> directory).
                    </p>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                        GitHub Repository URL
                      </label>
                      <input
                        type="text"
                        value={importPath}
                        onChange={(e) => setImportPath(e.target.value)}
                        placeholder="https://github.com/username/skill-name"
                        className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-600 focus:border-purple-500 dark:focus:border-purple-600"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Single skill repo or multi-skill repo with skills/ directory (e.g., github.com/user/my-skills)
                      </p>
                    </div>
                  </div>
                )}

                {/* Skills Registry */}
                {importSource === 'registry' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Browse and install skills from supported registries. Search all sources together or select one registry to narrow the results.
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setRegistryProvider('all')
                          setRegistryResults([])
                          setRegistryTotal(0)
                        }}
                        className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                          registryProvider === 'all'
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600'
                        }`}
                      >
                        {ALL_REGISTRIES_PROVIDER.label}
                      </button>
                      {REGISTRY_PROVIDERS.map((provider) => (
                        <button
                          key={provider.id}
                          onClick={() => {
                            setRegistryProvider(provider.id)
                            setRegistryResults([])
                            setRegistryTotal(0)
                          }}
                          className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                            registryProvider === provider.id
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600'
                          }`}
                        >
                          <span className="inline-flex items-center gap-2">
                            <ProductIconCell
                              iconName={resolveCategoryVisual(provider.iconKey).iconName}
                              emoji={resolveCategoryVisual(provider.iconKey).emoji}
                              label={provider.label}
                              size="sm"
                              className={registryProvider === provider.id ? 'border-white/30 bg-white/10 text-white' : ''}
                            />
                            {provider.label}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{activeRegistryProvider.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{activeRegistryProvider.description}</div>
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Searching across {activeRegistryProvider.catalogSizeLabel}{registryProvider === 'all' ? '.' : ' in this registry.'}
                      </div>
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {registryProvider === 'all'
                          ? 'Results retain their source registry so installation uses the correct provider.'
                          : registryProvider === 'tessl'
                          ? 'Experimental registry. Some skills may need extra security review or manual setup after install.'
                          : registryProvider === 'clawhub'
                            ? 'Native OpenClaw registry. Installed skills appear under User Skills and may still need local requirements or auth setup.'
                            : 'Installed skills appear under User Skills and can be assigned immediately.'}
                      </div>
                    </div>

                    {/* Search */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={registryQuery}
                        onChange={e => setRegistryQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') searchRegistry(registryQuery) }}
                        placeholder={activeRegistryProvider.searchPlaceholder}
                        className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                      <button
                        onClick={() => searchRegistry(registryQuery)}
                        disabled={registrySearching}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        {registrySearching ? 'Searching...' : 'Search'}
                      </button>
                    </div>

                    {/* Quick category buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      {(registryProvider === 'all'
                        ? ['github', 'docs', 'research', 'productivity', 'api', 'automation']
                        : registryProvider === 'tessl'
                        ? ['review', 'docs', 'research', 'planning', 'debug', 'content', 'api', 'automation']
                        : registryProvider === 'clawhub'
                          ? ['gmail', 'github', 'docs', 'research', 'productivity', 'calendar', 'browser', 'automation']
                          : ['github', 'slack', 'api', 'data', 'ai', 'web', 'devops', 'crm']
                      ).map(cat => (
                        <button
                          key={cat}
                          onClick={() => { setRegistryQuery(cat); searchRegistry(cat) }}
                          className="px-2.5 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Auto-load popular on first render */}
                    {registryResults.length === 0 && !registrySearching && !registryQuery && (
                      <div className="text-center py-4">
                        <button
                          onClick={() => searchRegistry(registryProvider === 'tessl' ? 'review' : '', 30)}
                          className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                        >
                          {registryProvider === 'tessl' ? 'Try a popular Tessl search →' : `Browse ${activeRegistryProvider.label} →`}
                        </button>
                      </div>
                    )}

                    {/* Loading */}
                    {registrySearching && (
                      <div className="text-center py-6 text-gray-400 text-sm">Searching {activeRegistryProvider.label} registry...</div>
                    )}

                    {/* Results */}
                    {!registrySearching && visibleRegistryResults.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-400 mb-2">
                          Showing {visibleRegistryResults.length} compatible skill{visibleRegistryResults.length !== 1 ? 's' : ''} of {registryTotal} result{registryTotal !== 1 ? 's' : ''}
                        </div>
                        {hiddenRegistryResultsCount > 0 && runtimePlatform !== 'unknown' && (
                          <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                            Hidden {hiddenRegistryResultsCount} skill{hiddenRegistryResultsCount !== 1 ? 's' : ''} that appear incompatible with this {runtimePlatform === 'darwin' ? 'macOS' : runtimePlatform} runtime.
                          </div>
                        )}
                        {registryCompatibilityNote && (
                          <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                            {registryCompatibilityNote}
                          </div>
                        )}
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                          {visibleRegistryResults.map((skill: any, idx: number) => {
                            const installName = skill.install_name || skill.full_name || skill.name
                            const resultProvider = skill.registry_provider || (registryProvider === 'all' ? 'clawhub' : registryProvider)
                            const providerLabel = REGISTRY_PROVIDERS.find((entry) => entry.id === resultProvider)?.label || resultProvider
                            const isInstalled = registryInstalledNames.has(`${resultProvider}:${installName}`)
                            return (
                              <RegistryResultRow
                                key={idx}
                                skill={skill}
                                installName={installName}
                                providerLabel={providerLabel}
                                showProvider={registryProvider === 'all'}
                                isInstalled={isInstalled}
                                isInstalling={registryInstalling === installName}
                                installDisabled={!!registryInstalling}
                                onInstall={() => installRegistrySkill(installName, resultProvider, false, skill)}
                              />
                            )
                          })}
                        </div>
                        {registryResults.length < registryTotal && (
                          <button
                            onClick={() => searchRegistry(registryQuery, registryResults.length + 20)}
                            className="mt-2 w-full py-2 text-sm text-purple-600 hover:text-purple-700 font-medium text-center border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          >
                            Load more ({registryTotal - registryResults.length} remaining)
                          </button>
                        )}
                      </div>
                    )}

                    {!registrySearching && visibleRegistryResults.length === 0 && registryQuery && (
                      <div className="text-center py-6 text-gray-400 text-sm">
                        No {activeRegistryProvider.label} results for "{registryQuery}". Try a different term.
                      </div>
                    )}
                  </div>
                )}

                {importSource === 'partner' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Browse partner-backed agent skills and approved OpenClaw runtime plugins. Plugin install buttons appear only for curated allowlisted commands.
                    </p>

                    {partnerInstallers.length === 0 ? (
                      <div className="text-center py-8 text-sm text-gray-400">
                        No partner-backed skills are enabled in this environment.
                      </div>
                    ) : (
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        {partnerInstallers
                          .filter((partner) => !focusedPartnerSlug || partner.slug === focusedPartnerSlug)
                          .map((partner, idx, visible) => (
                          <div key={partner.slug} className={`flex items-start justify-between gap-4 px-4 py-4 ${idx < partnerInstallers.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <PartnerLogo
                                  slug={partner.slug}
                                  name={partner.name}
                                  logoUrl={partner.logoUrl}
                                />
                                <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{partner.name}</div>
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{partner.description}</div>
                              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                {partner.skills.label || (
                                  partner.skills.mode === 'curated-installer'
                                    ? 'Curated skill install available'
                                    : partner.skills.mode === 'shipables'
                                      ? 'Known Shipables skills'
                                      : 'Known partner skills'
                                )}
                              </div>
                              {partner.skills.items && partner.skills.items.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {partner.skills.items.map((item) => (
                                    <span
                                      key={item}
                                      className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300"
                                    >
                                      {item}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {(partner.website || partner.docsUrl) && (
                                <div className="mt-2 flex gap-3 text-xs">
                                  {partner.website ? <a href={partner.website} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">Website</a> : null}
                                  {partner.docsUrl ? <a href={partner.docsUrl} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">Docs</a> : null}
                                </div>
                              )}
                              {partner.skills.mode === 'curated-installer' && (
                                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                  OpenClaw runtime plugin—not an agent skill or ClawMax dashboard plugin. Usually takes 1-3 minutes.
                                </div>
                              )}
                            </div>
                            {partner.skills.mode === 'curated-installer' ? (
                              (() => {
                                const status = partner.skills.commandId ? partnerPluginStatuses[partner.skills.commandId] : undefined
                                const installed = !!status?.installed
                                const running = partnerInstalling === partner.slug
                                return (
                                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                                    {installed && (
                                      <span className="px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded-md">
                                        Installed
                                      </span>
                                    )}
                                    <button
                                      onClick={() => void runPartnerPluginAction(partner, 'install')}
                                      disabled={!!partnerInstalling || installed}
                                      title={installed ? `${partner.name} plugin is already installed` : undefined}
                                      className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                                    >
                                      {running ? 'Running...' : 'Install OpenClaw Plugin'}
                                    </button>
                                    <button
                                      onClick={() => confirmPartnerPluginUninstall(partner)}
                                      disabled={!!partnerInstalling || !installed}
                                      title={!installed ? `${partner.name} plugin is not installed` : undefined}
                                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      Uninstall
                                    </button>
                                  </div>
                                )
                              })()
                            ) : partner.skills.mode === 'catalog' && partner.skills.sourceUrl ? (
                              <button
                                onClick={() => void importPartnerCatalog(partner)}
                                disabled={importing}
                                className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed shrink-0"
                              >
                                {importing ? 'Importing...' : 'Import Skills'}
                              </button>
                            ) : (
                              <div className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                                {partner.skills.mode === 'shipables' ? 'Install from Shipables' : 'Reference'}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {importSource === 'ai' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Describe the skill you want, generate a draft scaffold, then save it as a custom skill you can edit further.
                    </p>

                    {!aiEnabled && (
                      <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                        <div className="font-medium">AI skill generation is disabled because no AI execution path is configured</div>
                        <div className="mt-1 text-xs opacity-90">
                          This will fail until you add a model key and choose a preferred model in this browser or through a usable shared execution path.
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent('open-workspaces-integrations', { detail: { step: 'models', focus: 'preferred-model' } }))}
                            className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 bg-white text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-900/30"
                          >
                            Open BYOK
                          </button>
                          <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-page', { detail: { page: 'keys' } }))}
                            className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 bg-white text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-900/30"
                          >
                            Keys & Secrets
                          </button>
                        </div>
                      </div>
                    )}

                    {aiReadiness.warning && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                        <div className="font-medium">AI skill generation may fail</div>
                        <div className="mt-1 text-xs opacity-90">{aiReadiness.warning}</div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                        Skill prompt
                      </label>
                      <textarea
                        value={aiSkillPrompt}
                        onChange={(e) => setAiSkillPrompt(e.target.value)}
                        placeholder="e.g., A skill that helps an agent detect and summarize PII exposure risks in documents, with short actionable outputs and a cautious tone."
                        rows={5}
                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                      <div className="mt-2">
                        <PromptQualityPanel prompt={aiSkillPrompt} domain="skill" compact />
                      </div>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setShowAiPromptEditor(true)}
                          className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Open AI Editor
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() => handleGenerateSkill(false)}
                        disabled={!aiEnabled || aiSkillGenerating || !aiSkillPrompt.trim()}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium inline-flex items-center gap-2"
                      >
                        {!aiSkillGenerating && aiEnabled && (
                          <ProductIconCell iconName="ai" label="Generate skill draft" size="sm" className="border-white/20 bg-white/10 text-white" />
                        )}
                        {aiSkillGenerating ? 'Generating...' : !aiEnabled ? 'Generate Skill Draft (set up keys first)' : 'Generate Skill Draft'}
                      </button>
                      <AIGenerationProgress active={aiSkillGenerating} label="Generating skill draft…" />
                    </div>

                    {generatedSkillDraft && (
                      <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-900/10 overflow-hidden">
                        <div className="px-4 py-3 border-b border-purple-200 dark:border-purple-800">
                          <div className="flex items-center gap-2 flex-wrap">
                            <ProductIconCell iconName={generatedSkillVisual?.iconName} emoji={generatedSkillVisual?.emoji} label={generatedSkillDraft.name} size="sm" />
                            <div className="text-sm font-semibold text-purple-900 dark:text-purple-100">{generatedSkillDraft.name}</div>
                            {generatedSkillDraft.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {generatedSkillDraft.tags.map((tag) => (
                                  <span key={tag} className="rounded-full border border-purple-200 dark:border-purple-700 px-2 py-0.5 text-[10px] text-purple-700 dark:text-purple-300">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-purple-700 dark:text-purple-300">{generatedSkillDraft.description}</div>
                        </div>
                        <div className="p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300 mb-2">Generated skill body</div>
                          <textarea
                            value={generatedSkillDraft.content}
                            onChange={(e) => setGeneratedSkillDraft({ ...generatedSkillDraft, content: e.target.value })}
                            rows={12}
                            className="w-full px-3 py-2 border border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                        {missingGeneratedSkillSections.length > 0 && (
                          <div className="px-4 pb-4">
                            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200 mb-2">Suggested missing SKILL.md sections</div>
                              <div className="flex flex-wrap gap-2">
                                {missingGeneratedSkillSections.map((section) => (
                                  <span key={section} className="rounded-full border border-amber-300 dark:border-amber-700 px-2.5 py-1 text-[11px] text-amber-800 dark:text-amber-200">
                                    {section.replace(/^##\s*/, '')}
                                  </span>
                                ))}
                              </div>
                              <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                                Refine the draft to add these sections if they would make the skill clearer and easier to reuse.
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="px-4 pb-4">
                          <label className="block text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300 mb-2">Refine this draft</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={aiSkillRefinementPrompt}
                              onChange={(e) => setAiSkillRefinementPrompt(e.target.value)}
                              placeholder="e.g., Add missing When to Use and Examples sections, and make the instructions more specific to compliance reviews."
                              className="flex-1 px-3 py-2 border border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-purple-500"
                            />
                            <button
                              onClick={() => handleGenerateSkill(true)}
                              disabled={aiSkillGenerating || !aiSkillRefinementPrompt.trim()}
                              className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-sm font-medium"
                            >
                              {aiSkillGenerating ? 'Refining...' : 'Refine'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Error Display */}
                {error && (
                  <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                    ❌ {error}
                  </div>
                )}
              </div>

              {/* Actions (for local/github only) */}
              {importSource !== 'registry' && importSource !== 'partner' && importSource !== 'ai' && (
                <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                    <button
                      onClick={handleImportSkill}
                      disabled={importing || !importPath.trim()}
                      className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                        importing || !importPath.trim()
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                          : 'bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-400'
                      }`}
                    >
                      {importing ? 'Importing...' : 'Import Skill'}
                    </button>
                    <button
                      onClick={() => {
                        setShowImportDialog(false)
                        setImportPath('')
                        setError(null)
                      }}
                      className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                </div>
              )}
              {importSource === 'ai' && (
                <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                  <button
                    onClick={handleCreateGeneratedSkill}
                    disabled={aiSkillCreating || !generatedSkillDraft}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                      aiSkillCreating || !generatedSkillDraft
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {aiSkillCreating ? 'Creating...' : 'Create Skill'}
                  </button>
                  <button
                    onClick={() => {
                      setShowImportDialog(false)
                      setAiSkillPrompt('')
                      setAiSkillRefinementPrompt('')
                      setGeneratedSkillDraft(null)
                      setError(null)
                    }}
                    className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        <AIPromptEditorModal
          isOpen={showAiPromptEditor}
          title="Skill AI Editor"
          initialValue={aiSkillPrompt}
          placeholder="e.g., A skill that helps an agent detect and summarize PII exposure risks in documents, with short actionable outputs and a cautious tone."
          onClose={() => setShowAiPromptEditor(false)}
          onSave={setAiSkillPrompt}
          onSaveAndGenerate={(value) => {
            setAiSkillPrompt(value)
            window.setTimeout(() => {
              void handleGenerateSkill(false, value)
            }, 0)
          }}
          onExpandWithAi={(value, format, guidance) => expandPromptWithAI(value, 'skill', format, guidance)}
          saveAndGenerateLabel="Save & Generate"
          savingAndGenerating={aiSkillGenerating}
          generateDisabled={!aiEnabled}
          qualityDomain="skill"
        />
      </div>
    </div>
  )
}
