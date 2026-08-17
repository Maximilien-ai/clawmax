import assert from 'assert'
import fs from 'fs'
import path from 'path'

const workflowSource = fs.readFileSync(path.join(__dirname, 'pages', 'Workflows.tsx'), 'utf8')
assert(
  workflowSource.includes("showError('Already running. Stop the current run before starting another.')"),
  'Workflow triggers must explain why a concurrent run is refused',
)
assert(
  workflowSource.includes("disabled={runningWorkflows.has(selectedWorkflow.id) || selectedWorkflow.status === 'running'}"),
  'The detail trigger control must be disabled while a workflow is running',
)
assert(
  workflowSource.includes("/cancel`, { method: 'POST' }"),
  'The workflow UI must call the execution cancellation endpoint',
)
assert(workflowSource.includes('Stop run'), 'Running execution details must expose a Stop control')
assert(
  workflowSource.includes('Steps already completed will not be rolled back'),
  'Cancellation confirmation must disclose partial side effects',
)

console.log('WorkflowLifecycleSafety.test.ts: 5 assertions passed')
