import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MarkdownDocumentViewer } from '../components/MarkdownDocumentViewer'
import { AssistantCodeBlock } from '../components/ChatCodeBlock'
import { transformWorkspaceMarkdownUrl } from './markdownLinks'

const render = (source: string, workspaceLinks = false) => renderToStaticMarkup(
  <ReactMarkdown remarkPlugins={[remarkGfm]} {...(workspaceLinks ? { urlTransform: transformWorkspaceMarkdownUrl } : {})}>{source}</ReactMarkdown>,
)

test('production document preview retains GFM tables, tasks, strikethrough and frontmatter removal', () => {
  const source = '---\nprivate: hidden-metadata\n---\n# Release report\n\n| Item | Result |\n| --- | --- |\n| Chat | **Passed** |\n\n- [x] Verified\n- [ ] Pending\n\n~~Old result~~\n\n> Saved evidence'
  const html = renderToStaticMarkup(<MarkdownDocumentViewer source={source} path="ORG/report.md" onDownloadMarkdown={() => {}} />)
  assert(html.includes('<h1>Release report</h1>'))
  assert(html.includes('<table>') && html.includes('<strong>Passed</strong>'))
  assert.equal((html.match(/type="checkbox"/g) || []).length, 2)
  assert(html.includes('disabled="" checked=""'))
  assert(html.includes('<del>Old result</del>') && html.includes('<blockquote>'))
  assert(!html.includes('hidden-metadata'))
})

test('default and workspace renderers escape raw HTML without creating executable elements', () => {
  for (const workspace of [false, true]) {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>', workspace)
    assert(!/<(?:script|img)\b/i.test(html))
    assert(html.includes('&lt;script&gt;') && html.includes('&lt;img'))
  }
})

test('default and workspace URL transforms reject executable links and data images', () => {
  for (const workspace of [false, true]) for (const url of ['javascript:alert%281%29', 'vbscript:msgbox%281%29', 'data:text/html;base64,PHNjcmlwdD4=']) {
    const html = render(`[Unsafe](${url})\n\n![Unsafe image](${url})`, workspace)
    assert(!/\b(?:href|src)="(?:javascript|vbscript|data):/i.test(html), url)
    assert(html.includes('Unsafe'))
  }
})

test('safe web, mail, relative and anchor links retain their destinations', () => {
  for (const workspace of [false, true]) for (const url of ['https://example.com/report', 'mailto:review@example.com', '/documents/report.md', '#summary']) {
    assert(render(`[Open](${url})`, workspace).includes(`href="${url}"`))
  }
})

test('workspace-file links survive only the explicit workspace URL contract', () => {
  const source = '[Report](workspace-file:ORG/report.md)'
  assert(render(source, true).includes('href="workspace-file:ORG/report.md"'))
  assert(!render(source).includes('href="workspace-file:'))
})

test('workflow brief image suppression still preserves surrounding content', () => {
  const html = renderToStaticMarkup(<ReactMarkdown components={{ img: () => null }}>{'## Brief\n\n![Hidden image](https://example.com/image.png)\n\nKeep this result.'}</ReactMarkdown>)
  assert(!html.includes('<img'))
  assert(html.includes('<h2>Brief</h2>') && html.includes('Keep this result.'))
})

test('partial streamed fences remain readable with the production code component', () => {
  for (const source of ['```json\n{"status":', '```json\n{"status":"ready"}\n```']) {
    const html = renderToStaticMarkup(<ReactMarkdown components={{ pre: AssistantCodeBlock }}>{source}</ReactMarkdown>)
    assert(html.includes('aria-label="Copy json code"'))
    assert(html.includes('<pre') && html.includes('&quot;status&quot;'))
  }
})

test('empty input and incomplete Markdown do not require async rendering', () => {
  assert.equal(render(''), '')
  for (const source of ['**Pending', '[Report](', '| Column |', '`unfinished']) assert(render(source).length > 0)
})
