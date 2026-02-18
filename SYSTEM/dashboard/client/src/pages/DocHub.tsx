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
// Strip leading section prefix from path for display
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
  // SYSTEM collapsed by default
  const [collapsed, setCollapsed] = useState<Record<DocSection, boolean>>({ ORG: false, AGENTS: false, SYSTEM: true })

  useEffect(() => {
    fetch('/api/docs')
      .then(r => r.json())
      .then(d => {
        const list: DocEntry[] = d.entries ?? []
        setEntries(list)
        // Auto-open ORG/MASTER_PLAN.md if present
        const mp = list.find(e => e.path === 'ORG/MASTER_PLAN.md') ?? list.find(e => e.path.endsWith('MASTER_PLAN.md'))
        if (mp) loadFile(mp.path)
      })
      .catch(() => setError('Failed to load file list'))
  }, [])

  function loadFile(path: string) {
    setSelected(path)
    setLoading(true)
    setError(null)
    fetch(`/api/docs/content?path=${encodeURIComponent(path)}`)
      .then(r => r.json())
      .then(d => { setContent(d.content); setLoading(false) })
      .catch(() => { setError('Failed to load file'); setLoading(false) })
  }

  function toggleSection(s: DocSection) {
    setCollapsed(c => ({ ...c, [s]: !c[s] }))
  }

  const [treeCollapsed, setTreeCollapsed] = useState(false)

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

            // Build display tree: strip section prefix, then group by sub-dir
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
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section)}
                  className={`w-full flex items-center justify-between px-4 py-2 border-y text-xs font-bold uppercase tracking-wider ${cfg.headerCls} transition-colors`}
                >
                  <span>{cfg.label}</span>
                  <span className="opacity-60">{isCollapsed ? '▶' : '▼'}</span>
                </button>

                {!isCollapsed && (
                  <div className="py-1">
                    {dirs.map(dir => (
                      <div key={dir}>
                        {dir && (
                          <div className="px-4 py-1 mt-1">
                            <span className={`text-xs font-semibold uppercase tracking-wider opacity-60 ${cfg.accent}`}>
                              {dir}/
                            </span>
                          </div>
                        )}
                        {tree[dir].map(displayPath => {
                          const fullPath = section + '/' + (dir ? dir + '/' : '') + displayPath.split('/').pop()!
                          // Reconstruct the full path from display path
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
                    ))}
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
      <div className="flex-1 overflow-y-auto bg-white">
        {loading && (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading...</div>
        )}
        {error && (
          <div className="m-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}
        {!loading && !error && selected && (
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="mb-4 pb-4 border-b border-gray-100">
              <span className="text-xs text-gray-400 font-mono">{selected}</span>
            </div>
            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </div>
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
