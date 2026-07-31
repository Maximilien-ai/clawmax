import fs from 'fs'
import path from 'path'

const repoRoot = path.resolve(__dirname, '../../../..')
const publicRoot = path.join(repoRoot, 'PLUGINS', 'public')
const testRoot = path.join(repoRoot, 'PLUGINS', 'test')
const publicDirectories = fs.readdirSync(publicRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
const publicManifests = publicDirectories.map((directory) => JSON.parse(
  fs.readFileSync(path.join(publicRoot, directory, 'clawmax-plugin.json'), 'utf8'),
))
const fixtureManifests = fs.readdirSync(testRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => JSON.parse(fs.readFileSync(path.join(testRoot, entry.name, 'clawmax-plugin.json'), 'utf8')))
const imageWorkflow = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'test-container-image.yml'), 'utf8')
const dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8')

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

assert(JSON.stringify(publicDirectories) === JSON.stringify(['clawmax-lifecycle', 'clawmax-review']), 'Public plugin source must contain only Lifecycle and Review')
assert(publicManifests.every((manifest) => manifest.visibility === 'public'), 'Every public plugin manifest must declare public visibility')
assert(publicManifests.every((manifest) => manifest.enabledByDefault === true), 'Public product plugins must load without test-only environment overrides')
assert(publicManifests.map((manifest) => manifest.slug).sort().join(',') === 'clawmax-lifecycle,plugin-review-notes', 'Public plugin identities must remain stable')
assert(!publicManifests.some((manifest) => ['guardrail', 'eval', 'optimization-plan'].includes(manifest.objectKind)), 'Enterprise plugin object implementations must not live in the public plugin catalog')
assert(fixtureManifests.every((manifest) => manifest.visibility === 'private' && manifest.enabledByDefault === false), 'Synthetic fixtures must remain disabled and non-product')
assert(fixtureManifests.every((manifest) => manifest.slug.startsWith('plugin-') && !manifest.slug.includes('-lab-')), 'Synthetic fixture names must use plugin-* without lab branding')
assert(imageWorkflow.includes('CLAWMAX_ENABLED_PLUGINS=clawmax-lifecycle,plugin-review-notes'), 'Public test images must enable only public product plugins')
assert(!imageWorkflow.includes('CLAWMAX_ENABLED_PLUGINS=plugin-evals') && !imageWorkflow.includes('CLAWMAX_ENABLED_PLUGINS=plugin-guardrails'), 'Public image workflows must not enable enterprise fixtures')
assert(dockerfile.includes('ARG CLAWMAX_ENABLED_PLUGINS='), 'Public Docker builds must keep plugin selection externally configurable')

console.log('PluginPublicBoundary.test.ts: 10 tests passed')
