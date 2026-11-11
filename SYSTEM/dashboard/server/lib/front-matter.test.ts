/**
 * Front matter in workflow, skill and template files must never run as code: gray-matter evaluates
 * `---js` / `---javascript` front matter with eval, and these files come from imports and registries.
 *
 * Run with: npx ts-node --transpileOnly server/lib/front-matter.test.ts
 */

import assert from 'node:assert/strict'
import { parseFrontMatter } from './front-matter'
import { parseWorkflowMd } from './workflows'

const marker = '__clawmaxFrontMatterRan'
const payload = `{ ran: (globalThis.${marker} = true) }`

// Every spelling gray-matter maps to its JavaScript engine.
for (const opener of ['---js', '---javascript', '---JS', '---JavaScript']) {
  assert.throws(() => parseFrontMatter(`${opener}\n${payload}\n---\nBody`), /JavaScript front matter is not supported/, opener)
  assert.equal((globalThis as any)[marker], undefined, `${opener} front matter must not be evaluated`)
}

// YAML (the default) and JSON front matter still parse.
assert.deepEqual(parseFrontMatter('---\nname: Daily brief\n---\nBody').data, { name: 'Daily brief' })
assert.deepEqual(parseFrontMatter('---json\n{ "name": "Daily brief" }\n---\nBody').data, { name: 'Daily brief' })
assert.equal(parseFrontMatter('No front matter').content, 'No front matter')

// The workflow Markdown import refuses the file instead of running it.
assert.equal(parseWorkflowMd(`---js\n${payload}\n---\n# Steps`), null)
assert.equal((globalThis as any)[marker], undefined, 'An imported WORKFLOW.md must not run its front matter')

console.log('Front matter tests passed')
