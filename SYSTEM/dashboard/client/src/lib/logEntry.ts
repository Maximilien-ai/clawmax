export interface LogEntry {
  timestamp: string
  level: string
  agent?: string
  message: string
  raw: string
}

export function parseLogLine(line: string): LogEntry {
  const time = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)(?=\s|$)/)
  const body = line.slice(time?.[0].length ?? 0).trimStart()
  const level = body.match(/^\[?(ERROR|WARN(?:ING)?|INFO|DEBUG)\b\]?\s*/i)
  const detail = body.slice(level?.[0].length ?? 0)
  const agent = detail.match(/^\[agent[:=]([\w-]+)\]/i)
  return { timestamp: time?.[1] ?? '—', level: level?.[1].toUpperCase() ?? 'INFO',
    agent: agent?.[1], message: line, raw: line }
}
