const assert = require('node:assert/strict')
const { test } = require('node:test')
const { verifyNodeRuntimePins, repositoryPins } = require('./node-runtime-pin.cjs')
const docker = ['FROM --platform=$BUILDPLATFORM node:24.22.0-bookworm-slim AS openclaw-builder', 'FROM --platform=$BUILDPLATFORM node:24.22.0-bookworm-slim AS builder', 'FROM --platform=$TARGETPLATFORM node:24.22.0-bookworm-slim AS runtime'].join('\n')
const step = version => `      - uses: actions/setup-node@v4\n        with:\n          node-version: ${version}\n`
const workflows = { 'ci.yml': step('24.22.0'), 'image-action-contracts.yml': step('"24.22.0"') + step("'24.22.0'") }

test('checks all current repository Docker stages and CI Node steps', () => {
 assert.deepEqual(repositoryPins(), { version: '24.22.0', dockerStages: 3, ciSteps: 3 })
})
test('aligned pins accept YAML quoting and multiple CI jobs', () => {
 assert.deepEqual(verifyNodeRuntimePins(docker, workflows), { version: '24.22.0', dockerStages: 3, ciSteps: 3 })
})
test('rejects a CI pin left behind during a Docker update', () => {
 assert.throws(() => verifyNodeRuntimePins(docker, { ...workflows, 'ci.yml': step('24.19.0') }), /CI Node must match/)
})
test('rejects a builder left on an older runtime', () => {
 assert.throws(() => verifyNodeRuntimePins(docker.replace('24.22.0', '24.19.0'), workflows), /Docker Node versions must match/)
})
test('rejects a runtime built for the build platform instead of the target', () => {
 assert.throws(() => verifyNodeRuntimePins(docker.replace('$TARGETPLATFORM', '$BUILDPLATFORM'), workflows), /Unexpected platform/)
})
test('rejects missing or duplicate reviewed stages', () => {
 assert.throws(() => verifyNodeRuntimePins(docker.split('\n').slice(1).join('\n'), workflows), /three reviewed/)
 assert.throws(() => verifyNodeRuntimePins(docker.replace('AS runtime', 'AS builder'), workflows), /Unexpected platform|Duplicate/)
})
test('rejects floating tags and unreviewed Node majors', () => {
 assert.throws(() => verifyNodeRuntimePins(docker.replaceAll('24.22.0', '24'), workflows), /explicit Node version/)
 assert.throws(() => verifyNodeRuntimePins(docker.replaceAll('24.22.0', '26.1.0'), workflows), /different Node major/)
})
test('rejects CI version ranges and missing pins', () => {
 for (const version of ['24.x', '${{ inputs.node_version }}']) assert.throws(() => verifyNodeRuntimePins(docker, { 'ci.yml': step(version) }), /explicit full/)
 assert.throws(() => verifyNodeRuntimePins(docker, { 'ci.yml': 'steps:\n - uses: actions/setup-node@v4\n' }), /each setup-node/)
})
test('cannot omit application CI or let it use an implicit runner runtime', () => {
 assert.throws(() => verifyNodeRuntimePins(docker, {}), /Application CI must be included/)
 assert.throws(() => verifyNodeRuntimePins(docker, { 'ci.yml': 'steps: []' }), /select Node explicitly/)
})
test('rejects a newly added workflow whose pin differs', () => {
 assert.throws(() => verifyNodeRuntimePins(docker, { ...workflows, 'another.yml': step('24.19.0') }), /another.yml: CI Node must match/)
})
test('allows future Node 24 updates when all reviewed stages and CI move together', () => {
 const next = Object.fromEntries(Object.entries(workflows).map(([name, source]) => [name, source.replaceAll('24.22.0', '24.23.0')]))
 assert.equal(verifyNodeRuntimePins(docker.replaceAll('24.22.0', '24.23.0'), next).version, '24.23.0')
})
