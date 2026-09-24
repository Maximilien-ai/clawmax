import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { addCommunityToTemplateFixture, templateFixture } from './portable-template.test'
import { validatePortableTemplate } from './portable-template'
import { InstanceTemplateCatalog } from './instance-template-catalog'
import { TemplateRevisionStore } from './template-revisions'
import { createTemplateResourceFileCompiler } from './template-resource-files'
import { commitWorkspaceFiles } from './workspace-file-transaction'
import { parseGroupsWithMembers } from './workspace'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-community-'))
  try {
    fs.mkdirSync(path.join(root, 'ORG'), { recursive: true })
    const original = '# Communities\n\n## Communities\n\n### Existing\n- **Members:** external\n'
    fs.writeFileSync(path.join(root, 'ORG/COMMUNITIES.md'), original)
    const bytes = await templateFixture(addCommunityToTemplateFixture)
    const bundle = await validatePortableTemplate(bytes)
    const template = new InstanceTemplateCatalog(root, 'isolated').import(bundle, bytes, 'actor', 'import').template
    const compiler = createTemplateResourceFileCompiler(root)
    const store = new TemplateRevisionStore(root, 'isolated', compiler)
    const request = { templateId: template.id, expectedRevision: null, idempotencyKey: 'apply-community', bindings: {} }
    const plan = await store.plan('actor', request)
    assert.equal(Object.keys(plan.resources.communities).length, 1)
    assert.equal(fs.readFileSync(path.join(root, 'ORG/COMMUNITIES.md'), 'utf8'), original, 'Plan must not write')
    const compiled = compiler(bundle, request, 'tr-0123456789abcdef')
    assert.throws(() => commitWorkspaceFiles(root, compiled.mutations, index => { if (index === 2) throw new Error('interrupted community apply') }), /interrupted community apply/)
    assert.equal(fs.readFileSync(path.join(root, 'ORG/COMMUNITIES.md'), 'utf8'), original, 'Interrupted apply must preserve the original Community registry')
    assert(!fs.existsSync(path.join(root, 'ORG/template-communities')), 'Interrupted apply must not leave a Community sidecar')
    const applied = await store.apply('actor', request, plan.planDigest)
    const communityId = applied.revision.resources.communities.team
    const communityFile = path.join(root, `ORG/template-communities/${communityId}.json`)
    const sidecar = JSON.parse(fs.readFileSync(communityFile, 'utf8'))
    assert.deepEqual(sidecar.channels, [])
    assert.equal(sidecar.groupIds.length, 1)
    assert.equal(sidecar.memberAgentIds.length, 2)
    const registry = path.join(root, 'ORG/COMMUNITIES.md')
    const parsed = parseGroupsWithMembers(fs.readFileSync(registry, 'utf8')).communities
    assert.deepEqual(parsed.find(item => item.name === 'Test Team')?.members, sidecar.memberAgentIds)
    assert(parsed.some(item => item.name === 'Existing'))
    const groups = parseGroupsWithMembers(fs.readFileSync(path.join(root, 'ORG/GROUPS.md'), 'utf8')).groups
    assert.equal(groups.find(item => item.name === applied.revision.resources.groups.review)?.community, 'Test Team')
    assert.equal(store.verifyExecutionResources('actor', applied.revision.id, communityId).id, applied.revision.id)

    const committed = fs.readFileSync(registry, 'utf8')
    fs.writeFileSync(registry, committed.replace('Inert test community', 'tampered'))
    assert.throws(() => store.planCleanup('actor', applied.revision.id, applied.revision.id, () => {}), /section changed/)
    fs.writeFileSync(registry, committed + '\n### Later\n- **Members:** unrelated\n')
    const cleanupPlan = store.planCleanup('actor', applied.revision.id, applied.revision.id, () => {})
    assert.equal(cleanupPlan.resources.communities.team, communityId)
    store.cleanup('actor', applied.revision.id, applied.revision.id, () => {})
    assert(!fs.existsSync(communityFile), 'Cleanup removes only the owned sidecar')
    const remaining = fs.readFileSync(registry, 'utf8')
    assert(remaining.includes('### Existing') && remaining.includes('### Later'), 'Unrelated Communities must survive')
    assert(!remaining.includes('### Test Team'), 'Owned Community must be removed')
    console.log('template-community.test.ts: passed')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
