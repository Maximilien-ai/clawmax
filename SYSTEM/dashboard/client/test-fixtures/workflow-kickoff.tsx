import React from 'react'
import { createRoot } from 'react-dom/client'
import WorkflowDAG from '../src/components/WorkflowDAG'
import '../src/index.css'
const workflows = ['Build Playbooks', 'Assemble Cadence', 'Kickoff Personal Operations'].map((name, i) => ({ id: `w${i}`, name, schedule: 'manual', enabled: true, executionMode: 'managed', dependsOn: [] }))
createRoot(document.getElementById('root')!).render(<WorkflowDAG workflows={workflows} />)
