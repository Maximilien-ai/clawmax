import assert from 'assert'
import { appendPromptAttachmentContext, createPromptAttachment, readAttachmentContext } from './promptAttachments'

async function main() {
  const textFile = new File(['  hello   world \n second line  '], 'notes.md', { type: 'text/markdown' })
  const imageFile = new File(['binary'], 'photo.png', { type: 'image/png' })

  const snippet = await readAttachmentContext(textFile)
  assert.strictEqual(snippet, 'hello world second line')

  const noSnippet = await readAttachmentContext(imageFile)
  assert.strictEqual(noSnippet, undefined)

  const attachment = await createPromptAttachment(textFile)
  assert.strictEqual(attachment.name, 'notes.md')
  assert.strictEqual(attachment.isImage, false)
  assert.strictEqual(attachment.contextSnippet, 'hello world second line')

  const combined = appendPromptAttachmentContext('Build me a support workflow', [
    attachment,
    {
      id: 'image-1',
      name: 'photo.png',
      type: 'image/png',
      size: 6,
      isImage: true,
    },
  ])

  assert(combined.includes('Build me a support workflow'))
  assert(combined.includes('Attached context:'))
  assert(combined.includes('- file: notes.md Context: hello world second line'))
  assert(combined.includes('- image: photo.png'))

  console.log('promptAttachments.test.ts: ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
