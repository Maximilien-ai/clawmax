#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const repository = 'Maximilien-ai/clawmax'

/** Read-only preflight must complete before the single workflow mutation. */
export function dispatchTestImage(tag, expectedSha, gh, { dryRun = false } = {}) {
  if (!/^v\d+\.\d+\.\d+-test-[a-z0-9][a-z0-9._-]*$/.test(tag || '')) {
    throw new Error('Use a full candidate tag such as v2.0.0-test-rc99, never a branch or raw SHA.')
  }
  if (!/^[a-f0-9]{40}$/.test(expectedSha || '')) throw new Error('Supply the full expected 40-character source SHA.')
  const ref = `refs/tags/${tag}`
  const read = endpoint => JSON.parse(gh(['api', `repos/${repository}/${endpoint}`]))
  let object = read(`git/ref/tags/${tag}`).object
  // Annotated tags are supported, but only a bounded, verified commit target is accepted.
  for (let i = 0; object?.type === 'tag' && i < 5; i++) object = read(`git/tags/${object.sha}`).object
  if (object?.type !== 'commit' || object.sha !== expectedSha) throw new Error('Candidate tag does not resolve to the expected source commit; no dispatch performed.')
  const suffix = tag.split('-test-')[1]
  const payload = { ref, inputs: { source_ref: ref, test_tag: suffix } }
  if (!dryRun) gh(['api', `repos/${repository}/actions/workflows/test-container-image.yml/dispatches`, '--input', '-'], JSON.stringify(payload))
  return { repository, sourceSha: expectedSha, payload, dispatched: !dryRun }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2)
    if (args.length < 2 || args.length > 3 || (args[2] && args[2] !== '--dry-run')) throw new Error('Usage: node SYSTEM/dispatch-test-image.mjs <candidate-tag> <expected-full-SHA> [--dry-run]')
    const gh = (args, input) => execFileSync('gh', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 })
    console.log(JSON.stringify(dispatchTestImage(args[0], args[1], gh, { dryRun: args[2] === '--dry-run' }), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
