import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type DocSection = 'ORG' | 'AGENTS' | 'WORKFLOWS' | 'SYSTEM'

interface DocEntry {
  path: string
  section: DocSection
  kind?: 'markdown' | 'asset'
  assetSource?: 'uploaded' | 'generated'
  canDelete?: boolean
  isAgentWorkspace?: boolean
  createdAt?: string
  updatedAt?: string
}

interface AgentSummary {
  id: string
  name?: string
}

type SelectedPreviewKind = 'markdown' | 'text' | 'image' | 'asset'

interface DeleteConfirmationState {
  path: string
  label: string
  isDirectory: boolean
}

interface FileTree {
  [dir: string]: string[]
}

function buildTree(paths: string[]): FileTree {
  const tree: FileTree = { '': [] }
  for (const f of paths) {
    const parts = f.split('/')
    if (parts.length === 1) {
      tree[''].push(f)
    } else {
      const dir = parts.slice(0, -1).join('/')
      if (!tree[dir]) tree[dir] = []
      tree[dir].push(f)
    }
  }
  return tree
}

function getChildDirectories(tree: FileTree, parentDir: string): string[] {
  return Object.keys(tree)
    .filter((dir) => {
      if (!dir || dir === parentDir) return false
      if (!parentDir) return !dir.includes('/')
      if (!dir.startsWith(`${parentDir}/`)) return false
      return !dir.slice(parentDir.length + 1).includes('/')
    })
    .sort((a, b) => a.localeCompare(b))
}

const SECTION_CONFIG: Record<DocSection, { label: string; accent: string; headerCls: string; itemCls: string; selectedCls: string }> = {
  ORG: {
    label: 'ORG',
    accent: 'text-sky-600 dark:text-sky-400',
    headerCls: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30 border-sky-100 dark:border-sky-700',
    itemCls: 'text-gray-700 dark:text-gray-300 hover:bg-sky-50 dark:hover:bg-sky-900/30',
    selectedCls: 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 font-medium',
  },
  AGENTS: {
    label: 'AGENTS',
    accent: 'text-emerald-600 dark:text-emerald-400',
    headerCls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-700',
    itemCls: 'text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30',
    selectedCls: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium',
  },
  WORKFLOWS: {
    label: 'WORKFLOWS',
    accent: 'text-purple-600 dark:text-purple-400',
    headerCls: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 border-purple-100 dark:border-purple-700',
    itemCls: 'text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/30',
    selectedCls: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-medium',
  },
  SYSTEM: {
    label: 'SYSTEM',
    accent: 'text-gray-400 dark:text-gray-500',
    headerCls: 'text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700',
    itemCls: 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700',
    selectedCls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium',
  },
}

const SECTION_ORDER: DocSection[] = ['ORG', 'AGENTS', 'WORKFLOWS', 'SYSTEM']

// Helper function to strip YAML frontmatter from markdown content
function stripFrontmatter(content: string): string {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/
  const match = content.match(frontmatterRegex)
  if (match) {
    return content.slice(match[0].length).trim()
  }
  return content.trim()
}

function stripPrefix(fullPath: string, section: DocSection): string {
  const prefix = section + '/'
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath
}

function formatDocTimestamp(value?: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

function getAssetRecencyLabel(entry?: DocEntry | null): 'new' | 'updated' | null {
  if (!entry?.updatedAt) return null
  if (!entry.createdAt) return 'updated'
  const created = new Date(entry.createdAt).getTime()
  const updated = new Date(entry.updatedAt).getTime()
  if (Number.isNaN(created) || Number.isNaN(updated)) return null
  const ageMs = Date.now() - updated
  const isFreshToday = ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000
  if (Math.abs(updated - created) < 1000) {
    return isFreshToday ? 'new' : null
  }
  return 'updated'
}

export default function DocHub({ initialFile }: { initialFile?: string } = {}) {
  const [entries, setEntries] = useState<DocEntry[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [previewKind, setPreviewKind] = useState<SelectedPreviewKind>('markdown')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<DocSection, boolean>>({ ORG: false, AGENTS: false, WORKFLOWS: false, SYSTEM: true })
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false)
  // collapsedDirs: Set of "SECTION/dir" keys for collapsed subdirectories
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set())
  const [agentFilter, setAgentFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchResults, setSearchResults] = useState<Array<{ path: string; matches: number; preview: string }>>([])
  const [searching, setSearching] = useState(false)
  const selectedButtonRef = useRef<HTMLButtonElement | null>(null)
  const [treeWidth, setTreeWidth] = useState(320)
  const [resizingTree, setResizingTree] = useState(false)
  const treeResizeOriginRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const selectedEntry = useMemo(() => entries.find((entry) => entry.path === selected) || null, [entries, selected])
  const selectedIsAgentAsset = !!selectedEntry && selectedEntry.section === 'AGENTS' && !selectedEntry.isAgentWorkspace
  const selectedAgentAssetSource = selectedIsAgentAsset ? (selectedEntry?.assetSource || 'uploaded') : null
  const selectedIsMarkdown = !!selected && selected.endsWith('.md')
  const selectedIsTextPreview = previewKind === 'text'
  const selectedIsImagePreview = previewKind === 'image'
  const selectedCreatedLabel = formatDocTimestamp(selectedEntry?.createdAt)
  const selectedUpdatedLabel = formatDocTimestamp(selectedEntry?.updatedAt)

  function toggleDir(key: string) {
    setCollapsedDirs(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function collapseAllDirs() {
    // Collect all directory keys from current entries
    const allDirKeys = new Set<string>()
    SECTION_ORDER.forEach(section => {
      const sectionEntries = entries.filter(e => e.section === section)
      const displayPaths = sectionEntries.map(e => stripPrefix(e.path, section))
      const tree = buildTree(displayPaths)
      Object.keys(tree).forEach(dir => {
        if (dir) { // Exclude root ('')
          allDirKeys.add(`${section}/${dir}`)
        }
      })
    })
    setCollapsedDirs(allDirKeys)
  }

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Array<{ field: string; message: string; value?: any }>>([])
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Create new document
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newDocSection, setNewDocSection] = useState<DocSection>('ORG')
  const [newDocPath, setNewDocPath] = useState('')
  const [newDocContent, setNewDocContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadTargetMode, setUploadTargetMode] = useState<'shared' | 'agent'>('shared')
  const [uploadAgentId, setUploadAgentId] = useState('')
  const [uploadSubdir, setUploadSubdir] = useState('')
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [extractZip, setExtractZip] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [pendingDelete, setPendingDelete] = useState<DeleteConfirmationState | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetch('/api/docs')
      .then(r => r.json())
      .then(d => {
        const list: DocEntry[] = d.entries ?? []
        setEntries(list)
        // If initialFile provided, load it; otherwise load MASTER_PLAN
        if (initialFile) {
          const targetFile = list.find(e => e.path === initialFile)
          if (targetFile) {
            openEntry(targetFile)
            return
          }
          setSelected(null)
          setContent('')
          setError(`File not found in Documents: ${initialFile}`)
          return
        }
        const mp = list.find(e => e.path === 'ORG/MASTER_PLAN.md') ?? list.find(e => e.path.endsWith('MASTER_PLAN.md'))
        if (mp) openEntry(mp)
      })
      .catch(() => setError('Failed to load file list'))
  }, [initialFile])

  useEffect(() => {
    if (!resizingTree) return
    const handleMove = (event: MouseEvent) => {
      const origin = treeResizeOriginRef.current
      if (!origin) return
      const nextWidth = origin.startWidth + (event.clientX - origin.startX)
      setTreeWidth(Math.max(240, Math.min(560, nextWidth)))
    }
    const handleUp = () => {
      setResizingTree(false)
      treeResizeOriginRef.current = null
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [resizingTree])

  function loadFile(path: string) {
    setSelected(path)
    setMobileTreeOpen(false) // Close mobile sidebar when selecting a file
    setLoading(true)
    setError(null)
    setEditMode(false)
    setSaveError(null)
    setSaveSuccess(false)
    setPreviewKind('markdown')
    setImageDataUrl(null)

    // Auto-expand section and directory if needed
    const section = path.split('/')[0] as DocSection
    if (collapsed[section]) {
      setCollapsed(c => ({ ...c, [section]: false }))
    }
    const dirMatch = path.match(/^[^/]+\/([^/]+)\//)
    if (dirMatch) {
      const dir = dirMatch[1]
      const dirKey = `${section}/${dir}`
      setCollapsedDirs(prev => {
        const next = new Set(prev)
        next.delete(dirKey)
        return next
      })
    }

    fetch(`/api/docs/content?path=${encodeURIComponent(path)}`)
      .then(r => r.json())
      .then(d => {
        setPreviewKind(d.kind || 'markdown')
        if (d.kind === 'image') {
          setImageDataUrl(d.dataUrl || null)
          setContent('')
        } else {
          setImageDataUrl(null)
          setContent(d.content || '')
        }
        setLoading(false)
      })
      .catch(() => { setError('Failed to load file'); setLoading(false) })
  }

  function openEntry(entry: DocEntry) {
    loadFile(entry.path)
  }

  function startEdit() {
    setDraft(content)
    setEditMode(true)
    setSaveError(null)
    setSaveSuccess(false)
  }

  function cancelEdit() {
    setEditMode(false)
    setDraft(content)
    setSaveError(null)
    setValidationErrors([])
  }

  function saveFile() {
    if (!selected) return
    setSaving(true)
    setSaveError(null)
    setValidationErrors([])
    setSaveSuccess(false)
    fetch('/api/docs/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: selected, content: draft }),
    })
      .then(r => r.json())
      .then(d => {
        setSaving(false)
        if (d.ok) {
          setContent(draft)
          setEditMode(false)
          setSaveSuccess(true)
          setTimeout(() => setSaveSuccess(false), 3000)
        } else {
          setSaveError(d.error ?? 'Save failed')
          if (d.validationErrors && Array.isArray(d.validationErrors)) {
            setValidationErrors(d.validationErrors)
          }
        }
      })
      .catch(() => { setSaving(false); setSaveError('Save failed') })
  }

  function downloadSelectedFile() {
    if (!selected) return
    const fileName = selected.split('/').pop() || 'document.md'
    if (selectedIsImagePreview && imageDataUrl) {
      const a = document.createElement('a')
      a.href = imageDataUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return
    }
    const contentType = previewKind === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8'
    const blob = new Blob([content], { type: contentType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function toggleSection(s: DocSection) {
    setCollapsed(c => ({ ...c, [s]: !c[s] }))
  }

  function performSearch() {
    const query = searchQuery.trim()
    if (!query) {
      setSearchResults([])
      return
    }

    setSearching(true)
    fetch(`/api/docs/search?q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(d => {
        setSearchResults(d.results || [])
        setSearching(false)
      })
      .catch(() => {
        setSearching(false)
        setSearchResults([])
      })
  }

  function clearSearch() {
    setSearchQuery('')
    setSearchResults([])
  }

  function openCreateDialog() {
    setNewDocSection('ORG')
    setNewDocPath('')
    setNewDocContent('# New Document\n\n')
    setCreateError(null)
    setShowCreateDialog(true)
  }

  function closeCreateDialog() {
    setShowCreateDialog(false)
    setNewDocPath('')
    setNewDocContent('')
    setCreateError(null)
  }

  function openUploadDialog() {
    setUploadTargetMode('shared')
    setUploadAgentId('')
    setUploadSubdir('')
    setUploadFiles([])
    setExtractZip(true)
    setUploadError(null)
    setUploadSuccess(null)
    setShowUploadDialog(true)
    fetch('/api/agents')
      .then(r => r.ok ? r.json() : { agents: [] })
      .then(d => setAgents(Array.isArray(d.agents) ? d.agents : []))
      .catch(() => setAgents([]))
  }

  function closeUploadDialog() {
    setShowUploadDialog(false)
    setUploadFiles([])
    setUploadError(null)
    setUploadSuccess(null)
  }

  async function createDocument() {
    const trimmedPath = newDocPath.trim()
    if (!trimmedPath) {
      setCreateError('Path is required')
      return
    }
    if (!trimmedPath.endsWith('.md')) {
      setCreateError('Path must end with .md')
      return
    }

    const fullPath = `${newDocSection}/${trimmedPath}`
    setCreating(true)
    setCreateError(null)

    try {
      const res = await fetch('/api/docs/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath, content: newDocContent }),
      })
      const data = await res.json()

      if (data.ok) {
        await refreshEntries()
        // Close dialog and load the new file
        closeCreateDialog()
        const createdEntry: DocEntry = { path: fullPath, section: newDocSection, kind: 'markdown' }
        openEntry(createdEntry)
      } else {
        setCreateError(data.error ?? 'Failed to create document')
      }
    } catch (err) {
      setCreateError('Failed to create document')
    } finally {
      setCreating(false)
    }
  }

  async function refreshEntries() {
    const entriesRes = await fetch('/api/docs')
    const entriesData = await entriesRes.json()
    setEntries(entriesData.entries ?? [])
  }

  useEffect(() => {
    const handleWorkspaceContentUpdate = () => {
      refreshEntries().catch(() => setError('Failed to refresh file list'))
    }

    window.addEventListener('agents-updated', handleWorkspaceContentUpdate)
    window.addEventListener('workflows-updated', handleWorkspaceContentUpdate)
    window.addEventListener('channels-updated', handleWorkspaceContentUpdate)

    return () => {
      window.removeEventListener('agents-updated', handleWorkspaceContentUpdate)
      window.removeEventListener('workflows-updated', handleWorkspaceContentUpdate)
      window.removeEventListener('channels-updated', handleWorkspaceContentUpdate)
    }
  }, [])

  function buildUploadTargetPath() {
    const base = uploadTargetMode === 'agent' && uploadAgentId.trim()
      ? `AGENTS/${uploadAgentId.trim()}`
      : 'AGENTS'
    const subdir = uploadSubdir.trim().replace(/^\/+|\/+$/g, '')
    return subdir ? `${base}/${subdir}` : base
  }

  async function uploadSelectedFiles() {
    if (uploadFiles.length === 0) {
      setUploadError('Choose at least one file')
      return
    }
    if (uploadTargetMode === 'agent' && !uploadAgentId.trim()) {
      setUploadError('Choose an agent workspace')
      return
    }

    const target = buildUploadTargetPath()
    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    try {
      const uploadedPaths: string[] = []
      for (const file of uploadFiles) {
        const shouldExtract = extractZip && file.name.toLowerCase().endsWith('.zip')
        const res = await fetch(`/api/docs/upload?target=${encodeURIComponent(target)}&extractZip=${shouldExtract ? 'true' : 'false'}`, {
          method: 'POST',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'x-file-name': file.name,
          },
          body: await file.arrayBuffer(),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) {
          throw new Error(res.status === 401 ? 'Session expired. Please sign in again.' : (data.error || `Failed to upload ${file.name}`))
        }
        if (Array.isArray(data.files)) {
          uploadedPaths.push(...data.files)
        } else if (typeof data.path === 'string') {
          uploadedPaths.push(data.path)
        }
      }

      await refreshEntries()
      setUploadSuccess(`Uploaded ${uploadFiles.length} file${uploadFiles.length === 1 ? '' : 's'} to ${target}`)
      const firstMarkdown = uploadedPaths.find((entry) => entry.endsWith('.md'))
      if (firstMarkdown) {
        openEntry({ path: firstMarkdown, section: 'AGENTS', kind: 'markdown' })
      }
      setTimeout(() => closeUploadDialog(), 1000)
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function getAssetTone(entry?: DocEntry | null) {
    const generated = entry?.assetSource === 'generated'
    return generated
      ? {
          selected: 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 font-medium',
          idle: 'text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20',
          row: 'bg-emerald-50/60 dark:bg-emerald-950/20',
          text: 'text-emerald-700 dark:text-emerald-300',
          badge: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
          label: 'memory',
        }
      : {
          selected: 'bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 font-medium',
          idle: 'text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20',
          row: 'bg-amber-50/60 dark:bg-amber-950/20',
          text: 'text-amber-700 dark:text-amber-300',
          badge: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
          label: 'asset',
        }
  }

  function getDirAssetMode(section: DocSection, dir: string, sectionEntries: DocEntry[]): 'agent' | 'asset' | 'generated' | 'mixed' {
    if (section !== 'AGENTS' || !dir) return 'agent'
    const prefix = `${section}/${dir}/`
    const matching = sectionEntries.filter((entry) => entry.path.startsWith(prefix))
    if (matching.length === 0) return 'agent'
    const assetCount = matching.filter((entry) => !entry.isAgentWorkspace).length
    if (assetCount === 0) return 'agent'
    if (assetCount === matching.length) {
      const generatedCount = matching.filter((entry) => entry.assetSource === 'generated').length
      if (generatedCount === matching.length) return 'generated'
      if (generatedCount === 0) return 'asset'
    }
    return 'mixed'
  }

  function requestDeleteAsset(pathToDelete: string, label: string, isDirectory: boolean) {
    setDeleteConfirmText('')
    setPendingDelete({ path: pathToDelete, label, isDirectory })
  }

  function cancelDeleteAsset() {
    if (deleting) return
    setPendingDelete(null)
    setDeleteConfirmText('')
  }

  async function confirmDeleteAsset() {
    if (!pendingDelete) return
    const expected = pendingDelete.label.replace(/\/$/, '')
    if (deleteConfirmText.trim() !== expected) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/docs/entry?path=${encodeURIComponent(pendingDelete.path)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Delete failed')
      }
      await refreshEntries()
      if (selected === pendingDelete.path || selected?.startsWith(`${pendingDelete.path}/`)) {
        setSelected(null)
        setContent('')
      }
      setPendingDelete(null)
      setDeleteConfirmText('')
    } catch (err: any) {
      setError(err.message || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  function renderDocDirectory(
    section: DocSection,
    dir: string,
    depth: number,
    tree: FileTree,
    sectionEntries: DocEntry[],
    entriesByDisplayPath: Map<string, DocEntry>,
    cfg: typeof SECTION_CONFIG[DocSection]
  ): React.ReactNode {
    const dirKey = `${section}/${dir}`
    const isDirCollapsed = collapsedDirs.has(dirKey)
    const dirMode = getDirAssetMode(section, dir, sectionEntries)
    const canDeleteDir = section === 'AGENTS' && (dirMode === 'asset' || dirMode === 'generated')
    const dirDeletePath = canDeleteDir ? `${section}/${dir}` : null
    const childDirs = getChildDirectories(tree, dir)
    const files = tree[dir] || []
    const dirName = dir.split('/').pop() || dir
    const dirTone = dirMode === 'generated'
      ? getAssetTone({ assetSource: 'generated' } as DocEntry)
      : dirMode === 'asset'
        ? getAssetTone({ assetSource: 'uploaded' } as DocEntry)
        : null

    return (
      <div key={dir}>
        <div className={`w-full flex items-center justify-between px-4 py-1 mt-1 transition-colors group ${dirTone ? dirTone.row : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
          <button
            onClick={() => toggleDir(dirKey)}
            className="flex min-w-0 flex-1 items-center justify-between text-left"
            style={{ paddingLeft: `${depth * 14}px` }}
          >
            <span className={`text-xs font-semibold uppercase tracking-wider opacity-70 group-hover:opacity-100 ${dirTone ? dirTone.text : cfg.accent}`}>
              {dirName}/
            </span>
            <span className={`text-xs opacity-40 group-hover:opacity-70 ${dirTone ? dirTone.text : cfg.accent}`}>{isDirCollapsed ? '▶' : '▼'}</span>
          </button>
          {dirDeletePath && (
            <button
              onClick={() => requestDeleteAsset(dirDeletePath, `${dirName}/`, true)}
              className="ml-2 rounded px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              title="Delete uploaded directory"
            >
              Delete
            </button>
          )}
        </div>
        {!isDirCollapsed && (
          <>
            {childDirs.map((childDir) => renderDocDirectory(section, childDir, depth + 1, tree, sectionEntries, entriesByDisplayPath, cfg))}
            {files.map((displayPath) => {
              const fullEntry = entriesByDisplayPath.get(displayPath)
              const actualPath = fullEntry?.path ?? `${section}/${displayPath}`
              const name = displayPath.split('/').pop() || displayPath
              const isPinned = actualPath.endsWith('MASTER_PLAN.md')
              const isSelected = selected === actualPath
              const isAsset = !!fullEntry && fullEntry.section === 'AGENTS' && !fullEntry.isAgentWorkspace
              const assetTone = getAssetTone(fullEntry)
              const assetRecencyLabel = isAsset ? getAssetRecencyLabel(fullEntry) : null
              return (
                <div
                  key={actualPath}
                  className={`w-full text-left px-4 py-1.5 text-sm transition-colors flex items-center gap-1.5 ${
                    isSelected
                      ? (isAsset ? assetTone.selected : cfg.selectedCls)
                      : (isAsset ? assetTone.idle : cfg.itemCls)
                  }`}
                  style={{ paddingLeft: `${(depth + 1) * 14 + 16}px` }}
                >
                  <button
                    ref={isSelected ? selectedButtonRef : null}
                    onClick={() => fullEntry ? openEntry(fullEntry) : loadFile(actualPath)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    {isPinned && <span className="text-xs text-amber-500">★</span>}
                    {isAsset && <span className={`text-[10px] rounded px-1 ${assetTone.badge}`}>{assetTone.label}</span>}
                    <span className="truncate">{name}</span>
                    {assetRecencyLabel && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        {assetRecencyLabel}
                      </span>
                    )}
                  </button>
                </div>
              )
            })}
          </>
        )}
      </div>
    )
  }

  // Auto-scroll to selected file when it changes
  useEffect(() => {
    if (selected && selectedButtonRef.current) {
      selectedButtonRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [selected])

  return (
    <div className="flex h-full overflow-hidden">
      {/* File tree sidebar */}
      {/* Mobile tree toggle button */}
      <button
        onClick={() => setMobileTreeOpen(!mobileTreeOpen)}
        className="sm:hidden fixed bottom-4 left-4 z-40 bg-sky-600 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg hover:bg-sky-700 transition-colors"
        title="Toggle file tree"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
        </svg>
      </button>

      {/* Mobile tree overlay backdrop */}
      {mobileTreeOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 sm:hidden" onClick={() => setMobileTreeOpen(false)} />
      )}

      <aside
        className={`bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto shrink-0 transition-all duration-200 ${resizingTree ? 'select-none' : ''} ${mobileTreeOpen ? 'fixed inset-y-0 left-0 z-40 sm:relative' : 'hidden sm:block'}`}
        style={{ width: treeCollapsed ? 32 : treeWidth }}
      >
        {treeCollapsed ? (
          <div className="flex flex-col items-center pt-3">
            <button
              onClick={() => setTreeCollapsed(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors text-xs p-1 rounded hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
              title="Expand file tree"
            >▶</button>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-gray-200 shrink-0 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Documents</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={openCreateDialog}
                    className="text-sky-600 hover:text-sky-700 hover:bg-sky-50 transition-colors text-xs px-2 py-1 rounded font-medium"
                    title="Create new document"
                  >+ New</button>
                  <button
                    onClick={openUploadDialog}
                    className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors text-xs px-2 py-1 rounded font-medium"
                    title="Upload files into the workspace"
                  >Upload</button>
                  <button
                    onClick={collapseAllDirs}
                    className="text-gray-400 hover:text-gray-600 transition-colors text-xs px-2 py-1 rounded hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
                    title="Collapse all directories"
                  >Collapse All</button>
                  <button
                    onClick={() => setTreeCollapsed(true)}
                    className="text-gray-400 hover:text-gray-600 transition-colors text-xs p-1 rounded hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
                    title="Collapse file tree"
                  >◀</button>
                </div>
              </div>

              {/* Global content search */}
              <div className="relative mb-2">
                <input
                  type="text"
                  placeholder="Search content (press Enter)"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && performSearch()}
                  className="w-full text-xs px-2 py-1 pr-14 border border-sky-300 dark:border-sky-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
                {searchQuery && (
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    <button
                      onClick={clearSearch}
                      className="text-gray-400 hover:text-gray-600 text-xs leading-none p-0.5"
                      title="Clear search"
                    >
                      ×
                    </button>
                    <button
                      onClick={performSearch}
                      disabled={searching}
                      className={`text-xs px-2 py-0.5 rounded ${
                        searching ? 'bg-gray-100 text-gray-400' : 'bg-sky-600 text-white hover:bg-sky-700'
                      } transition-colors`}
                    >
                      {searching ? '...' : '🔍'}
                    </button>
                  </div>
                )}
              </div>

              {/* Agent filter */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Filter agents (e.g., max0, engineer*)"
                  value={agentFilter}
                  onChange={e => setAgentFilter(e.target.value)}
                  className="w-full text-xs px-2 py-1 pr-6 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-sky-400 dark:focus:border-sky-600"
                />
                {agentFilter && (
                  <button
                    onClick={() => setAgentFilter('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs leading-none p-0.5"
                    title="Clear filter"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="border-b border-gray-200 bg-sky-50 p-3 space-y-2 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-sky-700">
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
                  </span>
                  <button
                    onClick={clearSearch}
                    className="text-xs text-sky-600 hover:text-sky-800 underline"
                  >
                    Clear
                  </button>
                </div>
                {searchResults.map(result => (
                  <button
                    key={result.path}
                    onClick={() => {
                      openEntry({ path: result.path, section: (result.path.split('/')[0] as DocSection) || 'SYSTEM', kind: result.path.endsWith('.md') ? 'markdown' : 'asset' })
                      clearSearch()
                    }}
                    className="w-full text-left p-2 bg-white dark:bg-gray-800 rounded border border-sky-200 hover:border-sky-400 hover:bg-sky-50 transition-colors"
                  >
                    <div className="text-xs font-medium text-sky-700 mb-1">{result.path}</div>
                    <div className="text-xs text-gray-600 line-clamp-2">{result.preview}</div>
                    <div className="text-xs text-gray-400 mt-1">{result.matches} match{result.matches !== 1 ? 'es' : ''}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="py-1">
              {SECTION_ORDER.map(section => {
                const cfg = SECTION_CONFIG[section]
                let sectionEntries = entries.filter(e => e.section === section)

                // Apply agent filter for AGENTS section
                if (section === 'AGENTS' && agentFilter.trim()) {
                  const filterLower = agentFilter.trim().toLowerCase()
                  const isWildcard = filterLower.endsWith('*')
                  const filterPrefix = isWildcard ? filterLower.slice(0, -1) : filterLower

                  sectionEntries = sectionEntries.filter(e => {
                    const agentMatch = e.path.match(/^AGENTS\/([^/]+)/)
                    if (!agentMatch) return false
                    const agentId = agentMatch[1].toLowerCase()

                    if (isWildcard) {
                      return agentId.startsWith(filterPrefix)
                    } else {
                      return agentId === filterPrefix || agentId.includes(filterPrefix)
                    }
                  })
                }
                if (sectionEntries.length === 0) return null

                const displayPaths = sectionEntries.map(e => stripPrefix(e.path, section))
                const tree = buildTree(displayPaths)
                const entriesByDisplayPath = new Map(sectionEntries.map((entry) => [stripPrefix(entry.path, section), entry]))
                const dirs = Object.keys(tree).sort((a, b) => {
                  if (a === '') return -1
                  if (b === '') return 1
                  return a.localeCompare(b)
                })

                const isCollapsed = collapsed[section]

                return (
                  <div key={section} className="mb-1">
                    <button
                      onClick={() => toggleSection(section)}
                      className={`w-full flex items-center justify-between px-4 py-2 border-y text-xs font-bold uppercase tracking-wider ${cfg.headerCls} transition-colors`}
                    >
                      <span>{cfg.label}</span>
                      <span className="opacity-60">{isCollapsed ? '▶' : '▼'}</span>
                    </button>

                    {!isCollapsed && (
                      <div className="py-1">
                        {(tree[''] || []).map((displayPath) => {
                          const fullEntry = entriesByDisplayPath.get(displayPath)
                          const actualPath = fullEntry?.path ?? `${section}/${displayPath}`
                          const name = displayPath.split('/').pop() || displayPath
                          const isPinned = actualPath.endsWith('MASTER_PLAN.md')
                          const isSelected = selected === actualPath
                          const isAsset = !!fullEntry && fullEntry.section === 'AGENTS' && !fullEntry.isAgentWorkspace
                          const assetTone = getAssetTone(fullEntry)
                          const assetRecencyLabel = isAsset ? getAssetRecencyLabel(fullEntry) : null
                          return (
                            <div
                              key={actualPath}
                              className={`w-full text-left px-4 py-1.5 text-sm transition-colors flex items-center gap-1.5 ${
                                isSelected
                                  ? (isAsset ? assetTone.selected : cfg.selectedCls)
                                  : (isAsset ? assetTone.idle : cfg.itemCls)
                              }`}
                            >
                              <button
                                ref={isSelected ? selectedButtonRef : null}
                                onClick={() => fullEntry ? openEntry(fullEntry) : loadFile(actualPath)}
                                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                              >
                                {isPinned && <span className="text-xs text-amber-500">★</span>}
                                {isAsset && <span className={`text-[10px] rounded px-1 ${assetTone.badge}`}>{assetTone.label}</span>}
                                <span className="truncate">{name}</span>
                                {assetRecencyLabel && (
                                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                    {assetRecencyLabel}
                                  </span>
                                )}
                              </button>
                            </div>
                          )
                        })}
                        {getChildDirectories(tree, '').map((dir) =>
                          renderDocDirectory(section, dir, 1, tree, sectionEntries, entriesByDisplayPath, cfg)
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {entries.length === 0 && (
                <p className="px-4 py-4 text-sm text-gray-400">No documents found</p>
              )}
            </div>
          </div>
        )}
      </aside>
      {!treeCollapsed && (
        <div
          className="hidden sm:block w-3 -ml-1 shrink-0 cursor-col-resize bg-transparent hover:bg-sky-200/70 dark:hover:bg-sky-800/70"
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            treeResizeOriginRef.current = { startX: event.clientX, startWidth: treeWidth }
            setResizingTree(true)
          }}
          title="Resize file tree"
        />
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden flex flex-col bg-white dark:bg-gray-800">
        {loading && (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading...</div>
        )}
        {error && (
          <div className="m-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}
        {!loading && !error && selected && (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-8 py-3 border-b border-gray-100 shrink-0">
              <span className="text-xs text-gray-400 font-mono">{selected}</span>
              <div className="flex items-center gap-2">
                {(previewKind !== 'asset') && (
                  <button
                    onClick={downloadSelectedFile}
                    className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Download
                  </button>
                )}
                {saveSuccess && (
                  <span className="text-xs text-green-600 font-medium">Saved</span>
                )}
                {saveError && (
                  <span className="text-xs text-red-600">{saveError}</span>
                )}
                {selectedIsAgentAsset && selectedIsMarkdown && selectedEntry?.canDelete && !editMode && (
                  <button
                    onClick={() => requestDeleteAsset(selectedEntry.path, selectedEntry.path.split('/').pop() || selectedEntry.path, false)}
                    className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors dark:border-red-900 dark:hover:bg-red-950/30"
                  >
                    Delete
                  </button>
                )}
                {selectedIsAgentAsset && !selectedIsMarkdown ? (
                  selectedEntry?.canDelete ? (
                    <button
                      onClick={() => requestDeleteAsset(selectedEntry.path, selectedEntry.path.split('/').pop() || selectedEntry.path, false)}
                      className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors dark:border-red-900 dark:hover:bg-red-950/30"
                    >
                      Delete
                    </button>
                  ) : null
                ) : editMode ? (
                  <>
                    <button
                      onClick={cancelEdit}
                      className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveFile}
                      disabled={saving}
                      className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
                        saving ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-sky-600 text-white hover:bg-sky-700'
                      }`}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={startEdit}
                    className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="mx-8 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-red-600 font-semibold text-sm">❌ Validation Failed</span>
                </div>
                <div className="space-y-2">
                  {validationErrors.map((err, idx) => (
                    <div key={idx} className="text-sm">
                      <span className="font-mono text-xs text-red-700 bg-red-100 px-1.5 py-0.5 rounded">{err.field}</span>
                      <span className="text-gray-700 ml-2 dark:text-gray-300">{err.message}</span>
                      {err.value !== undefined && (
                        <span className="text-gray-500 ml-2 italic">({JSON.stringify(err.value)})</span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-3">
                  Please fix the errors above and try saving again. The document will not be saved until all validation errors are resolved.
                </p>
              </div>
            )}

            {/* View or Edit */}
            {selectedIsAgentAsset && previewKind === 'asset' ? (
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-8 py-8">
                  <div className={`rounded-xl p-5 text-sm ${
                    selectedAgentAssetSource === 'generated'
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200'
                      : 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200'
                  }`}>
                    <div className="font-semibold">{selectedAgentAssetSource === 'generated' ? 'Agent-generated file' : 'Uploaded workspace asset'}</div>
                    <div className="mt-2 font-mono text-xs break-all">{selectedEntry.path}</div>
                    {(selectedCreatedLabel || selectedUpdatedLabel) && (
                      <div className="mt-3 space-y-1 text-xs">
                        {selectedCreatedLabel && <div><span className="font-semibold">Created:</span> {selectedCreatedLabel}</div>}
                        {selectedUpdatedLabel && <div><span className="font-semibold">Last updated:</span> {selectedUpdatedLabel}</div>}
                      </div>
                    )}
                    <p className="mt-3 text-sm">
                      {selectedAgentAssetSource === 'generated'
                        ? 'This file was generated by the agent runtime. Preview is not available for this file type, but you can still download or delete it from DocHub.'
                        : 'Preview is not available for this file type. You can still download or delete it from DocHub if it is no longer needed.'}
                    </p>
                  </div>
                </div>
              </div>
            ) : editMode ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {selectedIsAgentAsset && (
                  <div className={`mx-8 mt-4 rounded-lg px-4 py-3 text-sm ${
                    selectedAgentAssetSource === 'generated'
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200'
                      : 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200'
                  }`}>
                    {selectedAgentAssetSource === 'generated'
                      ? 'This markdown file was generated by the agent runtime. You can review, edit, download, or delete it here.'
                      : 'This markdown file was uploaded into an agent workspace. You can review, edit, download, or delete it here.'}
                  </div>
                )}
                <textarea
                  className="flex-1 w-full px-8 py-6 font-mono text-sm text-gray-800 resize-none outline-none border-none bg-gray-50 dark:text-gray-200 dark:bg-gray-900"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-8 py-8">
                  {selectedIsAgentAsset && (
                    <div className={`mb-4 rounded-xl p-4 text-sm ${
                      selectedAgentAssetSource === 'generated'
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200'
                        : 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200'
                    }`}>
                      <div className="font-semibold">{selectedAgentAssetSource === 'generated' ? 'Agent-generated markdown file' : 'Uploaded markdown file'}</div>
                      <div className="mt-1 font-mono text-xs break-all">{selectedEntry?.path}</div>
                      {(selectedCreatedLabel || selectedUpdatedLabel) && (
                        <div className="mt-3 space-y-1 text-xs">
                          {selectedCreatedLabel && <div><span className="font-semibold">Created:</span> {selectedCreatedLabel}</div>}
                          {selectedUpdatedLabel && <div><span className="font-semibold">Last updated:</span> {selectedUpdatedLabel}</div>}
                        </div>
                      )}
                      <p className="mt-2">
                        {selectedAgentAssetSource === 'generated'
                          ? 'This file was generated by the agent runtime. It is not part of the protected agent definition, so you can edit, download, or delete it here.'
                          : 'This file was uploaded into an agent workspace. It is not part of the protected agent definition, so you can edit, download, or delete it here.'}
                      </p>
                    </div>
                  )}
                  {selectedIsImagePreview && imageDataUrl ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                        <img src={imageDataUrl} alt={selected || 'Uploaded image'} className="max-w-full h-auto rounded mx-auto" />
                      </div>
                    </div>
                  ) : selectedIsTextPreview ? (
                    <pre className="whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">{content}</pre>
                  ) : (
                    <div className="prose">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(content)}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        {!loading && !error && !selected && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <span className="text-4xl mb-4">📄</span>
            <p className="text-sm">Select a document to read</p>
          </div>
        )}
      </div>

      {/* Create Document Dialog */}
      {pendingDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={cancelDeleteAsset}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delete {pendingDelete.label}?</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              This removes the uploaded {pendingDelete.isDirectory ? 'directory' : 'file'} from the workspace. This cannot be undone.
            </p>

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <div className="font-medium">Will be deleted</div>
              <div className="mt-2 font-mono text-xs break-all">{pendingDelete.path}</div>
              {pendingDelete.isDirectory && (
                <div className="mt-3 space-y-1">
                  {entries
                    .filter(entry => entry.path.startsWith(`${pendingDelete.path}/`))
                    .slice(0, 12)
                    .map(entry => (
                      <div key={entry.path} className="font-mono text-xs break-all">
                        {entry.path}
                      </div>
                    ))}
                  {entries.filter(entry => entry.path.startsWith(`${pendingDelete.path}/`)).length > 12 && (
                    <div className="font-mono text-xs opacity-70">
                      …and {entries.filter(entry => entry.path.startsWith(`${pendingDelete.path}/`)).length - 12} more item(s)
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Type <span className="font-mono">{pendingDelete.label.replace(/\/$/, '')}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                className="mt-2 w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                placeholder={pendingDelete.label.replace(/\/$/, '')}
                autoFocus
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={cancelDeleteAsset}
                className="text-sm px-4 py-2 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAsset}
                disabled={deleting || deleteConfirmText.trim() !== pendingDelete.label.replace(/\/$/, '')}
                className={`text-sm px-4 py-2 rounded font-medium ${
                  deleting || deleteConfirmText.trim() !== pendingDelete.label.replace(/\/$/, '')
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={closeCreateDialog}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 dark:text-gray-100">Create New Document</h3>

            {createError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {createError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Section</label>
                <select
                  value={newDocSection}
                  onChange={e => setNewDocSection(e.target.value as DocSection)}
                  className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent dark:border-gray-700"
                >
                  <option value="ORG">ORG</option>
                  <option value="AGENTS">AGENTS</option>
                  <option value="SYSTEM">SYSTEM</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Choose where to create the document</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Path</label>
                <input
                  type="text"
                  value={newDocPath}
                  onChange={e => setNewDocPath(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createDocument()}
                  placeholder="example.md or subdirectory/example.md"
                  className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent font-mono text-sm dark:border-gray-700"
                />
                <p className="text-xs text-gray-500 mt-1">
                  File path relative to {newDocSection}/ (must end with .md)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Initial Content</label>
                <textarea
                  value={newDocContent}
                  onChange={e => setNewDocContent(e.target.value)}
                  placeholder="# New Document

Start writing..."
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent font-mono text-sm dark:border-gray-700"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <button
                onClick={closeCreateDialog}
                className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={createDocument}
                disabled={creating}
                className={`px-4 py-2 text-sm rounded font-medium transition-colors ${
                  creating ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-sky-600 text-white hover:bg-sky-700'
                }`}
              >
                {creating ? 'Creating...' : 'Create Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={closeUploadDialog}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 dark:text-gray-100">Upload Files to Workspace</h3>

            {uploadError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {uploadError}
              </div>
            )}
            {uploadSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded text-sm text-emerald-700">
                {uploadSuccess}
              </div>
            )}

            <div className="space-y-4">
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
                Upload into the shared <span className="font-mono">AGENTS/</span> root so every agent can access it, or target one specific agent workspace. ZIP files can be expanded in place.
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Destination</label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <input
                      type="radio"
                      checked={uploadTargetMode === 'shared'}
                      onChange={() => setUploadTargetMode('shared')}
                    />
                    Shared <span className="font-mono">AGENTS/</span> root
                  </label>
                  <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <input
                      type="radio"
                      checked={uploadTargetMode === 'agent'}
                      onChange={() => setUploadTargetMode('agent')}
                    />
                    Specific agent workspace
                  </label>
                </div>
              </div>

              {uploadTargetMode === 'agent' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Agent</label>
                  <select
                    value={uploadAgentId}
                    onChange={e => setUploadAgentId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent dark:border-gray-700"
                  >
                    <option value="">Choose an agent</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name || agent.id}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Optional subdirectory</label>
                <input
                  type="text"
                  value={uploadSubdir}
                  onChange={e => setUploadSubdir(e.target.value)}
                  placeholder="e.g. knowledge-base, inputs/april-demo"
                  className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent font-mono text-sm dark:border-gray-700"
                />
                <p className="text-xs text-gray-500 mt-1">Resolved target: <span className="font-mono">{buildUploadTargetPath()}</span></p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Files</label>
                <input
                  type="file"
                  multiple
                  onChange={e => setUploadFiles(Array.from(e.target.files || []))}
                  className="w-full text-sm text-gray-700 dark:text-gray-300"
                />
                {uploadFiles.length > 0 && (
                  <div className="mt-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-2 text-xs text-gray-600 dark:text-gray-300 space-y-1">
                    {uploadFiles.map((file) => (
                      <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3">
                        <span className="font-mono truncate">{file.name}</span>
                        <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={extractZip}
                  onChange={e => setExtractZip(e.target.checked)}
                />
                Expand ZIP files after upload
              </label>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <button
                onClick={closeUploadDialog}
                className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={uploadSelectedFiles}
                disabled={uploading}
                className={`px-4 py-2 text-sm rounded font-medium transition-colors ${
                  uploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {uploading ? 'Uploading...' : 'Upload Files'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
