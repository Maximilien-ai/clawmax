import assert from 'assert'
import { renderToStaticMarkup } from 'react-dom/server'
import { DocHubTreePaneLayout } from './DocHubTreePaneLayout'

const markup = renderToStaticMarkup(
  <DocHubTreePaneLayout toolbar={<button type="button">Move selected</button>}>
    <div>Scrollable documents</div>
  </DocHubTreePaneLayout>
)

assert(markup.includes('data-testid="dochub-tree-toolbar"'), 'toolbar region should be explicit')
assert(markup.includes('class="shrink-0"'), 'toolbar should remain outside the shrinking scroll viewport')
assert(markup.includes('data-testid="dochub-tree-scroll-region"'), 'tree scroll region should be explicit')
assert(markup.includes('min-h-0 flex-1 overflow-y-auto'), 'only the tree viewport should own vertical scrolling')
assert(markup.indexOf('Move selected') < markup.indexOf('dochub-tree-scroll-region'), 'selection actions should render before the scroll region')
assert(markup.indexOf('Scrollable documents') > markup.indexOf('dochub-tree-scroll-region'), 'document entries should render inside the scroll region')

console.log('DocHubTreePaneLayout.test.tsx: 6 assertions passed')
