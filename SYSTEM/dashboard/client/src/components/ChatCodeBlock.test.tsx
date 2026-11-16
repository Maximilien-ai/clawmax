import assert from 'assert'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AssistantCodeBlock, UserCodeBlock } from './ChatCodeBlock'
import { getCodeBlockContent, type MarkdownNode } from '../lib/agentChatMarkdown'
import { copyText } from '../lib/clipboard'
import { transformWorkspaceMarkdownUrl } from '../lib/markdownLinks'
import { linkifyWorkspaceFiles } from '../lib/workspaceFiles'

// Rendered exactly as the chat panel renders a reply, keeping each block's node: the Copy button
// copies getCodeBlockContent(node).code.
function render(markdown: string, role: 'assistant' | 'user' = 'assistant') {
  const nodes: Array<MarkdownNode | undefined> = []
  const Block = role === 'user' ? UserCodeBlock : AssistantCodeBlock
  const html = renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={transformWorkspaceMarkdownUrl} components={{ pre: (props) => { nodes.push(props.node); return <Block {...props} /> } }}>
      {linkifyWorkspaceFiles(markdown)}
    </ReactMarkdown>,
  )
  return { html, copied: nodes.map((node) => getCodeBlockContent(node)) }
}

const blocks: Array<[string | null, string]> = [
  ['json', '{\n  "id": 42,\n  "tags": ["a", "b"]\n}'],
  ['python', 'def greet(name):\n    if name:\n        return f"hi {name}"\n\n    return None'],
  ['bash', 'set -euo pipefail\ncat config.json | jq .   \n\tprintf "%s\\n" done'],
  ['yaml', 'services:\n  web:\n    image: nginx:1.27\n    ports:\n      - "80:80"'],
  ['sql', 'SELECT id, name\nFROM users\nWHERE active = true;'],
  [null, 'plain text block\n  keeps its indent'],
]
const markdown = [
  'Here is the setup, see notes.md:',
  ...blocks.map(([language, code]) => `\`\`\`${language ?? ''}\n${code}\n\`\`\`\n\nThen the next step.`),
  'Done. Inline `npm test` is not a block.',
].join('\n\n')
const { html, copied } = render(markdown)

assert.deepStrictEqual(copied, blocks.map(([language, code]) => ({ language, code })), 'Copy takes the exact code: no fence, no language, no prose; indentation, tabs, blank lines and trailing spaces intact')
for (const [language] of blocks) {
  assert(html.includes(`aria-label="${language ? `Copy ${language} code` : 'Copy code'}"`), `A ${language ?? 'plain'} block has a labelled Copy button`)
}
assert.strictEqual(html.match(/<button type="button"/g)?.length, blocks.length, 'Every fenced block has exactly one Copy button; inline code has none')
assert(html.includes('<span class="truncate font-mono">json</span>'), 'The language is shown in the block header')
assert(html.includes('aria-live="polite"'), 'Copy results are announced to screen readers')
assert(html.includes('[notes.md](workspace-file:notes.md)') === false && html.includes('href="workspace-file:notes.md"'), 'File links in prose still render as links')
assert(html.includes('cat config.json | jq .'), 'A file name inside a code block is shown as written, not as link syntax')

// A longer fence can show a shorter one; the inner fence is code.
const nested = render('````markdown\n```json\n{"a": 1}\n```\n````')
assert.deepStrictEqual(nested.copied, [{ language: 'markdown', code: '```json\n{"a": 1}\n```' }])

// User bubbles get the same control.
const user = render('```ts\nconst x = 1\n```', 'user')
assert.deepStrictEqual(user.copied, [{ language: 'ts', code: 'const x = 1' }])
assert(user.html.includes('aria-label="Copy ts code"'))

async function clipboardCases() {
  const written: string[] = []
  await copyText('raw code', { clipboard: { writeText: async (text) => { written.push(text) } } })
  assert.deepStrictEqual(written, ['raw code'], 'The Clipboard API gets the text unchanged')

  // Over plain HTTP on another host there is no Clipboard API; a denied permission rejects it.
  const fallback = (execResult: boolean) => {
    const state = { appended: 0, removed: 0, selected: '', value: '' }
    const textarea = {
      value: '', style: {} as Record<string, string>,
      setAttribute() {},
      select() { state.selected = textarea.value },
      remove() { state.removed += 1 },
    }
    const document = {
      body: { appendChild: () => { state.appended += 1 } },
      createElement: () => textarea,
      execCommand: (command: string) => command === 'copy' && execResult,
    }
    return { state, document: document as unknown as Document }
  }
  const denied = { writeText: async () => { throw new Error('NotAllowedError') } }
  const ok = fallback(true)
  await copyText('line 1\n  line 2', { clipboard: denied, document: ok.document })
  assert.strictEqual(ok.state.selected, 'line 1\n  line 2', 'The selection fallback copies the same text')
  assert.deepStrictEqual([ok.state.appended, ok.state.removed], [1, 1], 'The helper textarea is always removed')

  const blocked = fallback(false)
  await assert.rejects(copyText('x', { document: blocked.document }), /denied/, 'A refused copy rejects, so the button can say it failed')
  assert.strictEqual(blocked.state.removed, 1)
  await assert.rejects(copyText('x', {}), /not available/, 'No clipboard at all rejects')
}

clipboardCases().then(() => console.log('ChatCodeBlock.test.tsx: passed'), (err) => { console.error(err); process.exit(1) })
