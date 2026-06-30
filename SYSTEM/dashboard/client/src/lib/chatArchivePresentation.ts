export interface ChatArchiveSummary {
  active?: boolean
  filename: string
  messageCount: number
  timestamp: number
  title: string
}

export type ChatArchiveOpenMode = 'archive' | 'current'

export function isCurrentChatArchive(archive: Pick<ChatArchiveSummary, 'active' | 'filename'>): boolean {
  return archive.active === true || archive.filename.startsWith('current:')
}

export function getChatArchiveOpenMode(archive: Pick<ChatArchiveSummary, 'active' | 'filename'>): ChatArchiveOpenMode {
  return isCurrentChatArchive(archive) ? 'current' : 'archive'
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

export function getChatArchiveStatusLabel(archive: Pick<ChatArchiveSummary, 'active' | 'filename'>): string | null {
  return isCurrentChatArchive(archive) ? 'Current' : null
}

export function sortChatArchivesForDisplay<T extends Pick<ChatArchiveSummary, 'active' | 'filename' | 'timestamp'>>(archives: T[]): T[] {
  return [...archives].sort((left, right) => {
    const leftCurrent = isCurrentChatArchive(left)
    const rightCurrent = isCurrentChatArchive(right)
    if (leftCurrent && !rightCurrent) return -1
    if (!leftCurrent && rightCurrent) return 1
    return right.timestamp - left.timestamp
  })
}
