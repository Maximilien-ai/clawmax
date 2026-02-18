import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type DocSection = 'ORG' | 'AGENTS' | 'SYSTEM'

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
  SYSTEM: {
    label: 'SYSTEM',
    accent: 'text-gray-400',
    headerCls: 'text-gray-400 bg-gray-50 border-gray-100',
    itemCls: 'text-gray-400 hover:bg-gray-50',
    selectedCls: 'bg-gray-100 text-gray-600 font-medium',
  },
}

const SECTION_ORDER: DocSection[] = ['ORG', 'AGENTS', 'SYSTEM']

function stripPrefix(fullPath: string, section: DocSection): string {
  const prefix = section + '/'
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath
}

export default function DocHub() {
  const [entries, setEntries] = useState<DocEntry[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<DocSection, boolean>>({ ORG: false, AGENTS: false, SYSTEM: true })
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  // collapsedDirs: Set of "SECTION/dir" keys for collapsed subdirectories
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set())

  function toggleDir(key: string) {
    setCollapsedDirs(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    fetch('/api/docs')
      .then(r => r.json())
      .then(d => {
        const list: DocEntry[] = d.entries ?? []
        setEntries(list)
        const mp = list.find(e => e.path === 'ORG/MASTER_PLAN.md') ?? list.find(e => e.path.endsWith('MASTER_PLAN.md'))
        if (mp) loadFile(mp.path)
      })
      .catch(() => setError('Failed to load file list'))
  }, [])

  function loadFile(path: string) {
    setSelected(path)
    setLoading(true)
    setError(null)
    setEditMode(false)
    setSaveError(null)
    setSaveSuccess(false)
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
    setSaveError(null)
  }

  function saveFile() {
    if (!selected) return
    setSaving(true)
    setSaveError(null)
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
        }
      })
      .catch(() => { setSaving(false); setSaveError('Save failed') })
  }

  function toggleSection(s: DocSection) {
    setCollapsed(c => ({ ...c, [s]: !c[s] }))
  }

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
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Documents</h2>
              <button
                onClick={() => setTreeCollapsed(true)}
                className="text-gray-400 hover:text-gray-600 transition-colors text-xs p-1 rounded hover:bg-gray-100"
                title="Collapse file tree"
              >◀</button>
            </div>

            <div className="py-1">
              {SECTION_ORDER.map(section => {
                const cfg = SECTION_CONFIG[section]
                const sectionEntries = entries.filter(e => e.section === section)
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
                              return (
                                <button
                                  key={actualPath}
                                  onClick={() => loadFile(actualPath)}
                                  className={`w-full text-left px-4 py-1.5 text-sm transition-colors flex items-center gap-1.5 ${
                                    selected === actualPath ? cfg.selectedCls : cfg.itemCls
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
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
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
    </div>
  )
}
