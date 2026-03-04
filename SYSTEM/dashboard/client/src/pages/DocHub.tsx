import React, { useEffect, useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type DocSection = 'ORG' | 'AGENTS' | 'WORKFLOWS' | 'SYSTEM'

interface DocEntry {
  path: string
  section: DocSection
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

const SECTION_CONFIG: Record<DocSection, { label: string; accent: string; headerCls: string; itemCls: string; selectedCls: string }> = {
  ORG: {
    label: 'ORG',
    accent: 'text-sky-600',
    headerCls: 'text-sky-600 bg-sky-50 border-sky-100',
    itemCls: 'text-gray-700 hover:bg-sky-50',
    selectedCls: 'bg-sky-50 text-sky-700 font-medium',
  },
  AGENTS: {
    label: 'AGENTS',
    accent: 'text-emerald-600',
    headerCls: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    itemCls: 'text-gray-700 hover:bg-emerald-50',
    selectedCls: 'bg-emerald-50 text-emerald-700 font-medium',
  },
  WORKFLOWS: {
    label: 'WORKFLOWS',
    accent: 'text-purple-600',
    headerCls: 'text-purple-600 bg-purple-50 border-purple-100',
    itemCls: 'text-gray-700 hover:bg-purple-50',
    selectedCls: 'bg-purple-50 text-purple-700 font-medium',
  },
  SYSTEM: {
    label: 'SYSTEM',
    accent: 'text-gray-400',
    headerCls: 'text-gray-400 bg-gray-50 border-gray-100',
    itemCls: 'text-gray-400 hover:bg-gray-50',
    selectedCls: 'bg-gray-100 text-gray-600 font-medium',
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

export default function DocHub({ initialFile }: { initialFile?: string } = {}) {
  const [entries, setEntries] = useState<DocEntry[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<DocSection, boolean>>({ ORG: false, AGENTS: false, WORKFLOWS: false, SYSTEM: true })
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  // collapsedDirs: Set of "SECTION/dir" keys for collapsed subdirectories
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set())
  const [agentFilter, setAgentFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchResults, setSearchResults] = useState<Array<{ path: string; matches: number; preview: string }>>([])
  const [searching, setSearching] = useState(false)
  const selectedButtonRef = useRef<HTMLButtonElement | null>(null)

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
            loadFile(targetFile.path)
            return
          }
        }
        const mp = list.find(e => e.path === 'ORG/MASTER_PLAN.md') ?? list.find(e => e.path.endsWith('MASTER_PLAN.md'))
        if (mp) loadFile(mp.path)
      })
      .catch(() => setError('Failed to load file list'))
  }, [initialFile])

  function loadFile(path: string) {
    setSelected(path)
    setLoading(true)
    setError(null)
    setEditMode(false)
    setSaveError(null)
    setSaveSuccess(false)

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
      .then(d => { setContent(d.content); setLoading(false) })
      .catch(() => { setError('Failed to load file'); setLoading(false) })
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
        // Reload file list
        const entriesRes = await fetch('/api/docs')
        const entriesData = await entriesRes.json()
        setEntries(entriesData.entries ?? [])

        // Close dialog and load the new file
        closeCreateDialog()
        loadFile(fullPath)
      } else {
        setCreateError(data.error ?? 'Failed to create document')
      }
    } catch (err) {
      setCreateError('Failed to create document')
    } finally {
      setCreating(false)
    }
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
      <aside className={`bg-white border-r border-gray-200 overflow-y-auto shrink-0 transition-all duration-200 ${treeCollapsed ? 'w-8' : 'w-64'}`}>
        {treeCollapsed ? (
          <div className="flex flex-col items-center pt-3">
            <button
              onClick={() => setTreeCollapsed(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors text-xs p-1 rounded hover:bg-gray-100"
              title="Expand file tree"
            >▶</button>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-gray-200 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Documents</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={openCreateDialog}
                    className="text-sky-600 hover:text-sky-700 hover:bg-sky-50 transition-colors text-xs px-2 py-1 rounded font-medium"
                    title="Create new document"
                  >+ New</button>
                  <button
                    onClick={collapseAllDirs}
                    className="text-gray-400 hover:text-gray-600 transition-colors text-xs px-2 py-1 rounded hover:bg-gray-100"
                    title="Collapse all directories"
                  >Collapse All</button>
                  <button
                    onClick={() => setTreeCollapsed(true)}
                    className="text-gray-400 hover:text-gray-600 transition-colors text-xs p-1 rounded hover:bg-gray-100"
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
                  className="w-full text-xs px-2 py-1 pr-14 border border-sky-300 rounded focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
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
                  className="w-full text-xs px-2 py-1 pr-6 border border-gray-200 rounded focus:outline-none focus:border-sky-400"
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
              <div className="border-b border-gray-200 bg-sky-50 p-3 space-y-2">
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
                      loadFile(result.path)
                      clearSearch()
                    }}
                    className="w-full text-left p-2 bg-white rounded border border-sky-200 hover:border-sky-400 hover:bg-sky-50 transition-colors"
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
                        {dirs.map(dir => {
                          const dirKey = `${section}/${dir}`
                          const isDirCollapsed = dir ? collapsedDirs.has(dirKey) : false
                          return (
                          <div key={dir}>
                            {dir && (
                              <button
                                onClick={() => toggleDir(dirKey)}
                                className={`w-full flex items-center justify-between px-4 py-1 mt-1 hover:bg-gray-50 transition-colors group`}
                              >
                                <span className={`text-xs font-semibold uppercase tracking-wider opacity-60 group-hover:opacity-100 ${cfg.accent}`}>
                                  {dir}/
                                </span>
                                <span className={`text-xs opacity-40 group-hover:opacity-70 ${cfg.accent}`}>{isDirCollapsed ? '▶' : '▼'}</span>
                              </button>
                            )}
                            {!isDirCollapsed && tree[dir].map(displayPath => {
                              const fullPath = section + '/' + (dir ? dir + '/' : '') + displayPath.split('/').pop()!
                              const fullEntry = sectionEntries.find(e => stripPrefix(e.path, section) === (dir ? dir + '/' + displayPath.split('/').pop()! : displayPath))
                              const actualPath = fullEntry?.path ?? fullPath
                              const name = displayPath.split('/').pop()!
                              const isPinned = actualPath.endsWith('MASTER_PLAN.md')
                              const isSelected = selected === actualPath
                              return (
                                <button
                                  key={actualPath}
                                  ref={isSelected ? selectedButtonRef : null}
                                  onClick={() => loadFile(actualPath)}
                                  className={`w-full text-left px-4 py-1.5 text-sm transition-colors flex items-center gap-1.5 ${
                                    isSelected ? cfg.selectedCls : cfg.itemCls
                                  }`}
                                >
                                  {isPinned && <span className="text-xs text-amber-500">★</span>}
                                  <span className={dir ? 'pl-2' : ''}>{name}</span>
                                </button>
                              )
                            })}
                          </div>
                        )
                        })}
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

      {/* Content area */}
      <div className="flex-1 overflow-hidden flex flex-col bg-white">
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
                {saveSuccess && (
                  <span className="text-xs text-green-600 font-medium">Saved</span>
                )}
                {saveError && (
                  <span className="text-xs text-red-600">{saveError}</span>
                )}
                {editMode ? (
                  <>
                    <button
                      onClick={cancelEdit}
                      className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
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
                    className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
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
                      <span className="text-gray-700 ml-2">{err.message}</span>
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
            {editMode ? (
              <textarea
                className="flex-1 w-full px-8 py-6 font-mono text-sm text-gray-800 resize-none outline-none border-none bg-gray-50"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                spellCheck={false}
                autoFocus
              />
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-8 py-8">
                  <div className="prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(content)}</ReactMarkdown>
                  </div>
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
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={closeCreateDialog}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Document</h3>

            {createError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {createError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                <select
                  value={newDocSection}
                  onChange={e => setNewDocSection(e.target.value as DocSection)}
                  className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                >
                  <option value="ORG">ORG</option>
                  <option value="AGENTS">AGENTS</option>
                  <option value="SYSTEM">SYSTEM</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Choose where to create the document</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Path</label>
                <input
                  type="text"
                  value={newDocPath}
                  onChange={e => setNewDocPath(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createDocument()}
                  placeholder="example.md or subdirectory/example.md"
                  className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  File path relative to {newDocSection}/ (must end with .md)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Initial Content</label>
                <textarea
                  value={newDocContent}
                  onChange={e => setNewDocContent(e.target.value)}
                  placeholder="# New Document

Start writing..."
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent font-mono text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <button
                onClick={closeCreateDialog}
                className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
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
    </div>
  )
}
