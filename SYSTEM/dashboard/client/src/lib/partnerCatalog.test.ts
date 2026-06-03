import assert from 'assert'
import { formatPartnerCategoryLabel, groupPartnersByCategory } from './partnerCatalog'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('groups partners by category in a stable product-facing order', () => {
  const grouped = groupPartnersByCategory([
    { slug: 'resend', name: 'Resend', category: 'communications' },
    { slug: 'github', name: 'GitHub', category: 'delivery' },
    { slug: 'senso', name: 'Senso', category: 'context' },
    { slug: 'opik', name: 'Opik', category: 'monitoring' },
  ])

  assert.deepEqual(grouped.map((entry) => entry.category), ['delivery', 'communications', 'context', 'monitoring'])
  assert.deepEqual(grouped[0].partners.map((partner) => partner.slug), ['github'])
  assert.deepEqual(grouped[1].partners.map((partner) => partner.slug), ['resend'])
})

test('formats partner category labels for display', () => {
  assert.equal(formatPartnerCategoryLabel('communications'), 'Communications')
  assert.equal(formatPartnerCategoryLabel('other'), 'Other')
})

console.log('partnerCatalog.test.ts: ok')
