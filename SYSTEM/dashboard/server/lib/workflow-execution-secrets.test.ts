/**
 * Workflow run secrets never reach stored run records, history or detail responses, the docs reader,
 * workspace exports, or logs, while participants still receive the run's provider key through their
 * runtime environment.
 *
 * Run with: npx ts-node --transpileOnly server/lib/workflow-execution-secrets.test.ts
 *
 * Synthetic canary values only. The agent runtime is stubbed, so nothing is spawned or billed.
 */
import assert from 'node:assert/strict'
import crypto from 'crypto'
import express from 'express'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'

const canaries: string[] = []
function canary(name: string): string {
  const value = `canary-${name}-${crypto.randomBytes(12).toString('hex')}`
  canaries.push(value)
  return value
}
function leakedCanaries(text: string): string[] {
  return canaries.filter((value) => text.includes(value))
}

// Everything the server prints during the run, checked for canaries at the end.
const printed: string[] = []
for (const method of ['log', 'info', 'warn', 'error'] as const) {
  const original = console[method].bind(console)
  console[method] = (...args: unknown[]) => {
    printed.push(args.map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
    original(...args)
  }
}

async function waitFor<T>(read: () => T | undefined | null | false, what: string, ms = 10_000): Promise<T> {
  const deadline = Date.now() + ms
  for (;;) {
    const value = read()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workflow-secrets-'))
  const workspace = path.join(home, 'workspace')
  for (const dir of ['AGENTS', 'ORG', 'SYSTEM', path.join('WORKFLOWS', 'executions')]) {
    fs.mkdirSync(path.join(workspace, dir), { recursive: true })
  }
  fs.writeFileSync(path.join(workspace, 'ORG', 'COMMUNITIES.md'), '# Communities\n\n## Communities\n\n')
  fs.writeFileSync(path.join(workspace, 'ORG', 'GROUPS.md'), '# Groups\n\n## Groups\n\n')
  process.env.HOME = home
  process.env.OPENCLAW_WORKSPACE = workspace
  // Checked before anything else: SYSTEM/dashboard/.env (loaded with override) may name the developer's
  // real workspace in OPENCLAW_WORKSPACE, and nothing here may be written there.
  process.env.CLAWMAX_TEST_WORKSPACE = workspace
  fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
  fs.writeFileSync(path.join(home, '.openclaw', 'dashboard-workspaces.json'), JSON.stringify({
    version: '1.0.0', activeWorkspaceId: 'secrets-test',
    workspaces: [{ id: 'secrets-test', name: 'Secrets Test', path: workspace, createdAt: '2026-10-28T00:00:00.000Z', lastAccessedAt: '2026-10-28T00:00:00.000Z', color: '#3B82F6', tags: [] }],
  }))
  require('./workspace-manager').resetWorkspaceManagerForTests()

  const agents = ['secrets-agent-a', 'secrets-agent-b']
  for (const agentId of agents) {
    fs.mkdirSync(path.join(workspace, 'AGENTS', agentId), { recursive: true })
    fs.writeFileSync(path.join(workspace, 'AGENTS', agentId, 'IDENTITY.md'), `# IDENTITY.md\n\n- **Name:** ${agentId}\n- **Model:** anthropic/claude-sonnet-4-5\n- **Runtime:** claude\n`)
  }

  // The runtime turn is the boundary: it records what each participant received, and the workflow
  // content says whether to succeed, fail, or hold until released or stopped.
  const turns: Array<{ agentId: string; message: string; env: NodeJS.ProcessEnv }> = []
  const releases: Array<() => void> = []
  require('./agent-execution').resolveAgentExecutionConfig = (agentId: string) => ({
    runtime: 'claude', provider: 'anthropic', model: 'anthropic/claude-sonnet-4-5', workspace: path.join(workspace, 'AGENTS', agentId),
  })
  require('./agent-runtime').executeAgentRuntimeTurn = (options: { agentId: string; message: string; env: NodeJS.ProcessEnv; signal: AbortSignal }) => {
    turns.push({ agentId: options.agentId, message: options.message, env: options.env })
    if (options.message.includes('Behavior: fail')) return Promise.resolve({ text: '', errorText: 'Synthetic runtime failure' })
    if (!options.message.includes('Behavior: hold')) return Promise.resolve({ text: 'Synthetic participant result' })
    return new Promise((resolve) => {
      releases.push(() => resolve({ text: 'Released participant result' }))
      options.signal.addEventListener('abort', () => resolve({ text: '', errorText: 'Turn cancelled' }))
    })
  }

  const workflows = require('./workflows')
  const { createWorkflow, triggerWorkflow, cancelExecution, getExecution, redactStoredExecutionSecrets } = workflows
  const secretRequirements = [
    { key: 'SERVICE_API_KEY', label: 'Service API key', kind: 'api_key', sensitive: true },
    { key: 'REPORT_CHANNEL', label: 'Report channel', kind: 'text', sensitive: false },
    { key: 'REPORT_DIR', label: 'Report folder', kind: 'text', sensitive: false },
  ]
  function create(name: string, behavior: string, targets = agents) {
    const created = createWorkflow({
      name, description: 'Run secrets test', schedule: 'manual', executionMode: 'automated', secretRequirements,
      content: `# ${name}\n\n- **Topic:** Golden Gate\n\nBehavior: ${behavior}\n`,
      targeting: { agents: targets, groups: [], tags: [], communities: [] },
    })
    assert.ok(created.success && created.id, `Workflow should be created: ${created.error}`)
    return created.id as string
  }
  // A browser vault: provider keys, a token, a free-form name, a key equal to an explicit input's
  // name, a path-shaped value (path-like inputs are written into the prompt), and declared secrets.
  function runSecrets(tag: string) {
    return {
      byok: { anthropic: canary(`${tag}-byok-anthropic`), openai: canary(`${tag}-byok-openai`) },
      secrets: {
        OPENAI_API_KEY: canary(`${tag}-vault-openai`),
        GITHUB_TOKEN: canary(`${tag}-vault-github`),
        'Custom Service Credential': canary(`${tag}-vault-custom`),
        Topic: canary(`${tag}-vault-topic`),
        DATA_DIR: `vault/${canary(`${tag}-vault-path`)}`,
        SERVICE_API_KEY: canary(`${tag}-declared-sensitive`),
        REPORT_CHANNEL: 'weekly-reports',
        REPORT_DIR: 'reports/weekly',
      },
      inputs: { Topic: 'Bay Bridge', 'Run Instructions': 'Keep it short' },
    }
  }
  const executionFile = (workflowId: string, executionId: string) => path.join(workspace, 'WORKFLOWS', 'executions', workflowId, `${executionId}.json`)
  const finished = (workflowId: string, executionId: string) => waitFor(() => {
    const execution = getExecution(workflowId, executionId)
    return execution && execution.status !== 'running' ? execution : null
  }, `run ${executionId} to finish`)
  function assertStoredWithoutSecrets(workflowId: string, executionId: string, label: string) {
    const raw = fs.readFileSync(executionFile(workflowId, executionId), 'utf-8')
    assert.deepEqual(leakedCanaries(raw), [], `${label}: the stored run record holds run secrets`)
    const stored = JSON.parse(raw)
    assert.deepEqual(stored.inputs, { Topic: 'Bay Bridge', 'Run Instructions': 'Keep it short' }, `${label}: explicit inputs are stored as given, and no secret replaces one`)
    assert.equal(stored.inputsExcludeSecrets, true, `${label}: new records are marked`)
  }
  const passed: string[] = []
  const pass = (name: string) => { passed.push(name); console.log(`✓ ${name}`) }

  // Success, two participants.
  const succeeding = create('Secrets Success', 'succeed')
  const successRun = runSecrets('success')
  turns.length = 0
  const success = triggerWorkflow(succeeding, { manual: true, ...successRun })
  assert.ok(success.success, success.error)
  assert.equal((await finished(succeeding, success.executionId)).status, 'completed')
  assertStoredWithoutSecrets(succeeding, success.executionId, 'success')
  assert.equal(turns.length, 2)
  for (const turn of turns) {
    assert.ok(Object.values(turn.env).includes(successRun.byok.anthropic), `${turn.agentId} must receive the run's provider key in its runtime environment`)
    assert.ok(!Object.values(turn.env).includes(successRun.byok.openai), `${turn.agentId} receives only its own provider's key`)
    assert.deepEqual(leakedCanaries(turn.message), [], `${turn.agentId}: no secret is written into the participant prompt`)
    assert.ok(turn.message.includes('- Service API key: provided securely for this run'), 'Declared sensitive secrets are still announced')
    assert.ok(turn.message.includes('- Report channel: `weekly-reports`'), 'Declared non-sensitive values still reach the prompt')
    assert.ok(turn.message.includes('- Resolved run input REPORT_DIR: raw `reports/weekly`'), 'Declared non-sensitive paths are still resolved against the workspace')
  }
  pass('success: secrets stay out of the record and prompt; participants still get the provider key')

  // Failure.
  const failing = create('Secrets Failure', 'fail', [agents[0]])
  const failure = triggerWorkflow(failing, { manual: true, ...runSecrets('failure') })
  const failedRun = await finished(failing, failure.executionId)
  assert.equal(failedRun.status, 'failed')
  assert.ok(failedRun.logs.join('\n').includes('Synthetic runtime failure'), 'The failure is still logged')
  assertStoredWithoutSecrets(failing, failure.executionId, 'failure')
  pass('failure: the failed run record holds no secrets')

  // Cancelled while a participant is working.
  const holding = create('Secrets Cancel', 'hold', [agents[0]])
  turns.length = 0
  const cancelled = triggerWorkflow(holding, { manual: true, ...runSecrets('cancel') })
  await waitFor(() => turns.length === 1, 'the step to start')
  assert.ok(cancelExecution(holding, cancelled.executionId).success)
  assert.equal((await finished(holding, cancelled.executionId)).status, 'cancelled')
  assertStoredWithoutSecrets(holding, cancelled.executionId, 'cancelled')
  pass('cancelled: the cancelled run record holds no secrets')

  // Mock mode writes the run inputs into each participant's response.
  const mocked = create('Secrets Mock', 'succeed', [agents[0]])
  const mock = triggerWorkflow(mocked, { manual: true, mock: true, ...runSecrets('mock') })
  assert.equal((await finished(mocked, mock.executionId)).status, 'completed')
  assertStoredWithoutSecrets(mocked, mock.executionId, 'mock')
  pass('mock: mock responses list only explicit inputs')

  // Two workflows at once, each with its own credentials.
  const first = create('Secrets Concurrent A', 'hold', [agents[0]])
  const second = create('Secrets Concurrent B', 'hold', [agents[1]])
  const firstRun = runSecrets('concurrent-a')
  const secondRun = runSecrets('concurrent-b')
  turns.length = 0
  releases.length = 0
  const a = triggerWorkflow(first, { manual: true, ...firstRun })
  const b = triggerWorkflow(second, { manual: true, ...secondRun })
  await waitFor(() => releases.length === 2, 'both runs to be in flight')
  releases.forEach((release) => release())
  await finished(first, a.executionId)
  await finished(second, b.executionId)
  assertStoredWithoutSecrets(first, a.executionId, 'concurrent A')
  assertStoredWithoutSecrets(second, b.executionId, 'concurrent B')
  for (const [agentId, own, other] of [[agents[0], firstRun, secondRun], [agents[1], secondRun, firstRun]] as const) {
    const env = Object.values(turns.find((turn) => turn.agentId === agentId)!.env)
    assert.ok(env.includes(own.byok.anthropic) && !env.includes(other.byok.anthropic), `${agentId} must receive its own run's key and not the other run's`)
  }
  pass('concurrent: two runs keep their credentials apart and out of both records')

  // Records written before this fix: build them as the old code stored them.
  const legacyWorkflow = createWorkflow({
    name: 'Secrets Legacy', description: 'Old records', schedule: 'manual', executionMode: 'automated',
    secretRequirements: [{ key: 'LEGACY_DECLARED', label: 'Legacy declared', sensitive: true }],
    content: '# Legacy\n\n- **Topic:** [topic]\n- **Notes:** [notes]\n',
    targeting: { agents: [agents[0]], groups: [], tags: [], communities: [] },
  }).id as string
  const legacyDir = path.join(workspace, 'WORKFLOWS', 'executions', legacyWorkflow)
  fs.mkdirSync(path.join(legacyDir, 'archived'), { recursive: true })
  const legacyRecord = (id: string, status: string, topic = 'Golden Gate') => ({
    id, workflowId: legacyWorkflow, startedAt: '2026-10-01T00:00:00.000Z', completedAt: '2026-10-01T00:01:00.000Z', status, triggerType: 'manual',
    participants: [{ agentId: agents[0], agentName: agents[0], status: 'completed', response: 'Earlier result' }],
    logs: ['Workflow triggered'],
    outputs: { report: { type: 'text', summary: 'Earlier report' } },
    inputs: {
      Topic: topic,
      'Run Instructions': 'Cite sources',
      prompt: 'Summarize the week',
      OPENAI_API_KEY: canary(`${id}-openai`),
      'Custom Service Credential': canary(`${id}-custom`),
      LEGACY_DECLARED: canary(`${id}-declared`),
      CLI_INPUT: canary(`${id}-unknown-key`),
      Notes: `sk-${canary(`${id}-shaped-like-a-key`)}`,
    },
  })
  // A vault key named like a field ("Topic") replaced that field's value; nothing can tell them apart.
  const collidedTopic = canary('collided-topic')
  const outside = path.join(home, 'outside-record.json')
  fs.writeFileSync(outside, JSON.stringify(legacyRecord('legacy-6', 'completed'), null, 2))
  const legacyFiles = {
    current: path.join(legacyDir, 'legacy-1.json'),
    archived: path.join(legacyDir, 'archived', 'legacy-2.json'),
    running: path.join(legacyDir, 'legacy-3.json'),
    corrupt: path.join(legacyDir, 'legacy-4.json'),
    collided: path.join(legacyDir, 'legacy-5.json'),
  }
  fs.writeFileSync(legacyFiles.current, JSON.stringify(legacyRecord('legacy-1', 'completed'), null, 2))
  fs.writeFileSync(legacyFiles.archived, JSON.stringify(legacyRecord('legacy-2', 'completed'), null, 2))
  fs.writeFileSync(legacyFiles.running, JSON.stringify(legacyRecord('legacy-3', 'running'), null, 2))
  fs.writeFileSync(legacyFiles.corrupt, `{ "inputs": { "OPENAI_API_KEY": "${canary('corrupt')}" `)
  fs.writeFileSync(legacyFiles.collided, JSON.stringify(legacyRecord('legacy-5', 'completed', collidedTopic), null, 2))
  fs.symlinkSync(outside, path.join(legacyDir, 'legacy-6.json'))

  // History, archived history, detail, the docs reader, and the workspace export.
  const app = express()
  app.use(express.json())
  app.use('/api/workflows', require('../routes/workflows').default)
  app.use('/api/docs', require('../routes/docs').default)
  app.use('/api/workspaces', require('../routes/workspaces').default)
  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const origin = `http://127.0.0.1:${(server.address() as any).port}`
    const base = `${origin}/api/workflows`
    const read = async (url: string) => {
      const response = await fetch(url)
      assert.equal(response.status, 200, url)
      return response.text()
    }
    const responses = [
      await read(`${base}/${succeeding}/executions`),
      await read(`${base}/${succeeding}/executions/${success.executionId}`),
      await read(`${base}/${legacyWorkflow}/executions?limit=50`),
      await read(`${base}/${legacyWorkflow}/executions/legacy-1`),
      await read(`${base}/${legacyWorkflow}/executions/legacy-5`),
      await read(`${base}/${legacyWorkflow}/executions/archived`),
    ]
    for (const body of responses) assert.deepEqual(leakedCanaries(body), [], 'A history or detail response returned a run secret')
    assert.deepEqual(JSON.parse(responses[1]).inputs, { Topic: 'Bay Bridge', 'Run Instructions': 'Keep it short' }, 'New records return every explicit input')
    const legacyDetail = JSON.parse(responses[3])
    assert.equal(legacyDetail.inputs, undefined, 'Old records return no inputs')
    assert.deepEqual(legacyDetail.outputs, legacyRecord('legacy-1', 'completed').outputs, 'Old records keep everything else')
    assert.ok(JSON.parse(responses[2]).executions.every((run: { inputs?: unknown }) => run.inputs === undefined))
    assert.equal(JSON.parse(responses[5]).executions[0].inputs, undefined)

    // The docs reader serves workspace JSON, but not run records under any spelling or link.
    fs.mkdirSync(path.join(workspace, 'notes'), { recursive: true })
    fs.writeFileSync(path.join(workspace, 'notes', 'data.json'), '{"ok":true}')
    assert.equal((await fetch(`${origin}/api/docs/content?path=notes/data.json`)).status, 200, 'The docs reader still serves other JSON')
    fs.symlinkSync(path.join(workspace, 'WORKFLOWS', 'executions'), path.join(workspace, 'notes', 'runs'))
    for (const requested of [
      `WORKFLOWS/executions/${legacyWorkflow}/legacy-1.json`,
      `./WORKFLOWS//executions/${legacyWorkflow}/archived/legacy-2.json`,
      `workflows/Executions/${legacyWorkflow}/legacy-1.json`,
      `notes/runs/${legacyWorkflow}/legacy-1.json`,
      ` WORKFLOWS/executions/${legacyWorkflow}/legacy-1.json`,
      `WORKFLOWS/executions/${legacyWorkflow}/legacy-1.json\t`,
    ]) {
      const response = await fetch(`${origin}/api/docs/content?path=${encodeURIComponent(requested)}`)
      assert.equal(response.status, 404, `The docs reader served ${requested}`)
      assert.deepEqual(leakedCanaries(await response.text()), [])
    }
    fs.unlinkSync(path.join(workspace, 'notes', 'runs'))

    const exported = await fetch(`${origin}/api/workspaces/secrets-test/export`)
    assert.equal(exported.status, 200)
    const zipPath = path.join(home, 'export.zip')
    fs.writeFileSync(zipPath, Buffer.from(await exported.arrayBuffer()))
    const extracted = path.join(home, 'export')
    require('./archive-security').extractZipSecurely(zipPath, extracted)
    const exportedFiles: string[] = []
    const walk = (dir: string) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else exportedFiles.push(full)
    })
    walk(extracted)
    for (const file of exportedFiles) assert.deepEqual(leakedCanaries(fs.readFileSync(file, 'utf-8')), [], `The export holds a run secret in ${path.relative(extracted, file)}`)
    const exportedRecord = (relative: string) => exportedFiles.find((file) => file.endsWith(relative))
    const exportedLegacy = JSON.parse(fs.readFileSync(exportedRecord(`${legacyWorkflow}/legacy-1.json`)!, 'utf-8'))
    assert.equal(exportedLegacy.inputs, undefined, 'Exported old records have no inputs')
    assert.deepEqual(exportedLegacy.participants, legacyRecord('legacy-1', 'completed').participants, 'Exported old records keep their history')
    assert.ok(exportedRecord(`${legacyWorkflow}/archived/legacy-2.json`), 'Archived runs are exported')
    assert.deepEqual(JSON.parse(fs.readFileSync(exportedRecord(`${succeeding}/${success.executionId}.json`)!, 'utf-8')).inputs, { Topic: 'Bay Bridge', 'Run Instructions': 'Keep it short' }, 'Exported new records keep their inputs')
    assert.equal(exportedRecord('legacy-4.json'), undefined, 'A run record that cannot be parsed is left out')
    assert.equal(exportedRecord('legacy-6.json'), undefined, 'A symlinked run record is left out')

    // A folder elsewhere that links to the run records is exported as the link, not the records behind it.
    fs.symlinkSync(path.join(workspace, 'WORKFLOWS', 'executions'), path.join(workspace, 'notes', 'runs'))
    const linkedZip = path.join(home, 'export-linked.zip')
    fs.writeFileSync(linkedZip, Buffer.from(await (await fetch(`${origin}/api/workspaces/secrets-test/export`)).arrayBuffer()))
    const entries = require('child_process').execFileSync('python3', ['-I', '-c', 'import sys, zipfile; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', linkedZip], { encoding: 'utf-8' }).split('\n')
    assert.ok(entries.includes('secrets-test/notes/runs'), 'The link itself is exported')
    assert.deepEqual(entries.filter((entry: string) => entry.startsWith('secrets-test/notes/runs/')), [], 'Nothing behind the link is exported')
    fs.unlinkSync(path.join(workspace, 'notes', 'runs'))
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  pass('history, detail, docs reader and export return no inputs from old records and keep explicit inputs of new ones')

  // Explicit cleanup of stored records: a dry run changes nothing; apply rewrites only `inputs`.
  const snapshot = () => Object.fromEntries(Object.entries(legacyFiles).map(([name, file]) => [name, fs.readFileSync(file, 'utf-8')]))
  const before = snapshot()
  const outsideBefore = fs.readFileSync(outside, 'utf-8')
  const newRecordBefore = fs.readFileSync(executionFile(succeeding, success.executionId), 'utf-8')
  const kept = { Topic: 'Golden Gate', 'Run Instructions': 'Cite sources', prompt: 'Summarize the week' }
  const removed = ['OPENAI_API_KEY', 'Custom Service Credential', 'LEGACY_DECLARED', 'CLI_INPUT', 'Notes']
  const dryRun = redactStoredExecutionSecrets(workspace, { apply: false })
  const reported = (name: keyof typeof legacyFiles) => dryRun.redacted.find((entry: { file: string }) => entry.file === path.relative(workspace, legacyFiles[name]))
  for (const name of ['current', 'archived', 'running', 'collided'] as const) {
    assert.deepEqual([...reported(name).removedInputs].sort(), [...removed].sort(), `${name}: removed inputs`)
    assert.deepEqual([...reported(name).keptInputs].sort(), Object.keys(kept).sort(), `${name}: kept inputs are named for review`)
  }
  assert.equal(dryRun.redacted.length, 4, 'Only old records with removable inputs are listed; symlinks are skipped')
  assert.deepEqual(dryRun.unreadable, [path.relative(workspace, legacyFiles.corrupt)])
  assert.deepEqual(leakedCanaries(JSON.stringify(dryRun)), [], 'The cleanup report names inputs, never values')
  assert.deepEqual(snapshot(), before, 'A dry run writes nothing')

  const applied = redactStoredExecutionSecrets(workspace, { apply: true })
  assert.equal(applied.redacted.length, 4)
  for (const name of ['current', 'archived', 'running', 'collided'] as const) {
    const original = JSON.parse(before[name])
    const rewritten = JSON.parse(fs.readFileSync(legacyFiles[name], 'utf-8'))
    assert.deepEqual(rewritten, { ...original, inputs: name === 'collided' ? { ...kept, Topic: collidedTopic } : kept }, `${name}: only inputs change, and the record stays unmarked`)
    assert.deepEqual(leakedCanaries(JSON.stringify(rewritten)), name === 'collided' ? [collidedTopic] : [], `${name}: what remains after cleanup`)
  }
  assert.equal(fs.readFileSync(legacyFiles.corrupt, 'utf-8'), before.corrupt, 'An unreadable record is left for inspection')
  assert.equal(fs.readFileSync(outside, 'utf-8'), outsideBefore, 'A symlinked record is never written through')
  assert.equal(fs.readFileSync(executionFile(succeeding, success.executionId), 'utf-8'), newRecordBefore, 'New records are not rewritten')
  assert.ok(!fs.readdirSync(legacyDir).some((file) => file.endsWith('.tmp')), 'No temporary files remain')
  assert.equal(redactStoredExecutionSecrets(workspace, { apply: true }).redacted.length, 0, 'Cleanup is idempotent')
  assert.equal(getExecution(legacyWorkflow, 'legacy-5').inputsExcludeSecrets, undefined, 'Cleaned old records stay hidden from the API')
  pass('cleanup: dry run by default, rewrites only legacy inputs, reports kept names, skips symlinks and unreadable records')

  assert.deepEqual(leakedCanaries(printed.join('\n')), [], 'Server output printed a run secret')
  pass('logs: nothing printed during these runs contains a secret')
  console.log(`\nWorkflow run secret tests passed: ${passed.length}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
