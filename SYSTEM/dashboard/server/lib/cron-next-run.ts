const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
}

const DAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
}

const WEEKDAY_PARTS: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()

type ZonedDateParts = {
  minute: number
  hour: number
  dayOfMonth: number
  month: number
  dayOfWeek: number
}

type CronField = {
  any: boolean
  values: Set<number>
}

function normalizeToken(raw: string, names?: Record<string, number>): string {
  if (!names) return raw
  return raw.replace(/[A-Za-z]{3}/g, match => {
    const mapped = names[match.toLowerCase()]
    return mapped != null ? String(mapped) : match
  })
}

function parseCronField(
  field: string,
  min: number,
  max: number,
  names?: Record<string, number>,
  normalizeValue?: (value: number) => number
): CronField {
  const normalized = normalizeToken(field.trim(), names)
  if (normalized === '*') return { any: true, values: new Set() }

  const values = new Set<number>()
  const segments = normalized.split(',')

  for (const segment of segments) {
    const [base, stepPart] = segment.split('/')
    const step = stepPart ? Number(stepPart) : 1
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`Invalid cron step "${segment}"`)
    }

    let rangeStart = min
    let rangeEnd = max

    if (base !== '*') {
      const [startRaw, endRaw] = base.split('-')
      rangeStart = Number(startRaw)
      rangeEnd = endRaw != null ? Number(endRaw) : rangeStart
      if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd)) {
        throw new Error(`Invalid cron range "${segment}"`)
      }
    }

    if (rangeStart > rangeEnd || rangeStart < min || rangeEnd > max) {
      throw new Error(`Cron range out of bounds "${segment}"`)
    }

    for (let value = rangeStart; value <= rangeEnd; value += step) {
      const normalizedValue = normalizeValue ? normalizeValue(value) : value
      values.add(normalizedValue)
    }
  }

  return { any: false, values }
}

function getDateFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = dateFormatterCache.get(timezone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
  dateFormatterCache.set(timezone, formatter)
  return formatter
}

function normalizeCronTimezone(timezone?: string): string {
  const normalized = `${timezone || ''}`.trim() || 'UTC'
  try {
    getDateFormatter(normalized).format(new Date())
    return normalized
  } catch {
    return 'UTC'
  }
}

function getZonedDateParts(date: Date, timezone: string): ZonedDateParts {
  const parts = getDateFormatter(timezone).formatToParts(date)
  const weekday = parts.find((part) => part.type === 'weekday')?.value?.slice(0, 3).toLowerCase() || 'sun'
  return {
    minute: Number(parts.find((part) => part.type === 'minute')?.value || 0),
    hour: Number(parts.find((part) => part.type === 'hour')?.value || 0),
    dayOfMonth: Number(parts.find((part) => part.type === 'day')?.value || 1),
    month: Number(parts.find((part) => part.type === 'month')?.value || 1),
    dayOfWeek: WEEKDAY_PARTS[weekday] ?? 0,
  }
}

function matchesDay(dateParts: ZonedDateParts, dayOfMonth: CronField, dayOfWeek: CronField): boolean {
  const domMatch = dayOfMonth.any || dayOfMonth.values.has(dateParts.dayOfMonth)
  const dowMatch = dayOfWeek.any || dayOfWeek.values.has(dateParts.dayOfWeek)

  if (dayOfMonth.any && dayOfWeek.any) return true
  if (dayOfMonth.any) return dowMatch
  if (dayOfWeek.any) return domMatch
  return domMatch || dowMatch
}

export function getNextCronRun(cronExpression: string, fromDate = new Date(), timezone = 'UTC'): Date | null {
  if (!cronExpression || cronExpression === 'manual') return null

  const parts = cronExpression.trim().split(/\s+/)
  if (parts.length !== 5) return null

  try {
    const normalizedTimezone = normalizeCronTimezone(timezone)
    const minute = parseCronField(parts[0], 0, 59)
    const hour = parseCronField(parts[1], 0, 23)
    const dayOfMonth = parseCronField(parts[2], 1, 31)
    const month = parseCronField(parts[3], 1, 12, MONTH_NAMES)
    const dayOfWeek = parseCronField(parts[4], 0, 7, DAY_NAMES, value => value === 7 ? 0 : value)

    const candidate = new Date(fromDate)
    candidate.setSeconds(0, 0)
    candidate.setMinutes(candidate.getMinutes() + 1)

    const maxIterations = 60 * 24 * 400
    for (let i = 0; i < maxIterations; i++) {
      const zoned = getZonedDateParts(candidate, normalizedTimezone)
      if (
        (minute.any || minute.values.has(zoned.minute)) &&
        (hour.any || hour.values.has(zoned.hour)) &&
        (month.any || month.values.has(zoned.month)) &&
        matchesDay(zoned, dayOfMonth, dayOfWeek)
      ) {
        return new Date(candidate)
      }
      candidate.setMinutes(candidate.getMinutes() + 1)
    }
  } catch {
    return null
  }

  return null
}
