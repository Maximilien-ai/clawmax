import assert from 'node:assert/strict'
import vm from 'node:vm'
import { patchRosterRemoval, patchBundledRosterRemoval } from './patch-openclaw-roster-removal.mjs'

const fixture = `const configHandlers = {
  "config.patch": async () => {
    const writeResult = await commitGatewayConfigWriteOrRespond({
      snapshot,
      writeOptions,
      nextConfig: writeConfig,
    });
    return writeResult;
  },
  "config.apply": async () => ({ writeOptions }),
}; globalThis.handlers = configHandlers;`
const patched = patchRosterRemoval(fixture)
const bundledFixture = fixture.replace(/^      /gm, '\t\t\t').replace(/^    /gm, '\t\t').replace(/^  /gm, '\t')
const bundled = patchBundledRosterRemoval(bundledFixture)
assert.equal(patchBundledRosterRemoval(bundled), bundled)
assert.throws(() => patchBundledRosterRemoval('unknown bundle'), /Unsupported/)
assert.throws(() => patchBundledRosterRemoval(bundledFixture.replace('\t\t\twriteOptions,', '\t\t\twriteOptions: changed,')), /Unsupported/)
assert.equal(patchRosterRemoval(patched), patched)
assert.throws(() => patchRosterRemoval('unknown source'), /Unsupported/)
assert.throws(() => patchRosterRemoval(fixture.replace('      writeOptions,', '      writeOptions: changed,')), /Unsupported/)
for (const scenario of [
  { entries: { first: null, second: null, keep: { name: 'changed' }, absent: null }, expected: ['first', 'second'] },
  { entries: { first: { name: 'updated' } }, expected: [] },
  { entries: {}, expected: [] },
  { entries: { first: null }, hashless: true, expected: [] },
]) {
  for (const candidate of [patched, bundled]) {
    const context = vm.createContext({
      snapshot: {}, writeOptions: { expectedHash: 'revision', allowedAgentRosterRemovals: ['must-not-leak'] },
      writeConfig: {}, hashlessPatch: scenario.hashless || false,
      normalizedPatch: { agents: { entries: scenario.entries } },
      sourceConfig: { agents: { entries: { first: {}, second: {}, keep: {} } } },
      commitGatewayConfigWriteOrRespond: async value => value,
    })
    vm.runInContext(candidate, context)
    const result = await context.handlers['config.patch']()
    assert.deepEqual(Array.from(result.writeOptions.allowedAgentRosterRemovals), scenario.expected)
    assert.equal(result.writeOptions.expectedHash, 'revision')
    assert.deepEqual((await context.handlers['config.apply']()).writeOptions.allowedAgentRosterRemovals, ['must-not-leak'])
  }
}
console.log('OpenClaw roster-removal patch tests passed')
