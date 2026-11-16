import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, 'pages/Templates.tsx'), 'utf8')
const start = source.indexOf('function TemplateCard(')
assert.ok(start >= 0, 'TemplateCard must exist')
const card = source.slice(start, source.indexOf('\nfunction ', start + 1))
const headerStart = card.indexOf('<div className="mb-2 flex')
const headerEnd = card.indexOf('{template.description &&')
assert.ok(headerStart >= 0 && headerEnd > headerStart, 'The card header (before the description) must be found; update these anchors if the card was restructured')
const header = card.slice(headerStart, headerEnd)

assert.match(header, /^<div className="mb-2 flex items-center justify-between gap-2">/,
  'Icon, title and actions must share one centerline, for one-line and two-line titles alike')
assert.doesNotMatch(header, /items-(start|end|baseline)|self-(start|end|baseline)|\b-?m[ty]-\d/,
  'No top alignment or per-element nudge may pull the icon, title or actions off the shared centerline')
assert.match(header, /line-clamp-2/,
  'Long template names wrap to two lines and then truncate')
assert.match(header, /\$\{selectionMode && onToggleSelect \? 'pr-6' : ''\}/,
  'The gutter for the selection checkbox is reserved only while the checkbox is shown')
assert.match(header, /aria-label="Apply template"[\s\S]*aria-label="Delete template"/,
  'The emoji-only apply and delete buttons need accessible names')

console.log('Template card header layout tests passed')
