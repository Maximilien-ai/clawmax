import assert from 'assert'
import {
  assertTenantResourceCapacity,
  getTenantResourceLimitConfig,
  getTenantResourceLimits,
  TenantResourceLimitError,
  tenantResourceLimitResponse,
} from './tenant-resource-limits'

const local = getTenantResourceLimits({ DASHBOARD_DEPLOYMENT_KIND: 'local' })
assert.deepStrictEqual(local, { workspaces: null, agents: null, workflows: null })

const cloud = getTenantResourceLimits({ DASHBOARD_DEPLOYMENT_KIND: 'cloud' })
assert.deepStrictEqual(cloud, { workspaces: null, agents: null, workflows: null })

const configured = getTenantResourceLimits({
  DASHBOARD_DEPLOYMENT_KIND: 'onprem',
  CLAWMAX_MAX_WORKSPACES: '2',
  CLAWMAX_MAX_AGENTS_PER_WORKSPACE: '15',
  CLAWMAX_MAX_WORKFLOWS_PER_WORKSPACE: '20',
})
assert.deepStrictEqual(configured, { workspaces: 2, agents: 15, workflows: 20 })

assert.throws(
  () => getTenantResourceLimits({ CLAWMAX_MAX_AGENTS_PER_WORKSPACE: '-1' }),
  /non-negative integer/,
)

assert.doesNotThrow(() => assertTenantResourceCapacity('agents', 1000, { DASHBOARD_DEPLOYMENT_KIND: 'cloud' }))
assert.throws(
  () => assertTenantResourceCapacity('agents', 9, { CLAWMAX_MAX_AGENTS_PER_WORKSPACE: '10' }, 2),
  (error: unknown) => error instanceof TenantResourceLimitError && error.current === 9,
)

let caught: unknown
try {
  assertTenantResourceCapacity('agents', 10, { CLAWMAX_MAX_AGENTS_PER_WORKSPACE: '10' })
} catch (error) {
  caught = error
}
assert(caught instanceof TenantResourceLimitError)
assert.deepStrictEqual(tenantResourceLimitResponse(caught), {
  statusCode: 409,
  body: {
    error: 'Tenant agents limit reached (10/10). Delete an existing agent or increase CLAWMAX_MAX_AGENTS_PER_WORKSPACE.',
    code: 'TENANT_RESOURCE_LIMIT_REACHED',
    resource: 'agents',
    limit: 10,
    current: 10,
  },
})

let customized: unknown
try {
  assertTenantResourceCapacity('agents', 5, {
    CLAWMAX_MAX_AGENTS_PER_WORKSPACE: '5',
    CLAWMAX_RESOURCE_LIMIT_UPGRADE_MESSAGE: 'You have used {current}/{limit} {resource}.',
    CLAWMAX_RESOURCE_LIMIT_UPGRADE_URL: 'https://example.com/upgrade',
  })
} catch (error) {
  customized = error
}
assert.deepStrictEqual(tenantResourceLimitResponse(customized), {
  statusCode: 409,
  body: {
    error: 'You have used 5/5 agents.',
    code: 'TENANT_RESOURCE_LIMIT_REACHED',
    resource: 'agents',
    limit: 5,
    current: 5,
    upgradeMessage: 'You have used 5/5 agents.',
    upgradeUrl: 'https://example.com/upgrade',
  },
})

assert.deepStrictEqual(
  getTenantResourceLimitConfig({ CLAWMAX_RESOURCE_LIMIT_UPGRADE_URL: 'javascript:alert(1)' }),
  { messageTemplate: null, upgradeUrl: null },
)

console.log('tenant-resource-limits.test.ts: 11 assertions passed')
