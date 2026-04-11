import fs from 'fs'
import path from 'path'
import { getWorkspacePath } from './workspace'

export interface TemplateFeedbackEntry {
  id: string | null
  templateType: 'agent' | 'organization' | 'workflow'
  templateSlug: string
  templateName: string
  rating: number
  easyToUse?: 'yes' | 'mixed' | 'no' | ''
  solvedUseCase?: 'yes' | 'partly' | 'no' | ''
  customized?: 'yes' | 'a-little' | 'no' | ''
  otherUseCases?: string
  suggestions?: string
  createdAt: string
}

export interface TemplateFeedbackSummary {
  count: number
  avgRating: number
  entries: TemplateFeedbackEntry[]
}

export interface TemplateFeedbackActor {
  actorKey: string
  actorDisplay: string
}

type TemplateFeedbackType = 'agent' | 'organization' | 'workflow'

function getFeedbackPath() {
  return path.join(getWorkspacePath(), 'SYSTEM', 'template-feedback.json')
}

function getRemoteConfig() {
  const remoteUrl = (process.env.TEMPLATE_FEEDBACK_REMOTE_URL || '').trim()
  const summaryUrl = (process.env.TEMPLATE_FEEDBACK_SUMMARY_URL || '').trim()
  const token = (process.env.TEMPLATE_FEEDBACK_TOKEN || '').trim()
  return {
    remoteUrl,
    summaryUrl,
    token,
    enabled: !!(remoteUrl && summaryUrl && token),
  }
}

function normalizeRemoteEntry(entry: any): TemplateFeedbackEntry {
  return {
    id: typeof entry?.id === 'string' ? entry.id : null,
    templateType: 'organization',
    templateSlug: '',
    templateName: '',
    rating: Number(entry?.rating) || 0,
    easyToUse: entry?.easyToUse || '',
    solvedUseCase: entry?.solvedUseCase || '',
    customized: entry?.customized || '',
    otherUseCases: entry?.otherUseCases || '',
    suggestions: entry?.suggestions || '',
    createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
  }
}

function normalizeSummary(summary: any): TemplateFeedbackSummary {
  const entries = Array.isArray(summary?.entries) ? summary.entries.map(normalizeRemoteEntry) : []
  return {
    count: Number(summary?.count) || 0,
    avgRating: Number(summary?.avgRating) || 0,
    entries,
  }
}

function readAllEntries(): TemplateFeedbackEntry[] {
  try {
    const filePath = getFeedbackPath()
    if (!fs.existsSync(filePath)) return []
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return Array.isArray(parsed?.entries) ? parsed.entries : []
  } catch {
    return []
  }
}

function writeAllEntries(entries: TemplateFeedbackEntry[]) {
  const filePath = getFeedbackPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(
    filePath,
    JSON.stringify({ entries }, null, 2),
    'utf-8'
  )
}

export function listTemplateFeedback(templateType: TemplateFeedbackType, templateSlug: string) {
  return readAllEntries()
    .filter(entry => entry.templateType === templateType && entry.templateSlug === templateSlug)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function getLocalTemplateFeedbackSummary(templateType: TemplateFeedbackType, templateSlug: string): TemplateFeedbackSummary {
  const entries = listTemplateFeedback(templateType, templateSlug)
  const count = entries.length
  const avgRating = count > 0 ? entries.reduce((sum, entry) => sum + entry.rating, 0) / count : 0
  return {
    count,
    avgRating: Number(avgRating.toFixed(2)),
    entries,
  }
}

function addLocalTemplateFeedback(entry: Omit<TemplateFeedbackEntry, 'id' | 'createdAt'>) {
  const entries = readAllEntries()
  const saved: TemplateFeedbackEntry = {
    ...entry,
    id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  }
  entries.push(saved)
  writeAllEntries(entries)
  return saved
}

function getAllLocalTemplateFeedbackSummaries() {
  const entries = readAllEntries()
  const grouped = new Map<string, TemplateFeedbackEntry[]>()
  for (const entry of entries) {
    const key = `${entry.templateType}:${entry.templateSlug}`
    const current = grouped.get(key) || []
    current.push(entry)
    grouped.set(key, current)
  }

  const summaries: Record<string, { count: number; avgRating: number }> = {}
  for (const [key, group] of grouped.entries()) {
    const count = group.length
    const avgRating = count > 0 ? group.reduce((sum, item) => sum + item.rating, 0) / count : 0
    summaries[key] = {
      count,
      avgRating: Number(avgRating.toFixed(2)),
    }
  }
  return summaries
}

async function fetchRemoteJson(url: string, token: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  })

  const data: any = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : `Remote template feedback request failed (${response.status})`)
  }
  return data
}

export async function getTemplateFeedbackSummary(templateType: TemplateFeedbackType, templateSlug: string): Promise<TemplateFeedbackSummary> {
  const remote = getRemoteConfig()
  if (!remote.enabled) {
    return getLocalTemplateFeedbackSummary(templateType, templateSlug)
  }

  const url = new URL(remote.summaryUrl)
  url.searchParams.set('templateType', templateType)
  url.searchParams.set('templateSlug', templateSlug)
  const data = await fetchRemoteJson(url.toString(), remote.token, { method: 'GET' })
  return normalizeSummary(data?.summary)
}

export async function addTemplateFeedback(
  entry: Omit<TemplateFeedbackEntry, 'id' | 'createdAt'>,
  actor?: TemplateFeedbackActor
): Promise<{ feedback: TemplateFeedbackEntry; summary: TemplateFeedbackSummary }> {
  const remote = getRemoteConfig()
  if (!remote.enabled) {
    const feedback = addLocalTemplateFeedback(entry)
    return {
      feedback,
      summary: getLocalTemplateFeedbackSummary(entry.templateType, entry.templateSlug),
    }
  }

  const data = await fetchRemoteJson(remote.remoteUrl, remote.token, {
    method: 'POST',
    body: JSON.stringify({
      templateType: entry.templateType,
      templateSlug: entry.templateSlug,
      rating: entry.rating,
      easyToUse: entry.easyToUse || null,
      solvedUseCase: entry.solvedUseCase || null,
      customized: entry.customized || null,
      otherUseCases: entry.otherUseCases || null,
      suggestions: entry.suggestions || null,
      actorKey: actor?.actorKey || 'dashboard-user',
      actorDisplay: actor?.actorDisplay || 'Dashboard User',
      metadata: {
        source: 'dashboard',
      },
    }),
  })

  const feedback: TemplateFeedbackEntry = {
    ...entry,
    id: typeof data?.feedback?.id === 'string' ? data.feedback.id : null,
    createdAt: new Date().toISOString(),
  }
  return {
    feedback,
    summary: normalizeSummary(data?.summary),
  }
}

export async function getAllTemplateFeedbackSummaries(
  templates?: Array<{ templateType: TemplateFeedbackType; templateSlug: string }>
): Promise<Record<string, { count: number; avgRating: number }>> {
  const remote = getRemoteConfig()
  if (!remote.enabled || !templates?.length) {
    return getAllLocalTemplateFeedbackSummaries()
  }

  const settled = await Promise.allSettled(
    templates.map(async ({ templateType, templateSlug }) => {
      const summary = await getTemplateFeedbackSummary(templateType, templateSlug)
      return [`${templateType}:${templateSlug}`, { count: summary.count, avgRating: summary.avgRating }] as const
    })
  )

  const summaries: Record<string, { count: number; avgRating: number }> = {}
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      const [key, summary] = result.value
      summaries[key] = summary
    }
  }
  return summaries
}
