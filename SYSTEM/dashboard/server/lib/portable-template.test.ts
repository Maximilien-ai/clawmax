import assert from 'assert'
import { fixtureZip } from './portable-template-zip.test'
import { sha256, validatePortableTemplate } from './portable-template'

export async function templateFixture(change?: (files: Record<string, Buffer>, manifest: any) => void) {
  const files: Record<string, Buffer> = {}
  const agents: string[] = []
  for (const name of ['producer', 'reviewer']) {
    const definition = Buffer.from(JSON.stringify({ apiVersion: 'clawmax.portable-agent-definition/v1alpha2', kind: 'Agent', name, description: 'Synthetic stability fixture', instructions: 'Respond to the test request. Do not use tools.', model: 'openai-compatible/qwen', skills: [] }))
    const agentManifest = { apiVersion: 'clawmax.portable-agent/v1alpha2', kind: 'PortableAgent', agent: { id: name, name, description: 'Synthetic stability fixture' }, createdAt: '2026-09-18T00:00:00Z', files: [{ path: 'content/agent.json', sizeBytes: definition.length, sha256: sha256(definition) }] }
    const agent = await fixtureZip({ 'manifest.json': JSON.stringify(agentManifest), 'content/agent.json': definition })
    files[`agents/${name}.zip`] = agent
    agents.push(`sha256:${sha256(agent)}`)
  }
  const group = { apiVersion: 'clawmax.portable-group/v1alpha2', kind: 'PortableGroup', key: 'review', name: 'Review', description: '', objective: 'Review the producer response', entryMemberIds: ['producer'], members: [{ id: 'producer', agentDigest: agents[0], role: 'produce', sendTo: ['reviewer'] }, { id: 'reviewer', agentDigest: agents[1], role: 'review', sendTo: ['producer'] }], limits: { maxTurns: 4, maxMessages: 10, maxMessageBytes: 1024, retentionSeconds: 3600 } }
  const groupData = Buffer.from(JSON.stringify(group))
  files['groups/review.json'] = groupData
  const workflow = { apiVersion: 'clawmax.portable-workflow/v1alpha2', kind: 'PortableWorkflow', key: 'check', name: 'Check', description: '', objective: 'Run a group check', schedule: { type: 'manual' }, execution: { mode: 'automated' }, runPolicy: { type: 'once', maxRuns: 1, dependsOn: [] }, steps: [{ id: 'check', targetKind: 'group', targetDigest: `sha256:${sha256(groupData)}`, objective: 'Produce and review a response' }], edges: [], limits: { maxParallel: 1, maxRunSeconds: 120, maxOutputBytes: 4096, retentionSeconds: 3600 } }
  files['workflows/check.json'] = Buffer.from(JSON.stringify(workflow))
  const manifest = { apiVersion: 'clawmax.portable-template/v1alpha1', kind: 'PortableTemplate', key: 'stability', name: 'Stability', version: '1.0.0', description: 'Synthetic test graph', createdAt: '2026-09-18T00:00:00Z', secretRequirements: [], artifacts: Object.entries(files).map(([path, content]) => ({ id: path.split('/')[1].replace(/\.(zip|json)$/, ''), kind: path.split('/')[0].slice(0, -1), path, sizeBytes: content.length, sha256: sha256(content) })) }
  change?.(files, manifest)
  return fixtureZip({ 'manifest.json': JSON.stringify(manifest), ...files })
}

async function main() {
  const valid = await templateFixture()
  const parsed = await validatePortableTemplate(valid)
  assert.equal(parsed.artifacts.length, 4)
  assert.equal(parsed.bundleSha256, sha256(valid))
  assert.equal(parsed.manifest.secretRequirements.length, 0)
  await assert.rejects(validatePortableTemplate(await templateFixture((_files, manifest) => { manifest.apiKey = 'not-allowed' })), /manifest fields/)
  await assert.rejects(validatePortableTemplate(await templateFixture((_files, manifest) => { manifest.artifacts[0].sha256 = '0'.repeat(64) })), /digest mismatch/)
  await assert.rejects(validatePortableTemplate(await templateFixture((_files, manifest) => { manifest.artifacts.reverse() })), /canonically ordered/)
  await assert.rejects(validatePortableTemplate(await templateFixture(files => { files['extra.txt'] = Buffer.from('undeclared') })), /declare all files/)
  await assert.rejects(validatePortableTemplate(await templateFixture((files, manifest) => {
    const definition = JSON.parse(files['groups/review.json'].toString())
    definition.members[0].agentDigest = `sha256:${'0'.repeat(64)}`
    files['groups/review.json'] = Buffer.from(JSON.stringify(definition))
    const entry = manifest.artifacts.find((item: any) => item.kind === 'group')
    entry.sha256 = sha256(files[entry.path]); entry.sizeBytes = files[entry.path].length
  })), /outside the Template/)
  // JSON input order is not content identity: the canonical schema order is.
  const reordered = await templateFixture((files, manifest) => {
    const group = JSON.parse(files['groups/review.json'].toString())
    files['groups/review.json'] = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(group).reverse())))
    const entry = manifest.artifacts.find((item: any) => item.kind === 'group')
    entry.sha256 = sha256(files[entry.path]); entry.sizeBytes = files[entry.path].length
  })
  assert.equal((await validatePortableTemplate(reordered)).artifacts.length, 4)
  console.log('portable-template.test.ts: passed')
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
