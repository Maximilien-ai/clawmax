import assert from 'assert'
import { renderToStaticMarkup } from 'react-dom/server'
import { MobileSafeDialog } from './MobileSafeDialog'

const markup = renderToStaticMarkup(
  <MobileSafeDialog
    ariaLabelledBy="test-dialog-title"
    header={<h2 id="test-dialog-title">Dialog title</h2>}
    footer={<button type="button">Primary action</button>}
  >
    <div>Long form content</div>
  </MobileSafeDialog>
)

assert(markup.includes('role="dialog"'), 'dialog semantics should be present')
assert(markup.includes('aria-modal="true"'), 'the frame should identify itself as modal')
assert(markup.includes('100dvh'), 'the panel should use the dynamic mobile viewport')
assert(markup.includes('min-h-0 flex-1 overflow-y-auto overscroll-contain'), 'only the dialog body should scroll')
assert(markup.includes('shrink-0 border-t'), 'the action footer should stay outside the scroll region')
assert(markup.includes('safe-area-inset-bottom'), 'the footer should clear the mobile safe area')
assert(markup.indexOf('Long form content') < markup.indexOf('Primary action'), 'the action footer should follow the scrollable body')
const nestedMarkup = renderToStaticMarkup(
  <MobileSafeDialog
    ariaLabelledBy="nested-dialog-title"
    zIndexClassName="z-[130]"
    header={<h2 id="nested-dialog-title">Nested dialog</h2>}
    footer={<button type="button">Save</button>}
  >
    Nested content
  </MobileSafeDialog>
)
assert(nestedMarkup.includes('z-[130]'), 'nested editors should be able to render above their parent dialog')

console.log('MobileSafeDialog.test.tsx: 8 assertions passed')
