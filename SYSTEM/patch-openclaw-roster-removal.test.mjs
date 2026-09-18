import assert from 'node:assert/strict'
import vm from 'node:vm'
import { patchRosterRemoval } from './patch-openclaw-roster-removal.mjs'

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
assert.equal(patchRosterRemoval(patched), patched)
assert.throws(() => patchRosterRemoval('unknown source'), /Unsupported/)
assert.throws(() => patchRosterRemoval(fixture.replace('      writeOptions,', '      writeOptions: changed,')), /Unsupported/)
for (const scenario of [
  { entries: { first: null, second: null, keep: { name: 'changed' }, absent: null }, expected: ['first', 'second'] },
  { entries: { first: { name: 'updated' } }, expected: [] },
  { entries: {}, expected: [] },
  { entries: { first: null }, hashless: true, expected: [] },
]) {
  const context = vm.createContext({
    snapshot: {}, writeOptions: { expectedHash: 'revision', allowedAgentRosterRemovals: ['must-not-leak'] },
    writeConfig: {}, hashlessPatch: scenario.hashless || false,
    normalizedPatch: { agents: { entries: scenario.entries } },
    sourceConfig: { agents: { entries: { first: {}, second: {}, keep: {} } } },
    commitGatewayConfigWriteOrRespond: async value => value,
  })
  vm.runInContext(patched, context)
  const result = await context.handlers['config.patch']()
  assert.deepEqual(Array.from(result.writeOptions.allowedAgentRosterRemovals), scenario.expected)
  assert.equal(result.writeOptions.expectedHash, 'revision')
  assert.deepEqual((await context.handlers['config.apply']()).writeOptions.allowedAgentRosterRemovals, ['must-not-leak'])
}
console.log('OpenClaw roster-removal patch tests passed')
