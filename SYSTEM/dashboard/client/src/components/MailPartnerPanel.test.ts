import assert from 'assert'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.join(__dirname, 'ByokWizard.tsx'), 'utf8')

assert(source.includes('loadMailOAuthStatus()'), 'mail partner status should load from the authenticated server route')
assert(source.includes('beginMailOAuthConnection(provider'), 'mail partner connect should start the bounded OAuth flow')
assert(source.includes("'mail.read.metadata'"), 'mail partner connect should request metadata capability')
assert(source.includes("'mail.read.body'"), 'mail partner connect should request body capability explicitly')
assert(source.includes("'mail.draft.create'"), 'mail partner connect should request draft capability explicitly')
assert(!source.includes("'mail.send'"), 'mail partner UI must not request send capability')
assert(source.includes("event.source !== mailOAuthPopupRef.current"), 'OAuth popup completion should be bound to the opened popup')
assert(source.includes('Reconnect required'), 'expired connections should have an actionable state')
assert(source.includes('refreshMailOAuthConnection(provider, accountId)'), 'connected accounts should support encrypted token refresh')
assert(source.includes('disconnectMailOAuthConnection(provider, accountId)'), 'connected accounts should support disconnect')
assert(source.includes('CLAWMAX_SECRET_MASTER_KEY'), 'missing encrypted storage should identify the operator prerequisite')
assert(source.includes('No account connected to this workspace.'), 'empty connected-account state should be explicit')
assert(source.includes('loadMailGrantStatus()'), 'mail partner status should include persisted agent grants')
assert(source.includes('createMailGrant({ agentId, provider, accountId, capabilities })'), 'operators should be able to authorize an agent for a connected account')
assert(source.includes('revokeMailGrant(grantId)'), 'operators should be able to revoke agent mail access immediately')
assert(source.includes('Assign the clawmax-mail skill'), 'mail authorization should explain the required agent skill')
assert(source.includes('Read message bodies'), 'body access should be an explicit grant checkbox')
assert(source.includes('Create unsent drafts'), 'draft creation should be an explicit grant checkbox')

console.log('MailPartnerPanel.test.ts: 18 assertions passed')
