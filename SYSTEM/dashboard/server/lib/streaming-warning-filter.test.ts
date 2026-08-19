/**
 * The streaming warning filter.
 *
 * Origin: a boxed CLI warning arrived split across two stream chunks, neither half matched the
 * line-based filter, and the fragments rendered in chat as the agent's entire reply — the real
 * answer had been stripped from the final text, so the client fell back to what it had streamed.
 *
 * Several lanes below exist because a first version of this fix introduced NEW defects: it deleted
 * newlines at chunk boundaries, leaked every non-boxed warning, and never released its final held
 * line. Those lanes assert the absence of each.
 */
import assert from 'assert'
import { createStreamingWarningFilter, stripBenignChatRuntimeWarnings } from './chat-normalization'

const GREEN = '\x1b[32m', RED = '\x1b[31m', RESET = '\x1b[0m'
let passed = 0, failed = 0
function test(name: string, fn: () => void) {
  try { fn(); console.log(`${GREEN}✓${RESET} ${name}`); passed++ }
  catch (err: any) { console.log(`${RED}✗${RESET} ${name}`); console.log(`  ${err.message}`); failed++ }
}

/** The exact line observed in the live deployment. */
const BOXED = '│    ignored; remove it from plugins config)                              │'

test('a warning split across chunks is filtered', () => {
  const f = createStreamingWarningFilter()
  const half = Math.floor(BOXED.length / 2)
  const out = f.push(BOXED.slice(0, half)) + f.push(BOXED.slice(half) + '\n') + f.flush()
  assert.strictEqual(out.trim(), '', `expected nothing visible, got ${JSON.stringify(out)}`)
})

test('per-chunk filtering demonstrably leaks it — why this exists', () => {
  const half = Math.floor(BOXED.length / 2)
  const leaked = stripBenignChatRuntimeWarnings(BOXED.slice(0, half))
    + stripBenignChatRuntimeWarnings(BOXED.slice(half))
  assert.notStrictEqual(leaked.trim(), '',
    'per-chunk filtering should leak a split warning; if it no longer does, this lane is obsolete')
})

test('newlines survive chunk boundaries exactly', () => {
  // Regression: an earlier version returned "First lineSecond", silently joining a paragraph to
  // whatever followed it — which corrupts a markdown table that comes after prose.
  const f = createStreamingWarningFilter()
  const out = f.push('First line') + f.push('\nSecond') + f.flush()
  assert.strictEqual(out, 'First line\nSecond', `newline lost: ${JSON.stringify(out)}`)
})

test('a run of blank lines is preserved, not collapsed', () => {
  const f = createStreamingWarningFilter()
  const out = f.push('a\n\n\nb\n') + f.flush()
  assert.strictEqual(out, 'a\n\n\nb\n', `blank lines altered: ${JSON.stringify(out)}`)
})

test('non-boxed warnings are filtered too, even when split', () => {
  // Regression: buffering only box-drawing prefixes let every other warning form through the
  // moment it was split, which is the original bug in a narrower disguise.
  const f = createStreamingWarningFilter()
  const w = 'plugin not found: ghost (stale config entry ignored; remove it from plugins config)'
  const out = f.push(w.slice(0, 20)) + f.push(w.slice(20) + '\n') + f.flush()
  assert.strictEqual(out.trim(), '', `non-boxed warning leaked: ${JSON.stringify(out)}`)
})

test('flush releases a final line the runtime never terminated', () => {
  // Regression: without a flush call the last unterminated line was dropped from the stream AND
  // from fullOutput, which drives persisted-answer recovery — so the loss was permanent.
  const f = createStreamingWarningFilter()
  assert.strictEqual(f.push('Intro\n| final table row |'), 'Intro\n')
  assert.strictEqual(f.flush(), '| final table row |', 'the held final line must be released')
})

test('a markdown table streams intact once its lines complete', () => {
  const f = createStreamingWarningFilter()
  const table = '| a | b |\n|---|---|\n| 1 | 2 |\n'
  const out = f.push(table.slice(0, 12)) + f.push(table.slice(12)) + f.flush()
  assert.strictEqual(out, table, `table corrupted: ${JSON.stringify(out)}`)
})

test('real output around a warning keeps only the real output, in order', () => {
  const f = createStreamingWarningFilter()
  const out = f.push(`Working on it.\n${BOXED}\nStill working.\n`) + f.flush()
  assert.strictEqual(out, 'Working on it.\nStill working.\n', `got ${JSON.stringify(out)}`)
})

test('an absurdly long unterminated line is released rather than buffered forever', () => {
  // Holding it would re-scan a growing string on every chunk (quadratic) for no benefit: no benign
  // warning is anywhere near this length.
  const f = createStreamingWarningFilter()
  let out = ''
  for (let i = 0; i < 10; i++) out += f.push('x'.repeat(1024))
  assert.ok(out.length > 0, 'a >8KB unterminated line must be released, not held indefinitely')
})

test('nothing is emitted twice across push and flush', () => {
  const f = createStreamingWarningFilter()
  const out = f.push('alpha\nbeta') + f.flush() + f.flush()
  assert.strictEqual(out, 'alpha\nbeta', `duplicated or lost content: ${JSON.stringify(out)}`)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
