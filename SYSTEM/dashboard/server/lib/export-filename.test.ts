import assert from 'assert'
import { buildNamedExportFilename, sanitizeExportName } from './export-filename'

assert.strictEqual(sanitizeExportName('Customer Success Team'), 'customer-success-team')
assert.strictEqual(sanitizeExportName('../../'), 'export')
assert.strictEqual(buildNamedExportFilename('Launch Planner', 'template', 'md'), 'launch-planner.template.md')
assert.strictEqual(buildNamedExportFilename('CEO', 'agent', 'zip'), 'ceo.agent.zip')

console.log('export-filename.test.ts: 4 tests passed')
