import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface FileTree {
  [dir: string]: string[]
}

function buildTree(files: string[]): FileTree {
  const tree: FileTree = { '': [] }
  for (const f of files) {
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

export default function DocHub() {
  const [files, setFiles] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch file list
  useEffect(() => {
    fetch('/api/docs')
      .then(r => r.json())
      .then(d => {
        setFiles(d.files)
        // Auto-open MASTER_PLAN.md if present
        const mp = d.files.find((f: string) => f === 'MASTER_PLAN.md')
        if (mp) loadFile(mp)
      })
      .catch(() => setError('Failed to load file list'))
  }, [])

  function loadFile(path: string) {
    setSelected(path)
    setLoading(true)
    setError(null)
    fetch(`/api/docs/content?path=${encodeURIComponent(path)}`)
      .then(r => r.json())
      .then(d => {
        setContent(d.content)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load file')
        setLoading(false)
      })
  }

  const tree = buildTree(files)
  const dirs = Object.keys(tree).sort((a, b) => {
    if (a === '') return -1
    if (b === '') return 1
    return a.localeCompare(b)
  })

  return (
    <div className="flex h-full overflow-hidden">
      {/* File tree sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto shrink-0">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Documents</h2>
        </div>
        <div className="py-2">
          {dirs.map(dir => (
            <div key={dir}>
              {dir && (
                <div className="px-4 py-1 mt-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {dir}/
                  </span>
                </div>
              )}
              {tree[dir].map(filePath => {
                const name = filePath.split('/').pop()!
                const isPinned = filePath === 'MASTER_PLAN.md'
                return (
                  <button
                    key={filePath}
                    onClick={() => loadFile(filePath)}
                    className={`w-full text-left px-4 py-1.5 text-sm transition-colors flex items-center gap-1.5 ${
                      selected === filePath
                        ? 'bg-sky-50 text-sky-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {isPinned && <span className="text-xs text-amber-500">★</span>}
                    <span className={dir ? 'pl-2' : ''}>{name}</span>
                  </button>
                )
              })}
            </div>
          ))}
          {files.length === 0 && (
            <p className="px-4 py-4 text-sm text-gray-400">No documents found</p>
          )}
        </div>
      </aside>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto bg-white">
        {loading && (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            Loading...
          </div>
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
