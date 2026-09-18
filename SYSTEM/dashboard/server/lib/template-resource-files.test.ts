import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { templateFixture } from './portable-template.test'
import { validatePortableTemplate } from './portable-template'
import { InstanceTemplateCatalog } from './instance-template-catalog'
import { TemplateRevisionStore } from './template-revisions'
import { createTemplateResourceFileCompiler } from './template-resource-files'
import { commitWorkspaceFiles } from './workspace-file-transaction'
import { isManagedAgentWorkspaceDir, parseIdentity, parseGroupsWithMembers } from './workspace'
import { getWorkflow, triggerWorkflow } from './workflows'
import { runExclusiveAgentExecution } from './agent-execution'

function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {}
  function visit(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(file)
      else files[path.relative(root, file)] = fs.readFileSync(file).toString('base64')
    }
  }
  visit(root)
  return files
}
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-files-'))
  const previous = process.env.CLAWMAX_TEST_WORKSPACE
  process.env.CLAWMAX_TEST_WORKSPACE = root
  try {
    const bytes = await templateFixture()
    const bundle = await validatePortableTemplate(bytes)
    const template = new InstanceTemplateCatalog(root, 'isolated').import(bundle, bytes, 'actor', 'import').template
    fs.mkdirSync(path.join(root, 'ORG'))
    const originalGroups = '# Organization\n\n## Groups\n\n### unrelated\n- **Members:** existing\n'
    fs.writeFileSync(path.join(root, 'ORG/GROUPS.md'), originalGroups)
    const compiler = createTemplateResourceFileCompiler(root)
    const store = new TemplateRevisionStore(root, 'isolated', compiler)
    const request = { templateId: template.id, expectedRevision: null, idempotencyKey: 'apply', bindings: {} }
    const initial = snapshot(root)
    const plan = await store.plan('actor', request)
    assert.deepEqual(snapshot(root), initial, 'Plan must not write files')
    assert.throws(() => compiler(bundle, { ...request, bindings: { producer: 'unadmitted' } }, 'tr-0123456789abcdef'), /authority admission/)
    const skillBundle = structuredClone(bundle)
    skillBundle.artifacts[0].definition.skills = ['collector']
    assert.throws(() => compiler(skillBundle, request, 'tr-0123456789abcdef'), /authority admission/)
    const secretBundle = structuredClone(bundle)
    secretBundle.manifest.secretRequirements = [{ name: 'API_KEY' }]
    assert.throws(() => compiler(secretBundle, request, 'tr-0123456789abcdef'), /authority admission/)
    const metadataBundle = structuredClone(bundle)
    metadataBundle.artifacts[0].definition.description = 'Example\n**Model:** injected/provider'
    const metadataFiles = compiler(metadataBundle, request, 'tr-0123456789abcdef').mutations
    const metadataIdentity = metadataFiles.find(item => item.path.endsWith('/IDENTITY.md'))!.content!
    assert.equal(parseIdentity(metadataIdentity).model, undefined, 'Description cannot inject native runtime metadata')

    const compiled = compiler(bundle, request, 'tr-0123456789abcdef')
    assert.throws(() => commitWorkspaceFiles(root, compiled.mutations, index => { if (index === 2) throw new Error('synthetic interruption') }), /synthetic interruption/)
    assert.deepEqual(snapshot(root), initial, 'Interrupted materialization must restore all file contents')
    const applied = await store.apply('actor', request, plan.planDigest)
    const reopened = new TemplateRevisionStore(root, 'isolated', compiler)
    assert.equal((await reopened.apply('actor', request, plan.planDigest)).created, false)
    const { agents, groups, workflows } = applied.revision.resources
    const agentDir = path.join(root, 'AGENTS', agents.producer)
    assert(isManagedAgentWorkspaceDir(agentDir), 'Native agent discovery must recognize imported files')
    assert.equal(parseIdentity(fs.readFileSync(path.join(agentDir, 'IDENTITY.md'), 'utf8')).name, 'producer')
    const nativeGroups = parseGroupsWithMembers(fs.readFileSync(path.join(root, 'ORG/GROUPS.md'), 'utf8')).groups
    assert(nativeGroups.some(group => group.name === 'unrelated'))
    assert.deepEqual(nativeGroups.find(group => group.name === groups.review)!.members, [agents.producer, agents.reviewer])
    const group = JSON.parse(fs.readFileSync(path.join(root, `ORG/template-groups/${groups.review}.json`), 'utf8'))
    assert.equal(group.state, 'stopped')
    assert.deepEqual(group.members[0].sendTo, ['reviewer'])
    const nativeWorkflow = getWorkflow(workflows.check)!
    assert(nativeWorkflow, 'Native workflow reader must recognize imported file')
    assert.equal(nativeWorkflow.enabled, false)
    assert.equal(nativeWorkflow.schedule, '')
    assert.equal(nativeWorkflow.status, 'blocked')
    const beforeRun = snapshot(root)
    const run = triggerWorkflow(workflows.check, { manual: true })
    assert(!run.success && run.error?.includes('authority admission'))
    let executed = false
    await assert.rejects(runExclusiveAgentExecution(agents.producer, async () => { executed = true }), /authority admission/)
    assert(!executed)
    assert.deepEqual(snapshot(root), beforeRun, 'Rejected execution must not create run state')
    assert.equal(await runExclusiveAgentExecution('legacy-test-agent', async () => 'legacy-ok'), 'legacy-ok')

    const registry = path.join(root, 'ORG/GROUPS.md')
    const appliedGroups = fs.readFileSync(registry, 'utf8')
    fs.appendFileSync(registry, '\n### added-later\n- **Members:** existing\n')
    assert.throws(() => reopened.cleanup('actor', applied.revision.id, applied.revision.id, () => {}), /changed after planning/)
    assert(fs.existsSync(path.join(agentDir, 'IDENTITY.md')), 'Failed cleanup must not partially delete agents')
    assert(fs.readFileSync(registry, 'utf8').includes('added-later'))
    fs.writeFileSync(registry, appliedGroups)
    const cleaned = reopened.cleanup('actor', applied.revision.id, applied.revision.id, () => {})
    assert.equal(fs.readFileSync(registry, 'utf8'), originalGroups)
    assert(!isManagedAgentWorkspaceDir(agentDir))
    assert(!fs.existsSync(path.join(root, `WORKFLOWS/${workflows.check}.md`)))
    assert(!reopened.cleanup('actor', applied.revision.id, cleaned.currentRevision, () => {}).removed)
    const nextRequest = { ...request, idempotencyKey: 'apply-again', expectedRevision: cleaned.currentRevision }
    const nextPlan = await reopened.plan('actor', nextRequest)
    const next = await reopened.apply('actor', nextRequest, nextPlan.planDigest)
    assert.notEqual(next.revision.resources.agents.producer, agents.producer)
    reopened.cleanup('actor', next.revision.id, next.revision.id, () => {})
    assert.equal(fs.readFileSync(registry, 'utf8'), originalGroups)
    console.log('template-resource-files.test.ts: passed')
  } finally {
    if (previous === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE
    else process.env.CLAWMAX_TEST_WORKSPACE = previous
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
