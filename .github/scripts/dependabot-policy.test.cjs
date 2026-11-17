const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const source = fs.readFileSync(path.join(__dirname, '../dependabot.yml'), 'utf8')
// Guard the repository's deliberately small, explicit policy. GitHub also validates
// the full YAML schema; this contract does not implement a general YAML parser.
function violations(text) {
  const blocks = text.split(/(?=^  - package-ecosystem:)/m).filter(block => block.startsWith('  - package-ecosystem:'))
  const expected = new Map([['npm:/SYSTEM/dashboard', 2], ['npm:/SYSTEM/cognee-bundle', 1], ['github-actions:/', 1], ['docker:/', 1]])
  const errors = []
  let total = 0
  if (blocks.length !== expected.size) errors.push('ecosystems')
  for (const block of blocks) {
    const field = (name, indent) => {
      const matches = [...block.matchAll(new RegExp(`^${' '.repeat(indent)}${name}: *([^\\n#]+)`, 'gm'))]
      return matches.length === 1 ? matches[0][1].trim().replace(/^"|"$/g, '') : undefined
    }
    const ecosystem = field('package-ecosystem', 4) // list key has a different indentation
      || block.match(/^  - package-ecosystem: "([^"]+)"/)?.[1]
    const key = `${ecosystem}:${field('directory', 4)}`
    const limit = Number(field('open-pull-requests-limit', 4))
    if (!expected.has(key) || limit !== expected.get(key)) errors.push('limit')
    expected.delete(key)
    total += limit
    if (field('interval', 6) !== 'monthly') errors.push('schedule')
    if (Number(field('default-days', 6)) !== 14) errors.push('cooldown')
    if (ecosystem === 'npm' && Number(field('semver-major-days', 6)) !== 90) errors.push('major cooldown')
    if (/^    target-branch:/m.test(block)) errors.push('security branch scope')
    // Preserve the existing Node LTS-major exception; add no new ignores that
    // could suppress a security remediation proposal.
    if (/^    ignore:/m.test(block)) {
      const names = [...block.matchAll(/^      - dependency-name: "([^"]+)"/gm)].map(match => match[1])
      if (ecosystem !== 'docker' || JSON.stringify(names) !== '["node"]'
        || !/^          - "version-update:semver-major"$/m.test(block)
        || /^        versions:/m.test(block)) errors.push('security ignore')
    }
  }
  if (expected.size || total !== 5) errors.push('total limit')
  return errors
}

test('monthly policy caps routine proposals at five without disabling any ecosystem', () => {
  assert.deepEqual(violations(source), [])
})
test('weekly cadence cannot silently return', () => {
  assert(violations(source.replace('interval: "monthly"', 'interval: "weekly"')).includes('schedule'))
})
test('higher limits and disabled version maintenance are rejected', () => {
  for (const limit of [0, 5]) assert(violations(source.replace('open-pull-requests-limit: 2', `open-pull-requests-limit: ${limit}`)).includes('limit'))
})
test('routine and major release settling periods stay explicit', () => {
  assert(violations(source.replace('default-days: 14', 'default-days: 7')).includes('cooldown'))
  assert(violations(source.replace('semver-major-days: 90', 'semver-major-days: 7')).includes('major cooldown'))
})
test('new ignore rules cannot silently suppress security updates', () => {
  const changed = source.replace('open-pull-requests-limit: 2', 'open-pull-requests-limit: 2\n    ignore:\n      - dependency-name: "*"')
  assert(violations(changed).includes('security ignore'))
})
test('moving updates off the default branch needs a deliberate security review', () => {
  assert(violations(source.replace('open-pull-requests-limit: 2', 'open-pull-requests-limit: 2\n    target-branch: staging')).includes('security branch scope'))
})
