import assert from 'assert'
import fs from 'fs'
import path from 'path'

const workflowSource = fs.readFileSync(path.join(__dirname, 'pages', 'Workflows.tsx'), 'utf8')
const appSource = fs.readFileSync(path.join(__dirname, 'App.tsx'), 'utf8')
assert(
  workflowSource.includes("showError('Already running. Stop the current run before starting another.')"),
  'Workflow triggers must explain why a concurrent run is refused',
)
assert(
  workflowSource.includes("disabled={startingWorkflowIds.has(selectedWorkflow.id) || runningWorkflows.has(selectedWorkflow.id) || selectedWorkflow.status === 'running'}"),
  'The detail trigger control must be disabled while a workflow is starting or running',
)
assert(workflowSource.includes("if (workflowStartGateRef.current.has(triggeringWorkflow.id)) return"), 'The custom-parameter Run handler must reject a second click synchronously')
assert(workflowSource.includes("disabled={startingWorkflowIds.has(triggeringWorkflow.id) || runningWorkflows.has(triggeringWorkflow.id) || triggeringWorkflow.status === 'running'}"), 'The custom-parameter Run button must visibly disable during submission')
assert(workflowSource.includes("setTriggeringWorkflow(null)"), 'The custom-parameter dialog must close after a successful start')
assert(
  workflowSource.includes("/cancel`, { method: 'POST' }"),
  'The workflow UI must call the execution cancellation endpoint',
)
assert(workflowSource.includes('Stop run'), 'Running execution details must expose a Stop control')
assert(
  workflowSource.includes('Steps already completed will not be rolled back'),
  'Cancellation confirmation must disclose partial side effects',
)
assert(workflowSource.includes('Pause Pipeline'), 'Workflow header must expose a pipeline pause control')
assert(workflowSource.includes('Resume Pipeline'), 'Paused workflow pipeline must expose a resume control')
assert(workflowSource.includes('min-w-0 w-full max-w-full flex-1 overflow-x-hidden'), 'Workflow page must remain constrained to the mobile viewport')
assert(appSource.includes('min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto'), 'Workflow route wrapper must not expose page-level horizontal scrolling')
assert(workflowSource.includes('<div className="max-w-full overflow-x-auto">'), 'Workflow DAG overflow must stay inside its own scroll container')
assert(
  workflowSource.includes('New manual runs, schedules, and DAG cascades are blocked. Active executions continue'),
  'Paused pipeline banner must explain both blocked starts and active-run behavior',
)

// The editor hands create and edit its run limit and handoff settings; both requests must send them.
const createBody = workflowSource.slice(workflowSource.indexOf('const handleCreateWorkflow'), workflowSource.indexOf('const handleEditWorkflow'))
const editBody = workflowSource.slice(workflowSource.indexOf('const handleEditWorkflow'), workflowSource.indexOf('const handleEditWorkflow') + 2500)
for (const [label, body] of [['create', createBody], ['edit', editBody]]) {
  assert(['maxRuns: data.maxRuns', 'outputDefinitions: data.outputDefinitions', 'inputRefs: data.inputRefs'].every((field) => body.includes(field)), `Workflow ${label} must save the run limit and handoff settings`)
}

console.log('WorkflowLifecycleSafety.test.ts: 16 assertions passed')
