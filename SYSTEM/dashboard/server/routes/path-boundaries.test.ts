/**
 * Request-controlled names must stay one path segment: route ids and slugs (Express decodes `%2F` inside a
 * parameter), output keys from a request body, and names inside imported content. Each case points at a
 * real file or folder outside the area the route owns and checks it is neither read, written, moved nor
 * deleted, and that a well-formed name still works.
 *
 * Run with: npx ts-node --transpileOnly server/routes/path-boundaries.test.ts
 */
import assert from 'assert'
import express from 'express'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-path-boundaries-'))
const workspace = path.join(root, 'workspace')
const home = path.join(root, 'home')
const outside = path.join(root, 'outside')
for (const dir of [path.join(workspace, 'AGENTS', 'real-agent'), path.join(workspace, 'SKILLS', 'custom', 'kept-skill'), path.join(workspace, 'SYSTEM'), path.join(workspace, 'ORG'), home, outside]) {
  fs.mkdirSync(dir, { recursive: true })
}
fs.writeFileSync(path.join(workspace, 'AGENTS', 'real-agent', 'IDENTITY.md'), '# Identity\n\n- **Name:** Real Agent\n')
fs.writeFileSync(path.join(workspace, 'SKILLS', 'custom', 'kept-skill', 'SKILL.md'), '---\nname: kept-skill\ndescription: Kept\n---\nBody\n')
fs.writeFileSync(path.join(outside, 'IDENTITY.md'), '# Not an agent of this workspace\n')
fs.writeFileSync(path.join(outside, 'SKILL.md'), '---\nname: outside-skill\ndescription: Outside\n---\nSecret body\n')
fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret')

// CLAWMAX_TEST_WORKSPACE wins over SYSTEM/dashboard/.env, so nothing here can reach a real workspace.
const originalEnv = { ...process.env }
process.env.CLAWMAX_TEST_WORKSPACE = workspace
process.env.OPENCLAW_WORKSPACE = workspace
process.env.HOME = home
process.env.OPENCLAW_GATEWAY_PORT = '9'

let passed = 0
let failed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`✓ ${name}`)
  } catch (error: any) {
    failed++
    console.error(`✗ ${name}\n  ${error?.message || error}`)
  }
}

// http.request keeps the path exactly as written; fetch would collapse `%2E` segments before sending.
function request(port: number, method: string, rawPath: string, body?: unknown): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const req = http.request({ host: '127.0.0.1', port, method, path: rawPath, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} }, (res) => {
      let text = ''
      res.on('data', (chunk) => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode || 0, text }))
    })
    req.on('error', reject)
    req.end(payload)
  })
}

const escape = (from: string) => encodeURIComponent(path.relative(from, outside))

async function run() {
  const app = express()
  app.use(express.json())
  app.use('/api/agents', require('./agents').default)
  app.use('/api/templates', require('./templates').default)
  app.use('/api/skills', require('./skills').default)
  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as import('net').AddressInfo).port

  try {
    await test('agent routes refuse an id that leaves AGENTS/, and still serve a real agent', async () => {
      const id = escape(path.join(workspace, 'AGENTS'))
      for (const [method, route] of [['GET', `/api/agents/${id}/identity`], ['GET', `/api/agents/${id}/export`], ['POST', `/api/agents/${id}/export-openclaw`], ['DELETE', `/api/agents/${id}`], ['POST', `/api/agents/${id}/restart`]]) {
        const res = await request(port, method, route, method === 'POST' ? {} : undefined)
        assert.strictEqual(res.status, 400, `${method} ${route} must be refused, got ${res.status}`)
        assert(!res.text.includes('Not an agent of this workspace'), 'The outside IDENTITY.md must not be returned')
      }
      const real = await request(port, 'GET', '/api/agents/real-agent/identity')
      assert.strictEqual(real.status, 200, `A real agent's identity must still load, got ${real.status}`)
    })

    await test('template routes refuse a slug that leaves the templates folder, so DELETE cannot remove it', async () => {
      const slug = escape(path.join(workspace, 'TEMPLATES', 'agents'))
      for (const method of ['GET', 'DELETE', 'PUT']) {
        const res = await request(port, method, `/api/templates/agents/${slug}`, method === 'PUT' ? { name: 'Probe', type: 'agent' } : undefined)
        assert.strictEqual(res.status, 400, `${method} must refuse the slug, got ${res.status}`)
      }
      assert(fs.existsSync(path.join(outside, 'secret.txt')), 'The outside folder must survive DELETE')
      const missing = await request(port, 'GET', '/api/templates/agents/no-such-template')
      assert.strictEqual(missing.status, 404, `A well-formed slug must still reach the route, got ${missing.status}`)
      const longName = await request(port, 'GET', `/api/templates/agents/${'a-long-template-name'.repeat(8)}`)
      assert.strictEqual(longName.status, 404, `A long slug of an existing kind of name must still reach the route, got ${longName.status}`)
    })

    await test('skill routes refuse ids that leave the skills folder, including `.` for the folder itself', async () => {
      const id = escape(path.join(workspace, 'SKILLS', 'custom'))
      for (const target of [id, '%2E']) {
        const res = await request(port, 'DELETE', `/api/skills/${target}`)
        assert.strictEqual(res.status, 400, `DELETE /api/skills/${target} must be refused, got ${res.status}`)
      }
      assert(fs.existsSync(path.join(outside, 'secret.txt')), 'The outside folder must survive skill DELETE')
      assert(fs.existsSync(path.join(workspace, 'SKILLS', 'custom', 'kept-skill', 'SKILL.md')), 'The skills folder must survive DELETE of `.`')
      // The Skills page deletes by display name; a name that is not a folder name is found by lookup.
      fs.mkdirSync(path.join(workspace, 'SKILLS', 'custom', 'pdf-tools'))
      fs.writeFileSync(path.join(workspace, 'SKILLS', 'custom', 'pdf-tools', 'SKILL.md'), '---\nname: PDF Tools\ndescription: PDF\n---\nBody\n')
      const byName = await request(port, 'DELETE', `/api/skills/${encodeURIComponent('PDF Tools')}`)
      assert.strictEqual(byName.status, 200, `Deleting a skill by its display name must still work, got ${byName.status}: ${byName.text}`)
      assert(!fs.existsSync(path.join(workspace, 'SKILLS', 'custom', 'pdf-tools')), 'Expected the skill folder to be removed')
      const { REPO_ROOT } = require('../lib/paths')
      const content = await request(port, 'GET', `/api/skills/${escape(path.join(REPO_ROOT, 'SKILLS', 'custom'))}/content`)
      assert.strictEqual(content.status, 404, `Reading a SKILL.md outside the skills folders must fail, got ${content.status}`)
      assert(!content.text.includes('Secret body'), 'The outside SKILL.md must not be returned')
    })
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  await test('workflow output keys from a request are written only below WORKFLOWS/outputs/<workflow>', () => {
    const { persistWorkflowExecutionOutputArtifacts } = require('../lib/workflows')
    const escapingKey = path.relative(path.join(workspace, 'WORKFLOWS', 'outputs', 'wf-probe'), path.join(outside, 'planted'))
    const persisted = persistWorkflowExecutionOutputArtifacts('wf-probe', {
      [escapingKey]: { type: 'text', value: 'planted' },
      report: { type: 'markdown', value: '# Report' },
    }, workspace)
    assert(!fs.existsSync(path.join(outside, 'planted.txt')), 'An output key with ../ must not write outside the workflow folder')
    assert.strictEqual(persisted[escapingKey].artifactPath, undefined, 'The refused output keeps its value but gets no file')
    assert.strictEqual(persisted.report.artifactPath, 'WORKFLOWS/outputs/wf-probe/report.md')
    assert(fs.existsSync(path.join(workspace, 'WORKFLOWS', 'outputs', 'wf-probe', 'report.md')), 'A plain key is still written')
    const spaced = persistWorkflowExecutionOutputArtifacts('wf-probe', { 'Leadership Brief': { type: 'markdown', value: '# Brief' } }, workspace)
    assert.strictEqual(spaced['Leadership Brief'].artifactPath, 'WORKFLOWS/outputs/wf-probe/Leadership Brief.md', 'A key with a space is a plain name and keeps its file')
    persistWorkflowExecutionOutputArtifacts(path.relative(path.join(workspace, 'WORKFLOWS', 'outputs'), outside), { report: { type: 'text', value: 'planted' } }, workspace)
    assert(!fs.existsSync(path.join(outside, 'report.txt')), 'A workflow id with ../ must not choose the folder either')
    const { getExecution, listExecutions } = require('../lib/workflows')
    assert.strictEqual(getExecution('../outside', 'x'), null, 'An execution lookup must not leave the executions folder')
    assert.deepStrictEqual(listExecutions('../../outside'), [], 'Listing must not read another folder as executions')
  })

  await test('an imported skill keeps its files but not a symlink to a file of this machine', () => {
    const { importWorkspaceSkill } = require('../lib/skills')
    const source = path.join(root, 'linked-skill')
    fs.mkdirSync(source)
    fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: linked-skill\ndescription: Linked\n---\nBody\n')
    fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(source, 'leak.txt'))
    const result = importWorkspaceSkill(source)
    assert(result.success, `Import should succeed without the link: ${result.error}`)
    const imported = path.join(workspace, 'SKILLS', 'custom', 'linked-skill')
    assert(fs.existsSync(path.join(imported, 'SKILL.md')), 'Expected the skill file')
    assert(!fs.existsSync(path.join(imported, 'leak.txt')), 'The symlinked file must not be copied')
  })

  await test('a Tessl tile.json cannot name a skill folder outside the downloaded package', () => {
    const { resolveImportableRegistrySkillDirs } = require('../lib/skill-registry')
    const tile = path.join(root, 'tile-package')
    fs.mkdirSync(path.join(tile, 'skills', 'inner'), { recursive: true })
    fs.writeFileSync(path.join(tile, 'skills', 'inner', 'SKILL.md'), '---\nname: inner\n---\n')
    fs.symlinkSync(outside, path.join(tile, 'linked'))
    fs.writeFileSync(path.join(tile, 'tile.json'), JSON.stringify({ skills: {
      inner: { path: 'skills/inner/SKILL.md' },
      escape: { path: `${path.relative(tile, outside)}/SKILL.md` },
      throughLink: { path: 'linked/SKILL.md' },
    } }))
    assert.deepStrictEqual(resolveImportableRegistrySkillDirs('tessl', [tile]), [path.join(tile, 'skills', 'inner')])
  })

  await test('an agent mentioned in a message must be a plain agent id before anything is resolved for it', async () => {
    const { callAgent } = require('./channels')
    await assert.rejects(callAgent(path.relative(path.join(workspace, 'AGENTS'), outside), 'hi', 'direct:probe'), /Invalid agent id/)
  })
}

run()
  .catch((error) => { failed++; console.error(error) })
  .finally(() => {
    process.env = originalEnv
    fs.rmSync(root, { recursive: true, force: true })
    console.log(`\npath-boundaries.test.ts: ${passed} passed, ${failed} failed`)
    if (failed > 0) process.exit(1)
    process.exit(0)
  })
