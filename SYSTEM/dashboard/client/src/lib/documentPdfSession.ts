export interface PdfArtifact { url: string; warnings: string[] }

// One artifact per selected document version. Dispose suppresses stale work and
// releases the URL; a failed attempt can be retried without reopening the file.
export function createDocumentPdfSession(
  generate: () => Promise<{ blob: Blob; warnings: string[] }>,
  urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
) {
  let disposed = false
  let artifact: PdfArtifact | null = null
  let pending: Promise<PdfArtifact | null> | null = null
  return {
    get(): Promise<PdfArtifact | null> {
      if (disposed) return Promise.resolve(null)
      if (artifact) return Promise.resolve(artifact)
      if (!pending) pending = generate().then(result => {
        if (disposed) return null
        artifact = { url: urls.createObjectURL(result.blob), warnings: result.warnings }
        return artifact
      }).finally(() => { pending = null })
      return pending
    },
    dispose() {
      disposed = true
      if (artifact) urls.revokeObjectURL(artifact.url)
      artifact = null
    },
  }
}
