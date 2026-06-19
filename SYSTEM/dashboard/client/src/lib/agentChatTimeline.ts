export type AgentChatTimelineMessage = {
  id?: string
  timestamp?: number
}

export type AgentChatTimelineRow =
  | { type: 'separator'; key: string; label: string }
  | { type: 'message'; key: string; showDate: boolean }

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function formatTimelineDayLabel(dayStart: Date, now: Date): string {
  const todayStart = startOfLocalDay(now)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  if (dayStart.getTime() === todayStart.getTime()) return 'Today'
  if (dayStart.getTime() === yesterdayStart.getTime()) return 'Yesterday'

  return dayStart.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function shouldShowCalendarDate(timestamp: number | undefined, nowMs: number = Date.now()): boolean {
  if (!timestamp) return false
  const messageDay = startOfLocalDay(new Date(timestamp))
  const nowDay = startOfLocalDay(new Date(nowMs))
  return messageDay.getTime() !== nowDay.getTime()
}

export function buildAgentChatTimelineRows(
  messages: AgentChatTimelineMessage[],
  nowMs: number = Date.now()
): AgentChatTimelineRow[] {
  const now = new Date(nowMs)
  let lastDayKey: string | null = null
  const rows: AgentChatTimelineRow[] = []

  messages.forEach((message, index) => {
    const timestamp = typeof message.timestamp === 'number' ? message.timestamp : nowMs
    const dayStart = startOfLocalDay(new Date(timestamp))
    const dayKey = `${dayStart.getFullYear()}-${dayStart.getMonth()}-${dayStart.getDate()}`

    if (dayKey !== lastDayKey) {
      rows.push({
        type: 'separator',
        key: `separator-${dayKey}-${index}`,
        label: formatTimelineDayLabel(dayStart, now),
      })
      lastDayKey = dayKey
    }

    rows.push({
      type: 'message',
      key: message.id || `message-${index}`,
      showDate: shouldShowCalendarDate(timestamp, nowMs),
    })
  })

  return rows
}
