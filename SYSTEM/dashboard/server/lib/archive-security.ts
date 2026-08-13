import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

export interface ArchiveExtractionLimits {
  maxEntries?: number
  maxEntryBytes?: number
  maxTotalBytes?: number
}

export interface ArchiveExtractionResult {
  files: string[]
  totalBytes: number
}

const EXTRACT_SCRIPT = String.raw`
import json, os, posixpath, shutil, stat, sys, zipfile

zip_path, target_dir = sys.argv[1], os.path.realpath(sys.argv[2])
max_entries, max_entry_bytes, max_total_bytes = map(int, sys.argv[3:6])
files, total = [], 0
os.makedirs(target_dir, exist_ok=True)

with zipfile.ZipFile(zip_path) as archive:
    entries = archive.infolist()
    if len(entries) > max_entries:
        raise ValueError("ZIP contains too many entries")

    for entry in entries:
        raw = entry.filename.replace("\\", "/")
        normalized = posixpath.normpath(raw)
        parts = [part for part in raw.split("/") if part not in ("", ".")]
        if raw.startswith("/") or normalized in ("", ".", "..") or ".." in parts:
            raise ValueError("ZIP contains an unsafe path: " + raw)
        mode = (entry.external_attr >> 16) & 0o170000
        if stat.S_ISLNK(mode):
            raise ValueError("ZIP contains a symbolic link: " + raw)
        if entry.file_size > max_entry_bytes:
            raise ValueError("ZIP entry exceeds the uncompressed size limit: " + raw)
        total += entry.file_size
        if total > max_total_bytes:
            raise ValueError("ZIP exceeds the total uncompressed size limit")

        destination = os.path.realpath(os.path.join(target_dir, *parts))
        if os.path.commonpath([target_dir, destination]) != target_dir:
            raise ValueError("ZIP contains an unsafe path: " + raw)
        if entry.is_dir() or raw.endswith("/"):
            os.makedirs(destination, exist_ok=True)
            continue

        os.makedirs(os.path.dirname(destination), exist_ok=True)
        written = 0
        with archive.open(entry) as source, open(destination, "xb") as output:
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_entry_bytes:
                    raise ValueError("ZIP entry exceeds the uncompressed size limit: " + raw)
                output.write(chunk)
        files.append("/".join(parts))

print(json.dumps({"files": files, "totalBytes": total}))
`

export function extractZipSecurely(
  zipPath: string,
  targetDir: string,
  limits: ArchiveExtractionLimits = {},
): ArchiveExtractionResult {
  const resolvedZip = path.resolve(zipPath)
  if (!fs.existsSync(resolvedZip)) throw new Error(`ZIP file not found: ${resolvedZip}`)

  const resolvedTarget = path.resolve(targetDir)
  fs.mkdirSync(resolvedTarget, { recursive: true })
  const maxEntries = limits.maxEntries ?? 10_000
  const maxEntryBytes = limits.maxEntryBytes ?? 100 * 1024 * 1024
  const maxTotalBytes = limits.maxTotalBytes ?? 512 * 1024 * 1024

  try {
    const output = execFileSync('python3', [
      '-c',
      EXTRACT_SCRIPT,
      resolvedZip,
      resolvedTarget,
      String(maxEntries),
      String(maxEntryBytes),
      String(maxTotalBytes),
    ], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return JSON.parse(output) as ArchiveExtractionResult
  } catch (error: any) {
    const detail = String(error?.stderr || error?.message || 'Failed to extract ZIP archive')
      .trim()
      .split(/\r?\n/)
      .pop()
      ?.replace(/^ValueError:\s*/, '')
    throw new Error(detail || 'Failed to extract ZIP archive')
  }
}
