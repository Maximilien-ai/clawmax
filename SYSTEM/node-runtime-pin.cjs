// Keep application CI and every Docker stage on the reviewed Node 24 LTS pin.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function verifyNodeRuntimePins(dockerfile, workflows) {
 const platforms = { 'openclaw-builder': '$BUILDPLATFORM', builder: '$BUILDPLATFORM', runtime: '$TARGETPLATFORM' }
 const from = dockerfile.split('\n').filter(line => /^\s*FROM\b/i.test(line))
 assert.equal(from.length, 3, 'Expected exactly the three reviewed Docker stages')
 const stages = new Map()
 for (const line of from) {
  const match = line.match(/^\s*FROM\s+--platform=(\$\w+)\s+node:(\d+\.\d+\.\d+)-bookworm-slim\s+AS\s+(\S+)\s*$/i)
  assert(match, 'Docker stages must use an explicit Node version and reviewed platform')
  const [, platform, version, stage] = match
  assert.equal(platform, platforms[stage], `Unexpected platform or stage: ${stage}`)
  assert(!stages.has(stage), `Duplicate Docker stage: ${stage}`)
  assert(version.startsWith('24.'), 'A different Node major requires a separate compatibility review')
  stages.set(stage, version)
 }
 assert.equal(stages.size, 3)
 const version = stages.get('runtime')
 assert([...stages.values()].every(value => value === version), 'All Docker Node versions must match')
 assert(Object.hasOwn(workflows, 'ci.yml'), 'Application CI must be included in Node pin validation')
 let ciSteps = 0
 for (const [name, source] of Object.entries(workflows)) {
  const setupSteps = [...source.matchAll(/^\s*(?:-\s+)?uses:\s*actions\/setup-node@\S+/gm)].length
  const values = [...source.matchAll(/^\s*node-version:\s*(.+)$/gm)].map(match => {
   let value = match[1].replace(/\s+#.*$/, '').trim()
   if (/^['"]/.test(value)) {
    assert.equal(value.at(-1), value[0], `${name}: invalid quoted Node pin`)
    value = value.slice(1, -1)
   }
   assert(/^\d+\.\d+\.\d+$/.test(value), `${name}: CI requires an explicit full Node version`)
   return value
  })
  assert.equal(setupSteps, values.length, `${name}: each setup-node step needs an explicit pin`)
  if (name === 'ci.yml') assert(setupSteps > 0, 'Application CI must select Node explicitly')
  assert(values.every(value => value === version), `${name}: CI Node must match Docker ${version}`)
  ciSteps += setupSteps
 }
 return { version, dockerStages: stages.size, ciSteps }
}

function repositoryPins(root = path.resolve(__dirname, '..')) {
 const directory = path.join(root, '.github/workflows')
 const workflows = Object.fromEntries(fs.readdirSync(directory).filter(name => /\.ya?ml$/.test(name)).map(name => [name, fs.readFileSync(path.join(directory, name), 'utf8')]).filter(([name, source]) => name === 'ci.yml' || /uses:\s*actions\/setup-node@/.test(source)))
 return verifyNodeRuntimePins(fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8'), workflows)
}
module.exports = { verifyNodeRuntimePins, repositoryPins }
if (require.main === module) {
 try { console.log('Node runtime pins aligned: ' + JSON.stringify(repositoryPins())) }
 catch (error) { console.error(error.message); process.exitCode = 1 }
}
