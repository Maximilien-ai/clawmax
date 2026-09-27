// Browser-only isolated fixture. The test runner intercepts every API request.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { AgentForgeSharing } from '../src/components/AgentForgeSharing'
import { WorkspaceProvider } from '../src/contexts/WorkspaceContext'
import { ToastProvider } from '../src/components/Toast'
import '../src/index.css'
createRoot(document.getElementById('root')!).render(<ToastProvider><WorkspaceProvider><AgentForgeSharing /></WorkspaceProvider></ToastProvider>)
