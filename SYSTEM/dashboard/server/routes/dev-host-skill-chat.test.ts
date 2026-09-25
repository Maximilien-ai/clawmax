import assert from 'assert'
import { devHostSkillChatEnabled } from './dev-host-skill-chat'

const env = {
  NODE_ENV: 'development', CLAWMAX_DEV_HOST_SKILL_CHAT: '1', CLAWMAX_DEV_HOST_SKILL_AUTHORITY: '1',
  DASHBOARD_APP_URL: 'http://localhost:5174', BYPASS_OAUTH: 'true',
  CLAWMAX_DEV_HOST_AUTH_KEY: 'a'.repeat(64), CLAWMAX_DEV_HOST_ACTOR_ID: 'rehearsal-actor',
  CLAWMAX_CLI_LOCAL_ACTOR_ID: 'rehearsal-actor',
}
const allowed = (candidate: NodeJS.ProcessEnv, origin = 'http://localhost:5174', peer = '127.0.0.1') => devHostSkillChatEnabled(candidate, origin, peer)
assert(allowed(env))
assert(!allowed({ ...env, NODE_ENV: 'production' }))
assert(!allowed({ ...env, CLAWMAX_DEV_HOST_SKILL_CHAT: '0' }))
assert(!allowed({ ...env, CLAWMAX_DEV_HOST_SKILL_AUTHORITY: '0' }))
assert(!allowed({ ...env, DASHBOARD_APP_URL: 'http://localhost:3201' }))
assert(!allowed({ ...env, BYPASS_OAUTH: 'false' }))
assert(!allowed({ ...env, CLAWMAX_DEV_HOST_AUTH_KEY: 'bad' }))
assert(!allowed({ ...env, CLAWMAX_CLI_LOCAL_ACTOR_ID: 'different' }))
assert(!allowed(env, 'http://evil.example'))
assert(!allowed(env, 'http://localhost:5174', '192.168.1.1'))
console.log('dev-host-skill-chat.test.ts: passed')
