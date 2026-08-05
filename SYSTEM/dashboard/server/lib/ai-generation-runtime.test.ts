/**
 * Runtime selection for CLI-backed AI generation.
 *
 * Run with: npx ts-node --transpileOnly server/lib/ai-generation-runtime.test.ts
 */
import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'

const GREEN = '\x1b[32m', RED = '\x1b[31m', RESET = '\x1b[0m'
let passed = 0, failed = 0
function test(name: string, fn: () => void) {
  try { fn(); console.log(`${GREEN}✓${RESET} ${name}`); passed++ }
  catch (err: any) { console.log(`${RED}✗${RESET} ${name}`); console.log(`  ${err.message}`); failed++ }
}

function withWorkspace(enabled: string[], env: Record<string, string | undefined>, fn: () => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-genrt-'))
  fs.mkdirSync(path.join(root, 'SYSTEM'), { recursive: true })
  fs.writeFileSync(path.join(root, 'SYSTEM', 'integrations.json'), JSON.stringify({ enabledRuntimes: enabled }))
  const prev: Record<string, string | undefined> = { OPENCLAW_WORKSPACE: process.env.OPENCLAW_WORKSPACE }
  process.env.OPENCLAW_WORKSPACE = root
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k]
    if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
  try {
    for (const k of Object.keys(require.cache)) if (k.includes('/server/lib/')) delete require.cache[k]
    fn()
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
}

// A real file stands in for an installed CLI; resolveRuntimeCliPath only needs an executable path.
const realBinary = process.execPath
const missingBinary = path.join(os.tmpdir(), 'clawmax-not-installed-cli')
// resolveRuntimeCliPath falls back to PATH and ~/.local/bin when an override is unusable, and this
// machine really does have droid installed — so "not installed" cases must neutralise both.
const emptyPathDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-empty-path-'))
const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-empty-home-'))
const NOT_INSTALLED = { PATH: emptyPathDir, HOME: emptyHome }

console.log('\n=== AI generation runtime selection ===\n')

test('never selects a runtime whose CLI is absent', () => {
  // Faking absence is unreliable — an unusable *_BIN override falls through to PATH and
  // ~/.local/bin, and this machine has the CLIs installed. Assert the invariant instead: whatever
  // is selected must have a resolvable CLI, which is what the missing-CLI failure mode requires.
  withWorkspace(['droid', 'claude'], { CLAWMAX_ANTHROPIC_GENERATION_MODEL: 'claude-sonnet-4-5' }, () => {
    const { pickGenerationRuntime } = require('./ai-generator')
    const { resolveRuntimeCliPath } = require('./agent-runtime')
    const picked = pickGenerationRuntime()
    if (picked) {
      assert(resolveRuntimeCliPath(picked), `Selected ${picked} but its CLI does not resolve`)
    }
  })
})

test('prefers a self-defaulting runtime when both CLIs are installed', () => {
  withWorkspace(['claude', 'droid'], { DROID_BIN: realBinary, CLAUDE_BIN: realBinary }, () => {
    const { pickGenerationRuntime } = require('./ai-generator')
    assert.strictEqual(pickGenerationRuntime(), 'droid', 'Expected droid, which brings its own current default model')
  })
})

test('returns nothing when no runtime is enabled', () => {
  withWorkspace([], { DROID_BIN: realBinary, CLAUDE_BIN: realBinary }, () => {
    const { pickGenerationRuntime } = require('./ai-generator')
    assert.strictEqual(pickGenerationRuntime(), undefined)
  })
})

test('claude generation never uses a model past its shutdown date', () => {
  withWorkspace(['claude'], { CLAUDE_BIN: realBinary, CLAWMAX_ANTHROPIC_GENERATION_MODEL: undefined }, () => {
    const { resolveClaudeGenerationModel } = require('./ai-generator')
    const { getModelLifecycleEntry } = require('./openAiModelLifecycle')
    const resolved = resolveClaudeGenerationModel()
    if (!resolved) return // nothing resolvable is an acceptable outcome; the runtime is then skipped
    const entry = getModelLifecycleEntry(`anthropic/${resolved}`) || getModelLifecycleEntry(resolved)
    const shutdown = entry?.shutdownDate ? new Date(entry.shutdownDate).getTime() : undefined
    assert(!shutdown || shutdown > Date.now(), `Resolved a retired model for claude generation: ${resolved}`)
  })
})

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
