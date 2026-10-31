// Disposable fixture with real providers and synthetic API data.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceProvider, useWorkspace } from '../src/contexts/WorkspaceContext'
import { ToastProvider } from '../src/components/Toast'
import { WorkspaceEditDialog } from '../src/components/WorkspaceEditDialog'
import '../src/index.css'
function Fixture() {
  const { workspaces } = useWorkspace()
  const [open, setOpen] = React.useState(false)
  return <main><button onClick={() => setOpen(true)}>Edit test workspace</button>
    {workspaces[0] && <WorkspaceEditDialog workspace={workspaces[0]} isOpen={open} onClose={() => setOpen(false)} />}</main>
}
createRoot(document.getElementById('root')!).render(<ToastProvider><WorkspaceProvider><Fixture /></WorkspaceProvider></ToastProvider>)
