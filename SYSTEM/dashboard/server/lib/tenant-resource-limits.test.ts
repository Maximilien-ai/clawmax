import assert from 'assert'
import {
  assertTenantResourceCapacity,
  getTenantResourceLimits,
  TenantResourceLimitError,
  tenantResourceLimitResponse,
} from './tenant-resource-limits'

const local = getTenantResourceLimits({ DASHBOARD_DEPLOYMENT_KIND: 'local' })
assert.deepStrictEqual(local, { workspaces: null, agents: null, workflows: null })

const cloud = getTenantResourceLimits({ DASHBOARD_DEPLOYMENT_KIND: 'cloud' })
assert.deepStrictEqual(cloud, { workspaces: 1, agents: 10, workflows: 10 })

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

assert.doesNotThrow(() => assertTenantResourceCapacity('agents', 9, { DASHBOARD_DEPLOYMENT_KIND: 'cloud' }))
assert.throws(
  () => assertTenantResourceCapacity('agents', 9, { CLAWMAX_MAX_AGENTS_PER_WORKSPACE: '10' }, 2),
  (error: unknown) => error instanceof TenantResourceLimitError && error.current === 9,
)

let caught: unknown
try {
  assertTenantResourceCapacity('agents', 10, { DASHBOARD_DEPLOYMENT_KIND: 'cloud' })
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

console.log('tenant-resource-limits.test.ts: 8 assertions passed')
