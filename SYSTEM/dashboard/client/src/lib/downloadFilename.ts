export function getAttachmentFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded)
    } catch {}
  }
  const quoted = contentDisposition.match(/filename="([^"]+)"/i)?.[1]
  const plain = contentDisposition.match(/filename=([^;\s]+)/i)?.[1]
  return quoted || plain || fallback
}
