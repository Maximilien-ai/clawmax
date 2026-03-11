import React, { createContext, useContext, useState, useCallback } from 'react'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

interface ToastContextType {
  showToast: (message: string, type: Toast['type'], duration?: number) => void
  showSuccess: (message: string, duration?: number) => void
  showError: (message: string, duration?: number) => void
  showWarning: (message: string, duration?: number) => void
  showInfo: (message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [activeAgentsBuffer, setActiveAgentsBuffer] = useState<string[]>([])
  const activeAgentsTimerRef = React.useRef<NodeJS.Timeout | null>(null)

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((message: string, type: Toast['type'], duration = 5000) => {
    const id = Math.random().toString(36).substring(7)
    const toast: Toast = { id, message, type, duration }

    setToasts(prev => [...prev, toast])

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration)
    }
  }, [removeToast])

  const showSuccess = useCallback((message: string, duration?: number) => {
    // Detect "X is now active" messages and batch them
    const activeMatch = message.match(/^(.+?) is now active$/)
    if (activeMatch) {
      const agentName = activeMatch[1]

      // Add to buffer
      setActiveAgentsBuffer(prev => [...prev, agentName])

      // Clear existing timer
      if (activeAgentsTimerRef.current) {
        clearTimeout(activeAgentsTimerRef.current)
      }

      // Set new timer to flush after 1 second of inactivity
      activeAgentsTimerRef.current = setTimeout(() => {
        setActiveAgentsBuffer(current => {
          if (current.length === 0) return current

          // Create combined toast
          const combinedMessage = current.length === 1
            ? `${current[0]} is now active`
            : `${current.length} agents are now active: ${current.join(', ')}`

          showToast(combinedMessage, 'success', duration || 5000)

          return [] // Clear buffer
        })
      }, 1000)
    } else {
      showToast(message, 'success', duration)
    }
  }, [showToast])

  const showError = useCallback((message: string, duration?: number) => {
    showToast(message, 'error', duration)
  }, [showToast])

  const showWarning = useCallback((message: string, duration?: number) => {
    showToast(message, 'warning', duration)
  }, [showToast])

  const showInfo = useCallback((message: string, duration?: number) => {
    showToast(message, 'info', duration)
  }, [showToast])

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
        {toasts.map(toast => (
          <ToastNotification
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastNotification({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200',
  }

  const textColors = {
    success: 'text-green-800',
    error: 'text-red-800',
    warning: 'text-yellow-800',
    info: 'text-blue-800',
  }

  const icons = {
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ',
  }

  return (
    <div
      className={`${bgColors[toast.type]} ${textColors[toast.type]} border rounded-lg px-4 py-3 shadow-lg flex items-start gap-3 animate-slide-in`}
    >
      <span className="text-lg font-bold">{icons[toast.type]}</span>
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={onClose}
        className={`${textColors[toast.type]} hover:opacity-70 transition-opacity text-lg leading-none`}
      >
        ×
      </button>
    </div>
  )
}
