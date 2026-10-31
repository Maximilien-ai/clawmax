import React from 'react'
import { createRoot } from 'react-dom/client'
import WorkflowDAG from '../src/components/WorkflowDAG'
import '../src/index.css'
const workflows = [
 {id:'final',name:'Finalize Personal Operations',dependsOn:['assemble']},
 {id:'assemble',name:'Assemble Cadence',dependsOn:['build']},
 {id:'build',name:'Build Playbooks',dependsOn:[],inputRefs:[{workflowId:'kickoff',outputKey:'summary'}]},
 {id:'kickoff',name:'Kickoff Personal Operations',dependsOn:[]},
].map(w => ({...w, schedule:'manual',enabled:true,executionMode:'managed'}))
createRoot(document.getElementById('root')!).render(<WorkflowDAG workflows={workflows} />)
