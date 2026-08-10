import assert from 'assert'
import fs from 'fs'
import path from 'path'

const root = path.resolve(process.cwd())
const chat = fs.readFileSync(path.join(root, 'server/routes/chat.ts'), 'utf8')
const channels = fs.readFileSync(path.join(root, 'server/routes/channels.ts'), 'utf8')
const workflows = fs.readFileSync(path.join(root, 'server/lib/workflows.ts'), 'utf8')
const safeEnv = fs.readFileSync(path.join(root, 'server/lib/safe-env.ts'), 'utf8')
const index = fs.readFileSync(path.join(root, 'server/index.ts'), 'utf8')
const compose = fs.readFileSync(path.resolve(root, '../..', 'docker-compose.yml'), 'utf8')

for (const [surface, source] of [['direct chat', chat], ['group/community chat', channels], ['workflow', workflows]] as const) {
  assert(source.includes('createBrokerCapabilityToken'), `${surface} should create a scoped broker capability`)
  assert(source.includes('CLAWMAX_SECRET_BROKER_TOKEN'), `${surface} should pass the capability to the agent child environment`)
  assert(source.includes('CLAWMAX_MAIL_BROKER_TOKEN'), `${surface} should pass the same scoped capability to the mail runtime`)
  assert(source.includes('CLAWMAX_MAIL_BROKER_URL'), `${surface} should expose the bounded mail runtime endpoint`)
  assert(source.includes('CLAWMAX_AGENT_ID'), `${surface} should bind execution to the current agent`)
}

assert(!safeEnv.match(/CLAWMAX_SECRET_MASTER_KEY\s*:/), 'safeEnv must never forward the encryption master key')
assert(index.includes("app.use('/api/runtime/skill-broker', skillSecretBrokerRuntimeRouter)"), 'runtime broker route should be mounted separately from dashboard authentication')
assert(index.includes("app.use('/api/skill-secret-broker', protect, skillSecretBrokerRouter)"), 'operator broker routes should require dashboard authentication')
assert(index.includes("app.use('/api/runtime/mail', createMailRuntimeRouter())"), 'runtime mail route should use capability authentication separately from dashboard authentication')
assert(compose.includes('CLAWMAX_SECRET_MASTER_KEY: ${CLAWMAX_SECRET_MASTER_KEY:-}'), 'compose should forward the operator master key explicitly')

console.log('skill-secret-runtime-wiring.test.ts: 20 assertions passed')
