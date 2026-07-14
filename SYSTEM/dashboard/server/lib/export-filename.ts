export function sanitizeExportName(value: string, fallback = 'export'): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
  return normalized || fallback
}

export function buildNamedExportFilename(name: string, kind: string, extension: string): string {
  return `${sanitizeExportName(name)}.${kind}.${extension}`
}
