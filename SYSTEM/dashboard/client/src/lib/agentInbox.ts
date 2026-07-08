import type { PromptAttachment } from './promptAttachments'

export interface AgentInboxAttachmentRef extends Pick<PromptAttachment, 'name' | 'contextSnippet' | 'isImage'> {
  uploadedPath?: string
}

export type SharedInboxTargetType = 'group' | 'community'

export function buildAgentInboxTargetPath(agentId: string, subdir?: string): string {
  const normalizedAgentId = `${agentId || ''}`.trim().replace(/^\/+|\/+$/g, '')
  const normalizedSubdir = `${subdir || ''}`.trim().replace(/^\/+|\/+$/g, '')
  const base = `AGENTS/${normalizedAgentId}/INBOX`
  return normalizedSubdir ? `${base}/${normalizedSubdir}` : base
}

export function buildSharedInboxTargetPath(type: SharedInboxTargetType, name: string, subdir?: string): string {
  const normalizedName = `${name || ''}`.trim().replace(/^\/+|\/+$/g, '')
  const normalizedSubdir = `${subdir || ''}`.trim().replace(/^\/+|\/+$/g, '')
  const root = type === 'community' ? 'COMMUNITIES' : 'GROUPS'
  const base = `${root}/${normalizedName}/INBOX`
  return normalizedSubdir ? `${base}/${normalizedSubdir}` : base
}

export function buildAgentInboxDisplayMessage(baseMessage: string, attachments: AgentInboxAttachmentRef[]): string {
  const normalizedBase = baseMessage.trim()
  const uploadedAttachments = attachments.filter((attachment) => !!attachment.uploadedPath)
  if (!uploadedAttachments.length) return normalizedBase

  const lines = uploadedAttachments.map((attachment) => `- ${attachment.uploadedPath}`)
  const prefix = normalizedBase || 'Please review the attached inbox files.'
  return `${prefix}\n\nInbox files:\n${lines.join('\n')}`
}

export function appendAgentInboxAttachmentContext(baseMessage: string, attachments: AgentInboxAttachmentRef[]): string {
  const normalizedBase = baseMessage.trim() || 'Please review the attached inbox files.'
  const uploadedAttachments = attachments.filter((attachment) => !!attachment.uploadedPath)
  if (!uploadedAttachments.length) return normalizedBase

  const lines = uploadedAttachments.map((attachment) => {
    const label = attachment.isImage ? 'image' : 'file'
    const snippet = attachment.contextSnippet ? ` Context: ${attachment.contextSnippet}` : ''
    return `- ${label}: ${attachment.uploadedPath}${snippet}`
  })

  return `${normalizedBase}\n\nAgent inbox files:\n${lines.join('\n')}`
}
