import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { templateFixture } from './portable-template.test'
import { sha256, validatePortableTemplate } from './portable-template'
import { InstanceTemplateCatalog, writeAtomicJson } from './instance-template-catalog'
import { readTemplateAuthorityRegistry } from './template-authority'
import { createTemplateResourceFileCompiler } from './template-resource-files'
import { TemplateRevisionStore } from './template-revisions'
import { TemplateGatewayTransaction, TemplateGatewayTransport } from './template-gateway-transaction'
import { TemplateApplyCoordinator } from './template-apply-coordinator'
import { recoverTemplatesBeforeStartup } from './template-startup-recovery'
import { assertTemplateRuntimeAdmitted } from './template-runtime-admission'
import { noToolsTemplatePolicy, verifyTemplateExecutionPolicies } from './template-execution-policy'

function components(root: string, options: { checkpoint?: (phase: string) => void; afterPatch?: () => void; beforeSnapshot?: () => void } = {}) {
  const file = path.join(root, 'synthetic-gateway.json')
  const transport: TemplateGatewayTransport = {
    async snapshot() { options.beforeSnapshot?.(); return JSON.parse(fs.readFileSync(file, 'utf8')) },
    async patch(entries, hash) {
      const state = JSON.parse(fs.readFileSync(file, 'utf8'))
      assert.equal(hash, state.hash)
      for (const [id, value] of Object.entries(entries)) {
        if (value === null) delete state.entries[id]
        else state.entries[id] = value
      }
      state.hash = `${Number(hash) + 1}`
      writeAtomicJson(file, state)
      options.afterPatch?.()
    },
  }
  const compiler = createTemplateResourceFileCompiler(root, {
    read: () => readTemplateAuthorityRegistry(path.join(root, 'authority.json')),
    runtime: { platform: 'linux/amd64', revision: 'synthetic-runtime' },
  })
  const store = new TemplateRevisionStore(root, 'workspace', compiler)
  const gateway = new TemplateGatewayTransaction(root, transport)
  const coordinator = new TemplateApplyCoordinator(store, gateway, path.join(root, 'runtime'), options.checkpoint)
  const template = new InstanceTemplateCatalog(root, 'workspace').list()[0]
  const request = { templateId: template.id, expectedRevision: null, idempotencyKey: 'apply', bindings: { producer: 'producer-binding', reviewer: 'reviewer-binding' } }
  return { store, transport, coordinator, request, gateway }
}
async function setup(root: string) {
  const bytes = await templateFixture()
  const bundle = await validatePortableTemplate(bytes)
  new InstanceTemplateCatalog(root, 'workspace').import(bundle, bytes, 'actor', 'import')
  writeAtomicJson(path.join(root, 'synthetic-gateway.json'), { hash: '1', entries: { unrelated: { name: 'Preserve' } } })
  writeAtomicJson(path.join(root, 'authority.json'), {
    apiVersion: 'clawmax.template-authority/v1alpha1', workspaceId: 'workspace', revision: 'v1',
    bindings: bundle.artifacts.filter(item => item.kind === 'agent').map(agent => ({
      id: `${agent.id}-binding`, revision: 'v1', artifactId: agent.id, artifactDigest: agent.digest,
      actorIds: ['actor'], disabled: false, model: { id: 'openai/test', revision: 'v1' },
      policy: { id: 'no-tools', sha256: sha256(JSON.stringify(noToolsTemplatePolicy('no-tools'))) }, runtime: { platform: 'linux/amd64', revision: 'synthetic-runtime' }, skills: [], credentials: [],
    })),
  })
}
async function main() {
  if (process.argv[2] === '--crash') {
    const { coordinator, store, request } = components(process.argv[3], { checkpoint: phase => { if (phase === process.argv[4]) process.exit(77) } })
    const plan = await store.plan('actor', request)
    await coordinator.apply('actor', request, plan.planDigest)
    throw new Error('Expected crash checkpoint')
  }
  if (process.argv[2] === '--cleanup-crash') {
    const { coordinator, store } = components(process.argv[3], { checkpoint: phase => { if (phase === process.argv[4]) process.exit(77) } })
    const revision = store.history()[0]
    const plan = store.planCleanup('actor', revision.id, store.currentRevision(), () => {})
    await coordinator.cleanup('actor', revision.id, plan.expectedRevision, plan.planDigest, () => {})
    throw new Error('Expected cleanup process loss')
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-apply-coordinator-'))
  try {
    const unavailable: TemplateGatewayTransport = {
      async snapshot() { throw new Error('Synthetic gateway unavailable') },
      async patch() { throw new Error('Unexpected gateway mutation') },
    }
    const legacy = path.join(root, 'legacy')
    fs.mkdirSync(legacy)
    await recoverTemplatesBeforeStartup([{ id: 'legacy', path: legacy }], unavailable, path.join(root, 'runtime'))
    assert.deepEqual(fs.readdirSync(legacy), [], 'Legacy startup must not create journals or contact the gateway')
    const partial = path.join(root, 'partial-files')
    fs.mkdirSync(path.join(partial, 'ORG'), { recursive: true })
    fs.writeFileSync(path.join(partial, 'ORG/GROUPS.md'), 'original')
    const fileCrash = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', path.join(__dirname, 'workspace-file-transaction.test.ts'), '--crash', partial], { encoding: 'utf8', timeout: 15000 })
    assert.equal(fileCrash.status, 77, fileCrash.stderr)
    assert(fs.existsSync(path.join(partial, 'AGENTS/fixture/IDENTITY.md')))
    await recoverTemplatesBeforeStartup([{ id: 'partial', path: partial }], unavailable, path.join(root, 'runtime'))
    assert(!fs.existsSync(path.join(partial, 'AGENTS/fixture/IDENTITY.md')), 'Startup must roll back partial resource files before readers run')
    assert.equal(fs.readFileSync(path.join(partial, 'ORG/GROUPS.md'), 'utf8'), 'original')
    for (const phase of ['gateway-registered', 'resources-committed']) {
      const workspace = path.join(root, phase)
      await setup(workspace)
      const { coordinator, store, request, transport } = components(workspace)
      const plan = await store.plan('actor', request)
      const child = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', __filename, '--crash', workspace, phase], { encoding: 'utf8', timeout: 15000 })
      assert.equal(child.status, 77, child.stderr)
      assert(fs.existsSync(path.join(workspace, '.clawmax/template-gateway-transaction.json')))
      const journal = fs.readFileSync(path.join(workspace, '.clawmax/template-gateway-transaction.json'))
      await assert.rejects(recoverTemplatesBeforeStartup([{ id: 'workspace', path: workspace }], unavailable, path.join(root, 'runtime')), /gateway unavailable/)
      assert.deepEqual(fs.readFileSync(path.join(workspace, '.clawmax/template-gateway-transaction.json')), journal, 'Failed startup must retain recovery evidence')
      await recoverTemplatesBeforeStartup([{ id: 'workspace', path: workspace }, { id: 'duplicate', path: workspace }], transport, path.join(root, 'runtime'))
      assert.equal(await coordinator.recover(), 'none')
      assert.equal(store.history().length, phase === 'resources-committed' ? 1 : 0)
      assert.equal(Object.keys((await transport.snapshot()).entries).length, phase === 'resources-committed' ? 3 : 1)
      const result = await coordinator.apply('actor', request, plan.planDigest)
      assert.equal(result.created, phase !== 'resources-committed')
      const retried = await coordinator.apply('actor', request, plan.planDigest)
      assert(!retried.created)
      assert.deepEqual(retried.revision, result.revision)
      assert.deepEqual((await transport.snapshot()).entries.unrelated, { name: 'Preserve' })
      assert(!fs.existsSync(path.join(workspace, '.clawmax/template-gateway-transaction.json')))
      assert.equal(store.history().length, 1)
      await assert.rejects(coordinator.apply('actor', { ...request, bindings: { ...request.bindings, producer: 'changed' } }, plan.planDigest), /Apply key/)
    }
    const admissionRoot = path.join(root, 'staged-admission')
    await setup(admissionRoot)
    let duringSnapshot: (() => void) | undefined
    const staged = components(admissionRoot, { beforeSnapshot: () => duringSnapshot?.() })
    const stagedPlan = await staged.store.plan('actor', staged.request)
    const stagedRevision = (await staged.coordinator.apply('actor', staged.request, stagedPlan.planDigest)).revision
    const stagedAgent = stagedRevision.resources.agents.producer
    const authorityFile = path.join(admissionRoot, 'authority.json')
    const authorityBytes = fs.readFileSync(authorityFile)
    let authorityReads = 0
    const source = { read: () => { authorityReads++; return readTemplateAuthorityRegistry(authorityFile) }, runtime: { platform: 'linux/amd64', revision: 'synthetic-runtime' } }
    let policy: unknown = noToolsTemplatePolicy('no-tools')
    let policyReads = 0
    const policies = { read: () => { policyReads++; return policy } }
    const check = () => staged.coordinator.verifyStagedExecution('actor', stagedRevision.id, stagedAgent, source, policies)
    const stagedRoster = await staged.transport.snapshot()
    assert.deepEqual(await check(), { revisionId: stagedRevision.id, planDigest: stagedRevision.planDigest, authorityDigest: stagedRevision.authorityDigest, gatewayHash: stagedRoster.hash })
    assert.equal(authorityReads, 2, 'Authority is checked before and after the gateway await')
    assert.equal(policyReads, 4, 'Each agent policy is checked before and after the gateway await')
    assert.deepEqual(await staged.transport.snapshot(), stagedRoster, 'Staging checks must not write gateway configuration')
    assert.throws(() => assertTemplateRuntimeAdmitted(stagedAgent), /execution is unavailable/, 'Evidence is not an execution grant')
    await assert.rejects(staged.coordinator.verifyStagedExecution('other', stagedRevision.id, stagedAgent, source, policies), /not authorized/)
    await assert.rejects(staged.coordinator.verifyStagedExecution('actor', stagedRevision.id, 'unrelated', source, policies), /does not belong/)
    for (const unsupported of [null, { ...noToolsTemplatePolicy('no-tools'), tools: { deny: [] } }, { ...noToolsTemplatePolicy('no-tools'), allow: ['exec'] }]) {
      policy = unsupported
      await assert.rejects(check(), /policy is unavailable or unsupported/)
    }
    policy = noToolsTemplatePolicy('no-tools')
    const changedPolicyHash = structuredClone(stagedRevision.authority!)
    changedPolicyHash.bindings[0].policy.sha256 = 'b'.repeat(64)
    assert.throws(() => verifyTemplateExecutionPolicies(changedPolicyHash, policies), /policy is unavailable/)
    const addedCredential = structuredClone(stagedRevision.authority!)
    addedCredential.bindings[0].credentials = [{ name: 'API_KEY', reference: 'collector', revision: 'v1' }]
    assert.throws(() => verifyTemplateExecutionPolicies(addedCredential, policies), /policy is unavailable/)
    const addedSkill = structuredClone(stagedRevision.authority!)
    addedSkill.bindings[0].skills = [{ name: 'collector', sha256: 'c'.repeat(64), platform: 'linux/amd64' }]
    assert.throws(() => verifyTemplateExecutionPolicies(addedSkill, policies), /policy is unavailable/)
    assert.throws(() => verifyTemplateExecutionPolicies(stagedRevision.authority!, { read: () => { throw new Error('private path') } }), error => error instanceof Error && !error.message.includes('private path'))
    duringSnapshot = () => { policy = null }
    await assert.rejects(check(), /policy is unavailable/)
    policy = noToolsTemplatePolicy('no-tools')
    duringSnapshot = () => {
      const registry = JSON.parse(authorityBytes.toString())
      registry.bindings[0].actorIds = ['revoked']
      writeAtomicJson(authorityFile, registry)
    }
    await assert.rejects(check(), /authority|authorized/i, 'Revocation during the gateway call must reject admission evidence')
    fs.writeFileSync(authorityFile, authorityBytes)
    const soulFile = path.join(admissionRoot, 'AGENTS', stagedAgent, 'SOUL.md')
    const soulBytes = fs.readFileSync(soulFile)
    duringSnapshot = () => fs.writeFileSync(soulFile, 'Changed while checking gateway')
    await assert.rejects(check(), /missing or changed/)
    fs.writeFileSync(soulFile, soulBytes)
    const stagedLedger = path.join(admissionRoot, 'SYSTEM/.clawmax/template-revisions.json')
    const stagedLedgerBytes = fs.readFileSync(stagedLedger)
    duringSnapshot = () => {
      const ledger = JSON.parse(stagedLedgerBytes.toString())
      ledger.revisions[0].cleanedAt = new Date().toISOString()
      writeAtomicJson(stagedLedger, ledger)
    }
    await assert.rejects(check(), /already cleaned/)
    fs.writeFileSync(stagedLedger, stagedLedgerBytes)
    duringSnapshot = undefined
    await check()
    let dispatches = 0
    const noToolsRuntime = { runNoToolsTemplateAgent: async (input: { agentId: string; model: string; message: string; instructions: string; idempotencyKey: string }) => {
      dispatches++
      assert.equal(input.agentId, stagedAgent)
      assert.equal(input.model, 'openai/test')
      assert(input.instructions.length)
      assert.match(input.idempotencyKey, /^template-[a-f0-9]{64}$/)
      await assert.rejects(staged.coordinator.cleanup('actor', stagedRevision.id, stagedRevision.id, 'a'.repeat(64), () => {}), /in progress/)
      assert.throws(() => staged.store.planCleanup('actor', stagedRevision.id, stagedRevision.id, () => {}), /pending Template execution/)
      return { runId: 'synthetic-run', text: 'Synthetic final reply' }
    } }
    const executionInput = { agentId: stagedAgent, message: 'Private request not stored in receipts', idempotencyKey: 'first-run' }
    const execute = () => staged.coordinator.executeNoToolsAgent('actor', stagedRevision.id, executionInput, source, policies, noToolsRuntime)
    assert.deepEqual(await execute(), { replayed: false, runId: 'synthetic-run', text: 'Synthetic final reply' })
    assert.deepEqual(await execute(), { replayed: true, runId: 'synthetic-run', text: 'Synthetic final reply' })
    assert.equal(dispatches, 1)
    await assert.rejects(staged.coordinator.executeNoToolsAgent('actor', stagedRevision.id, { ...executionInput, message: 'Changed request' }, source, policies, noToolsRuntime), /different request/)
    const receiptFile = path.join(admissionRoot, '.clawmax/template-runs', `${sha256(stagedRevision.id)}.json`)
    assert(!fs.readFileSync(receiptFile, 'utf8').includes(executionInput.message))
    assert.equal(fs.statSync(receiptFile).mode & 0o777, 0o600)
    const stagedCleanup = staged.store.planCleanup('actor', stagedRevision.id, stagedRevision.id, () => {})
    const stagedGroups = path.join(admissionRoot, 'ORG/GROUPS.md')
    const concurrentGroup = '\n### concurrent-unrelated\n- **Members:** existing\n'
    duringSnapshot = () => { duringSnapshot = undefined; fs.appendFileSync(stagedGroups, concurrentGroup) }
    await assert.rejects(staged.coordinator.cleanup('actor', stagedRevision.id, stagedRevision.id, stagedCleanup.planDigest, () => {}), /Cleanup plan changed/)
    assert(!staged.store.history()[0].cleanedAt, 'A concurrent shared-file edit must not partially commit cleanup')
    assert(fs.readFileSync(stagedGroups, 'utf8').includes(stagedRevision.resources.groups.review))
    const replannedCleanup = staged.store.planCleanup('actor', stagedRevision.id, stagedRevision.id, () => {})
    assert.notEqual(replannedCleanup.planDigest, stagedCleanup.planDigest)
    await staged.coordinator.cleanup('actor', stagedRevision.id, stagedRevision.id, replannedCleanup.planDigest, () => {})
    assert.equal(fs.readFileSync(stagedGroups, 'utf8'), '# Organization\n' + concurrentGroup)
    await assert.rejects(check(), /already cleaned/)
    await assert.rejects(execute(), /already cleaned/, 'Cleaned revisions cannot replay chat through the execution owner')
    const uncertainRoot = path.join(root, 'uncertain-execution')
    await setup(uncertainRoot)
    const uncertain = components(uncertainRoot)
    const uncertainPlan = await uncertain.store.plan('actor', uncertain.request)
    const uncertainRevision = (await uncertain.coordinator.apply('actor', uncertain.request, uncertainPlan.planDigest)).revision
    const uncertainSource = { ...source, read: () => readTemplateAuthorityRegistry(path.join(uncertainRoot, 'authority.json')) }
    const lostResponse = { runNoToolsTemplateAgent: async () => { throw new Error('Synthetic lost response') } }
    const uncertainInput = { agentId: uncertainRevision.resources.agents.producer, message: 'Synthetic', idempotencyKey: 'uncertain' }
    await assert.rejects(uncertain.coordinator.executeNoToolsAgent('actor', uncertainRevision.id, uncertainInput, uncertainSource, policies, lostResponse), /lost response/)
    const restarted = components(uncertainRoot)
    await assert.rejects(restarted.coordinator.executeNoToolsAgent('actor', uncertainRevision.id, uncertainInput, uncertainSource, policies, noToolsRuntime), /pending Template execution/)
    await assert.rejects(restarted.coordinator.executeNoToolsAgent('actor', uncertainRevision.id, { ...uncertainInput, idempotencyKey: 'do-not-redispatch' }, uncertainSource, policies, noToolsRuntime), /pending Template execution/)
    assert.throws(() => restarted.store.planCleanup('actor', uncertainRevision.id, uncertainRevision.id, () => {}), /pending Template execution/)
    assert.throws(() => restarted.store.cleanup('actor', uncertainRevision.id, uncertainRevision.id, () => {}), /pending Template execution/)
    assert.equal(dispatches, 1, 'Unknown outcomes never redispatch even with a different key')
    const uncertainReceipt = path.join(uncertainRoot, '.clawmax/template-runs', `${sha256(uncertainRevision.id)}.json`)
    const uncertainBytes = fs.readFileSync(uncertainReceipt)
    fs.writeFileSync(uncertainReceipt, '{invalid')
    assert.throws(() => restarted.store.planCleanup('actor', uncertainRevision.id, uncertainRevision.id, () => {}), /evidence requires inspection/)
    fs.unlinkSync(uncertainReceipt)
    fs.symlinkSync(receiptFile, uncertainReceipt)
    await assert.rejects(restarted.coordinator.executeNoToolsAgent('actor', uncertainRevision.id, uncertainInput, uncertainSource, policies, noToolsRuntime), /evidence requires inspection/)
    fs.unlinkSync(uncertainReceipt)
    fs.writeFileSync(uncertainReceipt, uncertainBytes)
    for (const phase of ['cleanup-prepared', 'cleanup-committed', 'cleanup-response-lost', 'cleanup-normal']) {
      const workspace = path.join(root, phase)
      await setup(workspace)
      let loseResponse = false
      let recoveryUnavailable = false
      const { coordinator, store, request, transport } = components(workspace, { afterPatch: () => {
        if (loseResponse) { recoveryUnavailable = true; throw new Error('Synthetic cleanup response loss') }
      }, beforeSnapshot: () => { if (recoveryUnavailable) throw new Error('Synthetic gateway unavailable after response loss') } })
      const applyPlan = await store.plan('actor', request)
      const applied = await coordinator.apply('actor', request, applyPlan.planDigest)
      const revisionId = applied.revision.id
      const revisionBefore = store.currentRevision()
      const ledgerFile = path.join(workspace, 'SYSTEM/.clawmax/template-revisions.json')
      const ledgerBefore = fs.readFileSync(ledgerFile)
      const rosterBefore = await transport.snapshot()
      const cleanupPlan = store.planCleanup('actor', revisionId, revisionBefore, () => {})
      assert.deepEqual(fs.readFileSync(ledgerFile), ledgerBefore, 'Cleanup planning cannot write the ledger')
      assert.deepEqual(await transport.snapshot(), rosterBefore, 'Cleanup planning cannot change the gateway')
      assert(!JSON.stringify(cleanupPlan).includes(workspace), 'Cleanup plans must not expose absolute runtime paths')
      assert(!JSON.stringify(applied.revision).includes('agentDir'), 'Private registration receipts must not leak through revisions')
      await assert.rejects(coordinator.cleanup('other', revisionId, revisionBefore, cleanupPlan.planDigest, () => {}), /not authorized/)
      await assert.rejects(coordinator.cleanup('actor', revisionId, revisionBefore, 'wrong-plan', () => {}), /plan changed/)
      await assert.rejects(coordinator.cleanup('actor', revisionId, revisionBefore, cleanupPlan.planDigest, () => { throw new Error('Still running') }), /Still running/)
      assert(!fs.existsSync(path.join(workspace, '.clawmax/template-gateway-transaction.json')))
      const agentId = applied.revision.resources.agents.producer
      const identityFile = path.join(workspace, 'AGENTS', agentId, 'IDENTITY.md')
      const identityBefore = fs.readFileSync(identityFile)
      fs.writeFileSync(identityFile, 'Operator edit')
      assert.throws(() => store.planCleanup('actor', revisionId, revisionBefore, () => {}), /resources changed/)
      fs.writeFileSync(identityFile, identityBefore)
      const originalEntry = rosterBefore.entries[agentId] as any
      await transport.patch({ [agentId]: { ...originalEntry, name: 'Operator edit' } }, (await transport.snapshot()).hash)
      await assert.rejects(coordinator.cleanup('actor', revisionId, revisionBefore, cleanupPlan.planDigest, () => {}), /changed outside/)
      assert.deepEqual(fs.readFileSync(ledgerFile), ledgerBefore)
      await transport.patch({ [agentId]: originalEntry }, (await transport.snapshot()).hash)

      if (phase === 'cleanup-prepared' || phase === 'cleanup-committed') {
        const child = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', __filename, '--cleanup-crash', workspace, phase], { encoding: 'utf8', timeout: 15000 })
        assert.equal(child.status, 77, child.stderr)
        assert(fs.existsSync(path.join(workspace, '.clawmax/template-gateway-transaction.json')))
        await recoverTemplatesBeforeStartup([{ id: 'workspace', path: workspace }], transport, path.join(workspace, 'runtime'))
        assert.equal(Boolean(store.history()[0].cleanedAt), phase === 'cleanup-committed')
        assert.equal(Object.keys((await transport.snapshot()).entries).length, phase === 'cleanup-committed' ? 1 : 3)
      }
      // Catalog removal never cascades; retained ownership receipts must suffice.
      new InstanceTemplateCatalog(workspace, 'workspace').remove(request.templateId)
      if (phase === 'cleanup-response-lost') {
        loseResponse = true
        await assert.rejects(coordinator.cleanup('actor', revisionId, revisionBefore, cleanupPlan.planDigest, () => {}), /gateway unavailable/)
        assert(store.history()[0].cleanedAt, 'Resource commit remains authoritative after response loss')
        assert(fs.existsSync(path.join(workspace, '.clawmax/template-gateway-transaction.json')))
        loseResponse = false
        recoveryUnavailable = false
      }
      await coordinator.cleanup('actor', revisionId, revisionBefore, cleanupPlan.planDigest, () => {})
      const replay = await coordinator.cleanup('actor', revisionId, revisionBefore, cleanupPlan.planDigest, () => { throw new Error('Cleaned retry cannot stop unrelated resources') })
      assert(!replay.removed)
      assert(store.history()[0].cleanedAt, 'Preserve cleaned revision history')
      assert.deepEqual((await transport.snapshot()).entries, { unrelated: { name: 'Preserve' } })
      assert(!fs.existsSync(identityFile))
      assert(!fs.existsSync(path.join(workspace, '.clawmax/template-gateway-transaction.json')))
      assert(!fs.existsSync(path.join(workspace, '.clawmax/template-gateway-revisions', `${applyPlan.planDigest}.json`)))
    }

    const revoked = path.join(root, 'revoked')
    await setup(revoked)
    let changed = false
    const setupRevoked = components(revoked, { afterPatch: () => {
      if (changed) return
      changed = true
      const file = path.join(revoked, 'authority.json')
      const registry = JSON.parse(fs.readFileSync(file, 'utf8'))
      registry.bindings[0].disabled = true
      writeAtomicJson(file, registry)
    } })
    const plan = await setupRevoked.store.plan('actor', setupRevoked.request)
    await assert.rejects(setupRevoked.coordinator.apply('actor', setupRevoked.request, plan.planDigest), /not authorized/)
    assert.equal(setupRevoked.store.history().length, 0)
    assert(!fs.existsSync(path.join(revoked, 'AGENTS')))
    assert.deepEqual((await setupRevoked.transport.snapshot()).entries, { unrelated: { name: 'Preserve' } })

    const failing = path.join(root, 'lost-response')
    await setup(failing)
    let lost = false
    const setupFailure = components(failing, { afterPatch: () => { if (!lost) { lost = true; throw new Error('Response lost') } } })
    const failedPlan = await setupFailure.store.plan('actor', setupFailure.request)
    await assert.rejects(setupFailure.coordinator.apply('actor', setupFailure.request, failedPlan.planDigest), /requires recovery/)
    assert.deepEqual((await setupFailure.transport.snapshot()).entries, { unrelated: { name: 'Preserve' } })
    assert.equal(setupFailure.store.history().length, 0)
    assert.throws(() => new TemplateApplyCoordinator(setupFailure.store, setupRevoked.gateway, path.join(root, 'runtime')), /same workspace/)
    const corrupt = path.join(root, 'corrupt')
    fs.mkdirSync(path.join(corrupt, '.clawmax'), { recursive: true })
    fs.writeFileSync(path.join(corrupt, '.clawmax/template-gateway-transaction.json'), '{broken')
    await assert.rejects(recoverTemplatesBeforeStartup([{ id: 'corrupt', path: corrupt }], unavailable, path.join(root, 'runtime')), /requires inspection/)
    assert.equal(fs.readFileSync(path.join(corrupt, '.clawmax/template-gateway-transaction.json'), 'utf8'), '{broken')
    const server = fs.readFileSync(path.join(__dirname, '../index.ts'), 'utf8')
    const startup = server.slice(server.indexOf('async function startServer()'))
    assert(startup.indexOf('await recoverTemplatesBeforeStartup(') < startup.indexOf('recoveryServingGate.resume()'))
    assert(startup.indexOf('recoveryServingGate.resume()') < startup.indexOf('app.listen('))
    assert(startup.indexOf('app.listen(') < startup.indexOf('recoveryServingGate.onListening()'))
    console.log('template-apply-coordinator.test.ts: passed')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
