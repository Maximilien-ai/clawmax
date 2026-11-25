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
const linked = renderToStaticMarkup(<MarkdownDocumentViewer source={'[Sibling](./next%20page.md) ![Pixel](../pixel.png) [External](https://example.com)'} path="AGENTS/demo/readme.md" onOpenDocument={() => {}} onDownloadMarkdown={() => {}} />)
assert(linked.includes('>Sibling</button>'))
assert(linked.includes('Pixel (image unavailable)'))
assert(linked.includes('href="https://example.com"'))
console.log('MarkdownDocumentViewer.test.tsx: passed')
