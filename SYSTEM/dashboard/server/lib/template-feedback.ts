import fs from 'fs'
import path from 'path'
import { getWorkspacePath } from './workspace'

export interface TemplateFeedbackEntry {
  id: string
  templateType: 'agent' | 'organization'
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

function getFeedbackPath() {
  return path.join(getWorkspacePath(), 'SYSTEM', 'template-feedback.json')
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

export function listTemplateFeedback(templateType: 'agent' | 'organization', templateSlug: string) {
  return readAllEntries()
    .filter(entry => entry.templateType === templateType && entry.templateSlug === templateSlug)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getTemplateFeedbackSummary(templateType: 'agent' | 'organization', templateSlug: string) {
  const entries = listTemplateFeedback(templateType, templateSlug)
  const count = entries.length
  const avgRating = count > 0 ? entries.reduce((sum, entry) => sum + entry.rating, 0) / count : 0
  return {
    count,
    avgRating: Number(avgRating.toFixed(2)),
    entries,
  }
}

export function addTemplateFeedback(entry: Omit<TemplateFeedbackEntry, 'id' | 'createdAt'>) {
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

export function getAllTemplateFeedbackSummaries() {
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
