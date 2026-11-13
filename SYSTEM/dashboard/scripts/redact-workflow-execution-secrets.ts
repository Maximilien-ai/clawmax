/**
 * Removes run secrets (browser vault and BYOK values) that earlier versions stored in workflow run
 * records, WORKFLOWS/executions/<workflow>/<run>.json and archived runs. Prints file paths and
 * input names, never values. Runs are kept; only their `inputs` change. Run it after upgrading,
 * while no workflow is running. Kept inputs stay in the file (the Dashboard no longer shows inputs
 * of these older runs); review their names, since a vault value saved under a workflow field's name
 * cannot be told apart from that field.
 *
 * Dry run:  npx ts-node --transpileOnly scripts/redact-workflow-execution-secrets.ts --workspace <path>
 * Rewrite:  npx ts-node --transpileOnly scripts/redact-workflow-execution-secrets.ts --workspace <path> --apply
 */
import fs from 'fs'
import path from 'path'
import { redactStoredExecutionSecrets } from '../server/lib/workflows'

const args = process.argv.slice(2)
const workspaceIndex = args.indexOf('--workspace')
const workspace = workspaceIndex >= 0 ? args[workspaceIndex + 1] : undefined
if (!workspace || !fs.existsSync(path.join(workspace, 'WORKFLOWS'))) {
  console.error('Usage: redact-workflow-execution-secrets.ts --workspace <workspace path containing WORKFLOWS/> [--apply]')
  process.exit(2)
}
const apply = args.includes('--apply')

const result = redactStoredExecutionSecrets(path.resolve(workspace), { apply })
for (const entry of result.redacted) {
  console.log(`${apply ? 'redacted' : 'would redact'} ${entry.file}: removed [${entry.removedInputs.join(', ')}] kept [${entry.keptInputs.join(', ')}]`)
}
for (const file of result.unreadable) console.log(`skipped (not valid JSON; inspect by hand) ${file}`)
console.log(`${result.redacted.length} run record(s) ${apply ? 'redacted' : 'to redact'}${apply || result.redacted.length === 0 ? '' : '; rerun with --apply to rewrite them'}`)
