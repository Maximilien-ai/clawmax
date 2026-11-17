import assert from 'node:assert/strict'
import fs from 'node:fs'
const dag = fs.readFileSync('client/src/components/WorkflowDAG.tsx', 'utf8')
assert(!dag.includes('TruncatedText'), 'DAG labels must not truncate')
assert(dag.includes('whitespace-normal break-words'), 'Long labels must wrap')
assert(dag.indexOf('aria-label="Workflow actions"') > dag.indexOf('getWorkflowDisplayName(wf.name, group.title)'), 'Actions follow the label row')
const page = fs.readFileSync('client/src/pages/Workflows.tsx', 'utf8')
const empty = page.slice(page.indexOf('No workflows in this workspace yet'))
assert(empty.indexOf('Create Workflow with AI') < empty.indexOf('label="Create Workflow"'), 'AI creation comes first')
assert(empty.slice(0, empty.indexOf('Create Workflow with AI')).includes('disabled={!aiEnabled}'), 'Provider gate remains')
console.log('Workflow acceptance layout contracts passed')

const buttons = empty.slice(0, empty.indexOf('Import Workflow')).match(/<button[\s\S]*?<\/button>/g) || []
assert.equal(buttons.length, 2)
assert(buttons[0].includes('bg-purple-600'), 'AI creation retains primary emphasis')
assert(!buttons[1].includes('purple') && buttons[1].includes('dark:bg-gray-800'), 'Manual creation uses neutral light/dark styling')
