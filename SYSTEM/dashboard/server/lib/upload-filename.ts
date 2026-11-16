import path from 'path'

export function decodeUploadFilename(value: string, encoding?: string): string | null {
  if (!value.trim()) return null
  let decoded = value
  if (encoding === 'percent') {
    try {
      decoded = decodeURIComponent(value)
    } catch {
      return null
    }
  } else if (encoding) {
    return null
  }
  if (decoded.includes('\0')) return null
  return path.basename(decoded.trim()) || null
}
