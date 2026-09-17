import assert from 'assert'
import { buildMarkdownPdf, markdownBody, pdfFileName, workspaceImagePath } from './markdownPdf'
import { createDocumentPdfSession } from './documentPdfSession'

async function main() {
  assert.equal(pdfFileName('AGENTS/demo/NOTES.MD'), 'NOTES.pdf')
  assert.equal(markdownBody('---\r\nsecret: metadata\r\n---\r\n# Title'), '# Title')
  assert.equal(workspaceImagePath('AGENTS/demo/docs/readme.md', '../image.png'), 'AGENTS/demo/image.png')
  for (const href of ['https://example.com/a.png', '//example.com/a.png', '/api/private.png', 'javascript:a.png', '../../../a.png', 'a.png?key=x', 'a.svg', 'a\\b.png']) {
    assert.equal(workspaceImagePath('AGENTS/demo/a.md', href), null)
  }
  const paths: string[] = []
  const built = await buildMarkdownPdf('---\nprivate: OMIT_ME\n---\n# Heading\n\nA **bold** and *italic* [safe](https://example.com) [bad](javascript:alert).\n\n> quote\n\n3. three\n4. four\n\n- [x] task\n\n```js\nconst x = 1\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n![missing](image.png)\n\n![remote](https://example.com/image.png)\n\n<script>alert(1)</script>', 'AGENTS/demo/readme.md', async path => { paths.push(path); return null })
  const serialized = JSON.stringify(built.definition)
  assert(!serialized.includes('OMIT_ME'))
  assert(!serialized.includes('javascript:'))
  assert(!serialized.includes('<script>'))
  assert(serialized.includes('"headerRows":1'))
  assert(serialized.includes('"start":3'))
  assert(serialized.includes('"bold":true'))
  assert(serialized.includes('const x = 1'))
  assert.deepEqual(paths, ['AGENTS/demo/image.png'])
  assert.equal(built.warnings.length, 2)
  assert.equal((await buildMarkdownPdf('', 'empty.md')).definition.content[0].text, '(Empty document)')
  await assert.rejects(buildMarkdownPdf('x'.repeat(2_000_001), 'large.md'), /too large/)
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1cAAAAASUVORK5CYII='
  const embedded = await buildMarkdownPdf(`![pixel](${png})`, 'image.md')
  assert.equal(embedded.definition.content[0].image, png)
  assert.deepEqual(embedded.warnings, [])
  const pdfMake = require('pdfmake/build/pdfmake')
  pdfMake.addVirtualFileSystem(require('pdfmake/build/vfs_fonts'))
  pdfMake.setUrlAccessPolicy(() => false)
  const bytes = await pdfMake.createPdf(built.definition).getBuffer()
  assert.equal(bytes.subarray(0, 4).toString(), '%PDF')
  assert(bytes.length > 1000)

  let count = 0
  let release!: (value: { blob: Blob; warnings: string[] }) => void
  const revoked: string[] = []
  const urls = { createObjectURL: () => 'blob:test', revokeObjectURL: (url: string) => { revoked.push(url) } }
  const pending = new Promise<{ blob: Blob; warnings: string[] }>(resolve => { release = resolve })
  const session = createDocumentPdfSession(() => { count++; return pending }, urls)
  const first = session.get()
  assert.strictEqual(session.get(), first)
  release({ blob: new Blob(['PDF']), warnings: [] })
  assert.deepEqual(await first, { url: 'blob:test', warnings: [] })
  assert.strictEqual(await session.get(), await first)
  assert.equal(count, 1)
  session.dispose(); session.dispose()
  assert.deepEqual(revoked, ['blob:test'])
  assert.equal(await session.get(), null)
  const stale = createDocumentPdfSession(() => Promise.resolve({ blob: new Blob(), warnings: [] }), urls)
  const staleResult = stale.get(); stale.dispose()
  assert.equal(await staleResult, null)
  let attempts = 0
  const retry = createDocumentPdfSession(async () => {
    if (++attempts === 1) throw new Error('temporary')
    return { blob: new Blob(), warnings: [] }
  }, urls)
  await assert.rejects(retry.get(), /temporary/)
  assert.equal((await retry.get())?.url, 'blob:test')
  retry.dispose()
  console.log('markdownPdf.test.ts: passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
