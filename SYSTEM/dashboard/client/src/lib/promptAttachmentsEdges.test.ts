import assert from 'assert'
import {
  appendPromptAttachmentContext,
  createPromptAttachment,
  readAttachmentContext,
} from './promptAttachments'

async function main() {
  const jsonFile = new File(['{\n  "topic": "support",\n  "priority": "high"\n}\n'], 'config.json', { type: '' })
  const blankTextFile = new File(['   \n\t  '], 'empty.md', { type: 'text/markdown' })
  const largeText = 'a'.repeat(900)
  const largeFile = new File([largeText], 'long.txt', { type: 'text/plain' })

  const jsonSnippet = await readAttachmentContext(jsonFile)
  assert.strictEqual(jsonSnippet, '{ "topic": "support", "priority": "high" }')

  const blankSnippet = await readAttachmentContext(blankTextFile)
  assert.strictEqual(blankSnippet, undefined)

  const largeSnippet = await readAttachmentContext(largeFile)
  assert.strictEqual(largeSnippet?.length, 800)
  assert.strictEqual(largeSnippet, 'a'.repeat(800))

  const imageLikeTextAttachment = await createPromptAttachment(new File(['diagram'], 'diagram.svg', { type: 'image/svg+xml' }))
  assert.strictEqual(imageLikeTextAttachment.isImage, true)
  assert.strictEqual(imageLikeTextAttachment.contextSnippet, undefined)

  const unchanged = appendPromptAttachmentContext('Base prompt only', [])
  assert.strictEqual(unchanged, 'Base prompt only')

  const combined = appendPromptAttachmentContext('Draft response', [
    {
      id: 'file-1',
      name: 'config.json',
      type: 'application/json',
      size: 40,
      contextSnippet: '{ "topic": "support" }',
      isImage: false,
    },
    {
      id: 'image-1',
      name: 'diagram.svg',
      type: 'image/svg+xml',
      size: 7,
      isImage: true,
      contextSnippet: undefined,
    },
  ])

  assert(combined.includes('- file: config.json Context: { "topic": "support" }'))
  assert(combined.includes('- image: diagram.svg'))

  console.log('promptAttachmentsEdges.test.ts: 6 tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
