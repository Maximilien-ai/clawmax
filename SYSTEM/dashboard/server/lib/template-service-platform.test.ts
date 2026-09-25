import assert from 'assert'
import { configuredTemplateRuntimePlatform } from './template-service'

const local = `${process.platform}/${process.arch === 'x64' ? 'amd64' : process.arch}`
const dev = {
  NODE_ENV: 'development', CLAWMAX_DEV_HOST_SKILL_AUTHORITY: '1',
  DASHBOARD_APP_URL: 'http://localhost:5174', CLAWMAX_DEV_HOST_TEMPLATE_PLATFORM: 'linux/arm64',
}
assert.equal(configuredTemplateRuntimePlatform(dev), 'linux/arm64')
assert.equal(configuredTemplateRuntimePlatform({ ...dev, NODE_ENV: 'production' }), local)
assert.equal(configuredTemplateRuntimePlatform({ ...dev, CLAWMAX_DEV_HOST_SKILL_AUTHORITY: '0' }), local)
assert.equal(configuredTemplateRuntimePlatform({ ...dev, DASHBOARD_APP_URL: 'http://localhost:3201' }), local)
assert.equal(configuredTemplateRuntimePlatform({ ...dev, CLAWMAX_DEV_HOST_TEMPLATE_PLATFORM: 'darwin/arm64' }), local)
console.log('template-service-platform.test.ts: passed')
