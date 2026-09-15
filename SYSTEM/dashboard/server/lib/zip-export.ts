import type { Archiver, ArchiverOptions } from 'archiver'
import { Writable } from 'stream'
import { pipeline } from 'stream/promises'

// @types/archiver still describes the pre-v8 factory API. Keep that mismatch
// isolated here; v8 exports constructors, not a default factory.
const { ZipArchive } = require('archiver') as {
  ZipArchive: new (options?: ArchiverOptions) => Archiver
}

export async function streamZipExport(destination: Writable, populate: (archive: Archiver) => void): Promise<void> {
  const archive = new ZipArchive({ zlib: { level: 9 } })
  // Register rejection handlers before populating/finalizing. Stream failures
  // must reject the request, never throw from an asynchronous event listener.
  const delivery = pipeline(archive, destination)
  try {
    populate(archive)
    await Promise.all([delivery, archive.finalize()])
  } catch (error) {
    archive.abort()
    archive.destroy(error instanceof Error ? error : new Error(String(error)))
    await delivery.catch(() => {})
    throw error
  }
}
