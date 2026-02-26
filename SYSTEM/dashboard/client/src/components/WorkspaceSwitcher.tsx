import React, { useState, useRef, useEffect } from 'react'
import { useWorkspace } from '../contexts/WorkspaceContext'

export function WorkspaceSwitcher({ onCreateNew }: { onCreateNew: () => void }) {
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspace()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  if (!activeWorkspace) {
    return null
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Current workspace button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 transition-colors text-sm font-medium"
        title="Switch workspace"
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: activeWorkspace.color || '#3B82F6' }}
        />
        <span className="text-gray-800">{activeWorkspace.name}</span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {/* Workspace list */}
          <div className="max-h-80 overflow-y-auto">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                onClick={() => {
                  if (workspace.id !== activeWorkspace.id) {
                    switchWorkspace(workspace.id)
                  }
                  setIsOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                  workspace.id === activeWorkspace.id ? 'bg-blue-50' : ''
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: workspace.color || '#3B82F6' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium text-sm ${
                      workspace.id === activeWorkspace.id ? 'text-blue-700' : 'text-gray-900'
                    }`}>
                      {workspace.name}
                    </span>
                    {workspace.id === activeWorkspace.id && (
                      <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {workspace.tags && workspace.tags.length > 0 && (
                      <div className="flex gap-1">
                        {workspace.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {workspace.agentCount !== undefined && (
                      <span className="text-xs text-gray-500">
                        {workspace.agentCount} agent{workspace.agentCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 my-1" />

          {/* Create new workspace button */}
          <button
            onClick={() => {
              setIsOpen(false)
              onCreateNew()
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Create New Workspace</span>
          </button>
        </div>
      )}
    </div>
  )
}
