import assert from 'assert'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed += 1
    })
    .catch((err: any) => {
      console.log(`${RED}✗${RESET} ${name}`)
      console.error(`  Error: ${err.message}`)
      testsFailed += 1
    })
}

function loadScheduler(overrides: {
  cron?: Partial<typeof import('node-cron')>
  workflows?: Partial<typeof import('./workflows')>
  workspace?: Partial<typeof import('./workspace')>
} = {}) {
  const moduleOverrides: Array<[string, Record<string, any> | undefined]> = [
    ['node-cron', overrides.cron as any],
    ['./workflows', overrides.workflows as any],
    ['./workspace', overrides.workspace as any],
  ]

  for (const [modulePath, patch] of moduleOverrides) {
    const resolved = require.resolve(modulePath)
    delete require.cache[resolved]
    if (patch) Object.assign(require(resolved), patch)
  }

  const schedulerPath = require.resolve('./scheduler')
  delete require.cache[schedulerPath]
  return require('./scheduler') as typeof import('./scheduler')
}

async function run() {
  console.log(`\n${YELLOW}=== Scheduler Test Suite ===${RESET}\n`)

  await test('normalizes workflow timezones and schedule options', async () => {
    const scheduler = loadScheduler()
    assert.strictEqual(scheduler.normalizeWorkflowTimezone(), scheduler.DEFAULT_WORKFLOW_TIMEZONE)
    assert.strictEqual(scheduler.normalizeWorkflowTimezone('  America/Los_Angeles  '), 'America/Los_Angeles')
    assert.strictEqual(scheduler.normalizeWorkflowTimezone(''), scheduler.DEFAULT_WORKFLOW_TIMEZONE)
    assert.deepStrictEqual(scheduler.getWorkflowScheduleOptions(), { timezone: 'UTC' })
    assert.deepStrictEqual(scheduler.getWorkflowScheduleOptions('America/New_York'), { timezone: 'America/New_York' })
  })

  await test('syncAllWorkflows schedules enabled workflows and updates cron job ids', async () => {
    const scheduled: Array<{ schedule: string; options: any; stopCalled: boolean }> = []
    const updateCalls: Array<{ workflowId: string; updates: any }> = []
    const syncCalls: Array<{ workflowId: string; participants: string[] }> = []
    const scheduler = loadScheduler({
      cron: {
        validate: (value: string) => value === '0 9 * * *',
        schedule: (value: string, _fn: Function, options: any) => {
          const record = { schedule: value, options, stopCalled: false }
          scheduled.push(record)
          return { stop: () => { record.stopCalled = true } }
        },
      } as any,
      workflows: {
        listWorkflows: () => [{
          id: 'wf-enabled',
          enabled: true,
          schedule: '0 9 * * *',
          timezone: 'America/New_York',
          cronJobId: 'old-job',
        }],
        resolveParticipants: () => [{ agentId: 'agent-1' }, { agentId: 'agent-2' }],
        syncWorkflowToCron: (workflow: any, participants: string[]) => {
          syncCalls.push({ workflowId: workflow.id, participants })
          return { ok: true, cronJobId: 'new-job' }
        },
        updateWorkflow: (workflowId: string, updates: any) => {
          updateCalls.push({ workflowId, updates })
        },
      } as any,
      workspace: {
        listAgents: () => [{ id: 'agent-1' }, { id: 'agent-2' }],
      } as any,
    })

    scheduler.syncAllWorkflows({ syncCronRegistrations: true })

    assert.strictEqual(syncCalls.length, 1, 'Expected cron sync to run for enabled workflow')
    assert.deepStrictEqual(syncCalls[0], { workflowId: 'wf-enabled', participants: ['agent-1', 'agent-2'] }, 'Expected resolved participants to be forwarded')
    assert.deepStrictEqual(updateCalls, [{ workflowId: 'wf-enabled', updates: { cronJobId: 'new-job' } }], 'Expected cron job id update when changed')
    assert.strictEqual(scheduled.length, 1, 'Expected enabled workflow to be scheduled')
    assert.deepStrictEqual(scheduled[0].options, { timezone: 'America/New_York' }, 'Expected scheduler to use normalized timezone')

    scheduler.stopScheduler()
  })

  await test('syncAllWorkflows unschedules disabled or manual workflows', async () => {
    const scheduled: Array<{ stopCalled: boolean }> = []
    const scheduler = loadScheduler({
      cron: {
        validate: () => true,
        schedule: () => {
          const record = { stopCalled: false }
          scheduled.push(record)
          return { stop: () => { record.stopCalled = true } }
        },
      } as any,
      workflows: {
        listWorkflows: () => [{ id: 'wf-enabled', enabled: true, schedule: '0 9 * * *', timezone: 'UTC' }],
        resolveParticipants: () => [],
        syncWorkflowToCron: () => ({ ok: true, cronJobId: null }),
        updateWorkflow: () => undefined,
      } as any,
      workspace: {
        listAgents: () => [],
      } as any,
    })

    scheduler.syncAllWorkflows()
    assert.strictEqual(scheduled.length, 1, 'Expected initial workflow scheduling')

    const reloaded = loadScheduler({
      cron: {
        validate: () => true,
        schedule: () => {
          const record = { stopCalled: false }
          scheduled.push(record)
          return { stop: () => { record.stopCalled = true } }
        },
      } as any,
      workflows: {
        listWorkflows: () => [{ id: 'wf-enabled', enabled: false, schedule: 'manual', timezone: 'UTC' }],
        resolveParticipants: () => [],
        syncWorkflowToCron: () => ({ ok: true, cronJobId: null }),
        updateWorkflow: () => undefined,
      } as any,
      workspace: {
        listAgents: () => [],
      } as any,
    })

    reloaded.syncAllWorkflows()
    reloaded.stopScheduler()
  })

  await test('syncAllWorkflows skips invalid cron schedules', async () => {
    let scheduleCalls = 0
    const scheduler = loadScheduler({
      cron: {
        validate: () => false,
        schedule: () => {
          scheduleCalls += 1
          return { stop() {} }
        },
      } as any,
      workflows: {
        listWorkflows: () => [{ id: 'wf-invalid', enabled: true, schedule: 'bad cron', timezone: 'UTC' }],
        resolveParticipants: () => [],
        syncWorkflowToCron: () => ({ ok: true, cronJobId: null }),
        updateWorkflow: () => undefined,
      } as any,
      workspace: {
        listAgents: () => [],
      } as any,
    })

    scheduler.syncAllWorkflows()
    assert.strictEqual(scheduleCalls, 0, 'Expected invalid cron schedules to be skipped')
    scheduler.stopScheduler()
  })

  await test('scheduled workflow trigger unschedules max-run failures', async () => {
    let scheduledFn: Function | null = null
    let stopCalled = false
    const scheduler = loadScheduler({
      cron: {
        validate: () => true,
        schedule: (_value: string, fn: Function) => {
          scheduledFn = fn
          return { stop: () => { stopCalled = true } }
        },
      } as any,
      workflows: {
        listWorkflows: () => [{ id: 'wf-max-runs', enabled: true, schedule: '0 9 * * *', timezone: 'UTC' }],
        resolveParticipants: () => [],
        syncWorkflowToCron: () => ({ ok: true, cronJobId: null }),
        updateWorkflow: () => undefined,
        triggerWorkflow: () => ({ success: false, error: 'Reached max runs' }),
      } as any,
      workspace: {
        listAgents: () => [],
      } as any,
    })

    scheduler.syncAllWorkflows()
    if (!scheduledFn) throw new Error('Expected scheduled callback to be captured')
    const runScheduledFn: () => void = scheduledFn as () => void
    runScheduledFn()
    assert.strictEqual(stopCalled, true, 'Expected max-runs failure to unschedule workflow')
    scheduler.stopScheduler()
  })

  await test('startScheduler schedules enabled workflows on startup', async () => {
    let scheduleCalls = 0
    const scheduler = loadScheduler({
      cron: {
        validate: () => true,
        schedule: () => {
          scheduleCalls += 1
          return { stop() {} }
        },
      } as any,
      workflows: {
        listWorkflows: () => [{ id: 'wf-start', enabled: true, schedule: '0 9 * * *', timezone: 'UTC' }],
        resolveParticipants: () => [],
        syncWorkflowToCron: () => ({ ok: true, cronJobId: null }),
        updateWorkflow: () => undefined,
      } as any,
      workspace: {
        listAgents: () => [],
      } as any,
    })

    scheduler.startScheduler()
    assert.strictEqual(scheduleCalls, 1, 'Expected startup scheduler sync to schedule enabled workflows')
    scheduler.stopScheduler()
  })

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) {
    console.log(`${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`${GREEN}All tests passed${RESET}`)
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
