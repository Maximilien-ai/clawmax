import assert from 'assert'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownDocumentViewer } from './MarkdownDocumentViewer'

const html = renderToStaticMarkup(<MarkdownDocumentViewer source={'---\nprivate: hidden\n---\n# Readable title'} path="AGENTS/demo/readme.md" onDownloadMarkdown={() => {}} />)
assert(html.includes('Document view'))
assert(html.includes('aria-pressed="true"'))
assert(html.includes('Markdown (.md)'))
assert(html.includes('PDF (.pdf)'))
assert(html.includes('flex-wrap'))
assert(html.includes('<h1>Readable title</h1>'))
assert(!html.includes('private: hidden'))
assert(!html.includes('<iframe'))
console.log('MarkdownDocumentViewer.test.tsx: passed')
