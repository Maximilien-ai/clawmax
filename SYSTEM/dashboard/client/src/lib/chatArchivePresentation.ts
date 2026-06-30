export interface ChatArchiveSummary {
  active?: boolean
  filename: string
  messageCount: number
  timestamp: number
  title: string
}

export function isCurrentChatArchive(archive: Pick<ChatArchiveSummary, 'active' | 'filename'>): boolean {
  return archive.active === true || archive.filename.startsWith('current:')
}

export function canRestoreChatArchive(archive: Pick<ChatArchiveSummary, 'active' | 'filename'>): boolean {
  return !isCurrentChatArchive(archive)
}

export function formatChatArchiveTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 'Unknown date'
  }
  return new Date(timestamp).toLocaleString()
}

export function getChatArchiveTitle(archive: Pick<ChatArchiveSummary, 'title'>): string {
  const title = archive.title.trim()
  return title || 'Untitled conversation'
}
