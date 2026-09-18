import { inflateRaw } from 'zlib'
import { promisify } from 'util'

const inflate = promisify(inflateRaw)
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc32(bytes: Buffer): number {
  let value = 0xffffffff
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

export class PortableTemplateError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}
export function requirePortable(condition: unknown, message: string): asserts condition {
  if (!condition) throw new PortableTemplateError('invalid_template', message)
}

/** Bounded, in-memory ZIP admission; never extracts attacker-selected paths.
 * Rejects encryption, links, special files, ZIP64, split archives, collisions,
 * unsafe paths, expansion bombs and inconsistent local/central headers.
 */
export async function readPortableZip(bytes: Buffer, agent = false): Promise<Map<string, Buffer>> {
  requirePortable(Buffer.isBuffer(bytes) && bytes.length >= 22 && bytes.length <= 64 * 1024 * 1024, 'ZIP must be between 22 bytes and 64 MiB')
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break }
  }
  requirePortable(end >= 0, 'ZIP end record is missing')
  const count = bytes.readUInt16LE(end + 10)
  const start = bytes.readUInt32LE(end + 16)
  const size = bytes.readUInt32LE(end + 12)
  requirePortable(bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0 && bytes.readUInt16LE(end + 8) === count, 'Split ZIP archives are unsupported')
  requirePortable(count >= 2 && count <= (agent ? 2048 : 129) && start + size === end, 'Invalid ZIP directory')
  const entries: Array<{ name: string; offset: number; length: number; expanded: number; crc: number; method: number; flags: number; nameBytes: Buffer }> = []
  const names = new Set<string>()
  let cursor = start
  let total = 0
  for (let index = 0; index < count; index++) {
    requirePortable(cursor + 46 <= end && bytes.readUInt32LE(cursor) === 0x02014b50, 'Invalid ZIP entry')
    const flags = bytes.readUInt16LE(cursor + 8)
    const method = bytes.readUInt16LE(cursor + 10)
    const length = bytes.readUInt32LE(cursor + 20)
    const expanded = bytes.readUInt32LE(cursor + 24)
    const nameLength = bytes.readUInt16LE(cursor + 28)
    const next = cursor + 46 + nameLength + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32)
    requirePortable(next <= end && nameLength > 0 && nameLength <= 255, 'Invalid ZIP entry length')
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength)
    const name = nameBytes.toString('utf8')
    requirePortable(/^[\x20-\x7e]+$/.test(name) && !/[\\:]/.test(name) && name.split('/').every(p => p && p !== '.' && p !== '..'), 'Unsafe ZIP path')
    requirePortable(!names.has(name.toLowerCase()), 'ZIP paths collide')
    names.add(name.toLowerCase())
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16
    const kind = mode & 0o170000
    requirePortable((kind === 0 || kind === 0o100000) && (!agent || !(mode & 0o111)) && !(bytes.readUInt32LE(cursor + 38) & 0x10), 'ZIP entries must be regular files')
    requirePortable((flags & ~0x808) === 0 && (method === 0 || method === 8) && bytes.readUInt16LE(cursor + 34) === 0, 'Unsupported ZIP encoding')
    total += expanded
    requirePortable(expanded <= (agent ? 32 : 64) * 1024 * 1024 && total <= 256 * 1024 * 1024 && (expanded === 0 || expanded <= length * 100), 'ZIP expansion limit exceeded')
    const offset = bytes.readUInt32LE(cursor + 42)
    entries.push({ name, nameBytes, offset, length, expanded, method, flags, crc: bytes.readUInt32LE(cursor + 16) })
    cursor = next
  }
  requirePortable(cursor === end, 'Unexpected ZIP directory data')
  const files = new Map<string, Buffer>()
  let previousEnd = 0
  for (const entry of entries.sort((a, b) => a.offset - b.offset)) {
    const offset = entry.offset
    requirePortable(offset >= previousEnd && offset + 30 <= start && bytes.readUInt32LE(offset) === 0x04034b50, 'Invalid or overlapping local ZIP header')
    const nameLength = bytes.readUInt16LE(offset + 26)
    const dataStart = offset + 30 + nameLength + bytes.readUInt16LE(offset + 28)
    requirePortable(dataStart + entry.length <= start && bytes.readUInt16LE(offset + 6) === entry.flags && bytes.readUInt16LE(offset + 8) === entry.method && bytes.subarray(offset + 30, offset + 30 + nameLength).equals(entry.nameBytes), 'ZIP headers disagree')
    if (!(entry.flags & 8)) requirePortable(bytes.readUInt32LE(offset + 14) === entry.crc && bytes.readUInt32LE(offset + 18) === entry.length && bytes.readUInt32LE(offset + 22) === entry.expanded, 'ZIP size/checksum headers disagree')
    const compressed = bytes.subarray(dataStart, dataStart + entry.length)
    let content: Buffer
    try { content = entry.method === 0 ? Buffer.from(compressed) : await inflate(compressed, { maxOutputLength: Math.max(1, entry.expanded) }) }
    catch { throw new PortableTemplateError('invalid_template', 'Invalid compressed ZIP data') }
    requirePortable(content.length === entry.expanded && crc32(content) === entry.crc, 'ZIP size or checksum mismatch')
    files.set(entry.name, content)
    previousEnd = dataStart + entry.length
  }
  requirePortable(files.has('manifest.json'), 'ZIP must contain manifest.json')
  return files
}
