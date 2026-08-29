import assert from 'assert'
import { DEFAULT_PARTNER_DEFINITIONS, DEFAULT_VISIBLE_PARTNERS } from './defaultPartners'

const agentforge = DEFAULT_PARTNER_DEFINITIONS.find((partner) => partner.slug === 'agentforge')

assert(DEFAULT_VISIBLE_PARTNERS.includes('agentforge'), 'Expected AgentForge in the resilient visible-partner fallback')
assert(agentforge, 'Expected AgentForge in the resilient partner-definition fallback')
assert((agentforge.fields || []).length === 0, 'Catalog-only AgentForge fallback must not expose inactive export configuration fields')
assert(!agentforge.validation, 'Catalog-only AgentForge fallback must not imply connection validation is available')
assert(/planned opt-in/i.test(agentforge.description), 'Expected AgentForge fallback to disclose planned status')
assert.strictEqual(
  agentforge.docsUrl,
  'https://github.com/Maximilien-ai/clawmax/blob/main/PARTNERS/agentforge/PARTNER.md',
  'Expected AgentForge fallback to link its specific public setup document',
)

console.log('defaultPartners.test.ts: ok')
