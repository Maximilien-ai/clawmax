import assert from 'assert'
import { filterPartnersByCategory, formatPartnerCategoryLabel, getPartnerCategories, getPartnerLogoClass, groupPartnersByCategory, listPartnerCategoryTabs } from './partnerCatalog'

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
  assert.equal(formatPartnerCategoryLabel('all'), 'All')
  assert.equal(formatPartnerCategoryLabel('other'), 'Other')
})

test('supports multi-category partners for tabs and filtering', () => {
  const github = { slug: 'github', name: 'GitHub', category: 'delivery', categories: ['delivery', 'context'] }
  assert.deepEqual(getPartnerCategories(github), ['delivery', 'context'])

  const tabs = listPartnerCategoryTabs([
    github,
    { slug: 'resend', name: 'Resend', category: 'communications' },
  ])
  assert.deepEqual(tabs, ['all', 'delivery', 'communications', 'context'])

  const contextPartners = filterPartnersByCategory([
    github,
    { slug: 'resend', name: 'Resend', category: 'communications' },
  ], 'context')
  assert.deepEqual(contextPartners.map((partner) => partner.slug), ['github'])
})

test('resend wordmark uses a smaller compact logo class than standard square-ish logos', () => {
  assert(getPartnerLogoClass('resend').includes('h-4'), 'Expected resend compact logo to use reduced height')
  assert(getPartnerLogoClass('github').includes('h-5'), 'Expected github compact logo to keep a taller compact height')
})

test('github compact wordmark gets a narrower class to offset asset whitespace', () => {
  assert(getPartnerLogoClass('github').includes('max-w-[78px]'), 'Expected github compact logo width tuning')
  assert(getPartnerLogoClass('senso').includes('max-w-[72px]'), 'Expected senso compact logo width tuning')
})

test('partner logo chips stay readable in dark mode for dark wordmarks', () => {
  assert(getPartnerLogoClass('opik').includes('dark:bg-white'), 'Expected default partner logos to render on a white chip in dark mode')
  assert(getPartnerLogoClass('resend').includes('dark:bg-white'), 'Expected Resend logo to render on a white chip in dark mode')
  assert(getPartnerLogoClass('opik', 'hero').includes('dark:bg-white'), 'Expected hero partner logos to render on a white chip in dark mode')
})

console.log('partnerCatalog.test.ts: ok')
