import assert from 'assert'
import { DASHBOARD_TERMS_SECTIONS, DASHBOARD_TERMS_UPDATED_AT } from '../content/termsOfService'

function run() {
  assert(DASHBOARD_TERMS_UPDATED_AT.length > 0, 'Expected a dashboard terms updated date')
  assert(DASHBOARD_TERMS_SECTIONS.length >= 5, 'Expected dashboard terms to include multiple sections')
  assert(DASHBOARD_TERMS_SECTIONS.some((section) => section.title.includes('External Skills')), 'Expected terms to cover external skills')
  assert(DASHBOARD_TERMS_SECTIONS.some((section) => section.title.includes('Machine Commands')), 'Expected terms to cover machine commands/setup')
  assert(DASHBOARD_TERMS_SECTIONS.some((section) => section.title.includes('Imported Agents')), 'Expected terms to cover imported agents or bundles')

  for (const section of DASHBOARD_TERMS_SECTIONS) {
    assert(section.title.trim().length > 0, 'Expected section title')
    assert(section.body.length > 0, `Expected body paragraphs for ${section.title}`)
  }

  console.log('All tests passed')
  console.log('Tests passed: 6')
}

run()
