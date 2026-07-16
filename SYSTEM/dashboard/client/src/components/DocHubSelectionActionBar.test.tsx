import assert from 'assert'
import { renderToStaticMarkup } from 'react-dom/server'
import { DocHubSelectionActionBar } from './DocHubSelectionActionBar'

const actions = { onMove: () => {}, onDelete: () => {}, onClear: () => {} }
const multiple = renderToStaticMarkup(<DocHubSelectionActionBar selectedCount={3} canMove {...actions} />)

assert(multiple.includes('sticky top-0 z-20'), 'selection actions should remain visible')
assert(multiple.includes('3 files selected'), 'multiple selection count should be explicit')
assert(multiple.includes('grid grid-cols-2'), 'actions should fit narrow sidebars predictably')
assert(multiple.includes('Move selected'), 'move action should identify its selection scope')
assert(multiple.includes('Delete selected'), 'delete action should identify its selection scope')
assert(multiple.includes('aria-label="Clear selected uploads"'), 'clear action should be accessible')

const single = renderToStaticMarkup(<DocHubSelectionActionBar selectedCount={1} canMove={false} {...actions} />)
assert(single.includes('1 file selected'), 'single selection count should be grammatical')
assert(single.includes('disabled=""'), 'move should be disabled across incompatible boundaries')
assert.strictEqual(renderToStaticMarkup(<DocHubSelectionActionBar selectedCount={0} canMove {...actions} />), '')

console.log('DocHubSelectionActionBar.test.tsx: 9 assertions passed')
