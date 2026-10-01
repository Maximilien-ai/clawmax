// Disposable browser-contract fixture; not imported by the production app.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceClearDialog } from '../src/components/WorkspaceClearDialog'
import '../src/index.css'
function Fixture() {
  const [open, setOpen] = React.useState(false)
  return <main className="p-4"><button onClick={() => setOpen(true)}>Clear Personal workspace</button>
    {open && <WorkspaceClearDialog onClose={() => setOpen(false)} />}</main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
