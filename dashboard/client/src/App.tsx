import { useState } from 'react'
import Agents from './pages/Agents'
import DocHub from './pages/DocHub'

type Page = 'agents' | 'docs'

export default function App() {
  const [page, setPage] = useState<Page>('agents')

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-gray-700">
          <span className="text-lg font-bold tracking-tight text-white">ClawMax</span>
          <span className="text-sky-400 font-bold text-lg">.ai</span>
          <p className="text-xs text-gray-400 mt-0.5">Owner Dashboard</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          <NavItem label="Agents" icon="robot" active={page === 'agents'} onClick={() => setPage('agents')} />
          <NavItem label="Documents" icon="docs" active={page === 'docs'} onClick={() => setPage('docs')} />
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 text-xs text-gray-500">
          v0.1 · localhost
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {page === 'agents' && <Agents />}
        {page === 'docs' && <DocHub />}
      </main>
    </div>
  )
}

function NavItem({ label, icon, active, onClick }: {
  label: string
  icon: string
  active: boolean
  onClick: () => void
}) {
  const icons: Record<string, string> = {
    robot: '🤖',
    docs: '📄',
  }

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'bg-sky-600 text-white'
          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <span>{icons[icon]}</span>
      <span>{label}</span>
    </button>
  )
}
