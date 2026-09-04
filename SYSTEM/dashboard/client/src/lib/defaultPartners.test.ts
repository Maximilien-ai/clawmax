import assert from 'assert'
import { DEFAULT_PARTNER_DEFINITIONS, DEFAULT_VISIBLE_PARTNERS } from './defaultPartners'

const agentforge = DEFAULT_PARTNER_DEFINITIONS.find((partner) => partner.slug === 'agentforge')

assert(DEFAULT_VISIBLE_PARTNERS.includes('agentforge'), 'Expected AgentForge in the resilient visible-partner fallback')
assert(agentforge, 'Expected AgentForge in the resilient partner-definition fallback')
assert(agentforge.fields?.some((field) => field.key === 'apiKey' && field.secret === true && field.storage === 'server'), 'Expected AgentForge server-managed Partner API key')
assert(agentforge.fields?.some((field) => field.key === 'apiUrl' && field.secret !== true), 'Expected AgentForge API base URL')
assert(agentforge.fields?.some((field) => field.key === 'privacyUrl' && field.secret !== true), 'Expected AgentForge privacy URL')
assert(/explicitly consent/i.test(agentforge.validation?.helperText || ''), 'Expected AgentForge fallback to preserve the consent boundary')
assert.strictEqual(
  agentforge.docsUrl,
  'https://github.com/Maximilien-ai/clawmax/blob/main/PARTNERS/agentforge/PARTNER.md',
  'Expected AgentForge fallback to link its specific public setup document',
)

console.log('defaultPartners.test.ts: ok')
