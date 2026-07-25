import type { PluginRecord } from './plugins'
import { isGenericPluginRecord } from './plugins'

function releaseFor(record: PluginRecord, groupField: string): string | null {
  if (!isGenericPluginRecord(record)) return null
  const value = record.fields[groupField]
  return typeof value === 'string' && value.trim() ? value.trim() : null
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

export function getCompletedReviewReleaseIdsToArchive(
  records: PluginRecord[],
  groupField: string,
  checkField: string,
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
    releaseRecords.length > 0
    && releaseRecords.every((record) => (
      isGenericPluginRecord(record) && record.fields[checkField] === true
    ))
      ? releaseRecords.map((record) => record.id)
      : []
  ))
}
