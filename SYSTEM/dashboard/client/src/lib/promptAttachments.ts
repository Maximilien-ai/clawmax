export type PromptAttachment = {
  id: string
  name: string
  type: string
  size: number
  contextSnippet?: string
  isImage: boolean
}

export async function readAttachmentContext(file: File): Promise<string | undefined> {
  const lowerName = file.name.toLowerCase()
  const isTextLike = file.type.startsWith('text/')
    || lowerName.endsWith('.md')
    || lowerName.endsWith('.txt')
    || lowerName.endsWith('.json')
    || lowerName.endsWith('.csv')
    || lowerName.endsWith('.yaml')
    || lowerName.endsWith('.yml')

  if (!isTextLike) return undefined

  const text = await file.text()
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return undefined
  return compact.slice(0, 800)
}

export async function createPromptAttachment(file: File): Promise<PromptAttachment> {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    type: file.type,
    size: file.size,
    contextSnippet: await readAttachmentContext(file),
    isImage: file.type.startsWith('image/'),
  }
}

export function appendPromptAttachmentContext(basePrompt: string, attachments: PromptAttachment[]): string {
  if (!attachments.length) return basePrompt
  const lines = attachments.map((attachment) => {
    const label = attachment.isImage ? 'image' : 'file'
    const snippet = attachment.contextSnippet ? ` Context: ${attachment.contextSnippet}` : ''
    return `- ${label}: ${attachment.name}${snippet}`
  })
  return `${basePrompt}\n\nAttached context:\n${lines.join('\n')}`
}
