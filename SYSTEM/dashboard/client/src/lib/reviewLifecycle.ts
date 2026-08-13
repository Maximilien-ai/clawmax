import type { PluginRecord } from './plugins'
import { isGenericPluginRecord } from './plugins'

export const CUMULATIVE_2_0_REVIEW_RELEASE = '2.0.0 previous RCs'

function releaseFor(record: PluginRecord, groupField: string): string | null {
  if (!isGenericPluginRecord(record)) return null
  const value = record.fields[groupField]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizedCheckIdentity(record: PluginRecord): string {
  return record.name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function uniqueStrings(records: PluginRecord[], field: string): string[] {
  return Array.from(new Set(records.flatMap((record) => {
    if (!isGenericPluginRecord(record)) return []
    const value = record.fields[field]
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
  })))
}

function mergedNotes(records: PluginRecord[], groupField: string): string {
  const notes = records.flatMap((record) => {
    if (!isGenericPluginRecord(record)) return []
    const note = typeof record.fields.notes === 'string' ? record.fields.notes.trim() : ''
    if (!note) return []
    const release = releaseFor(record, groupField)
    return [{ note, release }]
  })
  const unique = notes.filter((entry, index) => (
    notes.findIndex((candidate) => candidate.note === entry.note) === index
  ))
  if (unique.length <= 1) return unique[0]?.note || ''
  return unique.map((entry) => `[From ${entry.release || 'earlier checklist'}]\n${entry.note}`).join('\n\n')
}

function mergedOutcome(records: PluginRecord[], checkField: string): string {
  const outcomes = records.flatMap((record) => {
    if (!isGenericPluginRecord(record)) return []
    const value = record.fields.outcome
    return typeof value === 'string' ? [value] : []
  })
  if (outcomes.includes('failed')) return 'failed'
  if (outcomes.includes('blocked')) return 'blocked'
  if (outcomes.includes('passed') || records.some((record) => (
    isGenericPluginRecord(record) && record.fields[checkField] === true
  ))) return 'passed'
  return 'pending'
}

function isLegacy2ReviewRelease(release: string, currentRelease: string): boolean {
  return release !== currentRelease && /^2\.0\.0-test-rc\d+$/i.test(release)
}

export interface ReviewReleaseConsolidationPlan {
  updates: PluginRecord[]
  deleteIds: string[]
}

export function planReviewReleaseConsolidation(
  records: PluginRecord[],
  groupField: string,
  checkField: string,
  currentRelease: string,
  cumulativeRelease = CUMULATIVE_2_0_REVIEW_RELEASE,
): ReviewReleaseConsolidationPlan {
  const legacyIds = new Set(records.flatMap((record) => {
    const release = releaseFor(record, groupField)
    return release && isLegacy2ReviewRelease(release, currentRelease) ? [record.id] : []
  }))
  if (legacyIds.size === 0) return { updates: [], deleteIds: [] }

  const candidates = records.filter((record) => {
    const release = releaseFor(record, groupField)
    return release === cumulativeRelease || legacyIds.has(record.id)
  })
  const byIdentity = new Map<string, PluginRecord[]>()
  candidates.forEach((record) => {
    const identity = normalizedCheckIdentity(record)
    byIdentity.set(identity, [...(byIdentity.get(identity) || []), record])
  })

  const updates: PluginRecord[] = []
  const deleteIds: string[] = []
  byIdentity.forEach((matches) => {
    if (!matches.some((record) => legacyIds.has(record.id))) return
    const primary = matches.find((record) => releaseFor(record, groupField) === cumulativeRelease) || matches[0]
    if (!isGenericPluginRecord(primary)) return
    const completed = matches.some((record) => (
      isGenericPluginRecord(record) && record.fields[checkField] === true
    ))
    const merged: PluginRecord = {
      ...primary,
      archived: false,
      fields: {
        ...primary.fields,
        [groupField]: cumulativeRelease,
        [checkField]: completed,
        outcome: mergedOutcome(matches, checkField),
        notes: mergedNotes(matches, groupField),
        evidence: uniqueStrings(matches, 'evidence'),
        verifiedBy: uniqueStrings(matches, 'verifiedBy'),
      },
    }
    if (JSON.stringify(merged) !== JSON.stringify(primary)) updates.push(merged)
    matches.forEach((record) => {
      if (record.id !== primary.id) deleteIds.push(record.id)
    })
  })

  return { updates, deleteIds: Array.from(new Set(deleteIds)) }
}

export function getReviewReleaseGroups(
  records: PluginRecord[],
  groupField: string,
  archived: boolean,
): string[] {
  return Array.from(new Set(records.flatMap((record) => {
    if ((record.archived === true) !== archived) return []
    const release = releaseFor(record, groupField)
    return release ? [release] : []
  }))).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
}

export function getSupersededReviewReleaseIdsToArchive(
  records: PluginRecord[],
  groupField: string,
  incomingRelease: string | null,
): string[] {
  const byRelease = new Map<string, PluginRecord[]>()
  records.forEach((record) => {
    if (record.archived === true) return
    const release = releaseFor(record, groupField)
    if (!release || release === incomingRelease) return
    byRelease.set(release, [...(byRelease.get(release) || []), record])
  })

  return Array.from(byRelease.values()).flatMap((releaseRecords) => (
    releaseRecords.map((record) => record.id)
  ))
}
