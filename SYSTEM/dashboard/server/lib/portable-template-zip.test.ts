import assert from 'assert'
import type { Archiver } from 'archiver'
import { readPortableZip } from './portable-template-zip'

export async function fixtureZip(files: Record<string, string | Buffer>, store = false): Promise<Buffer> {
  const archive: Archiver = new (require('archiver').ZipArchive)({ store, zlib: { level: 6 } })
  const chunks: Buffer[] = []
  const finished = new Promise<Buffer>((resolve, reject) => {
    archive.on('data', chunk => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
  })
  for (const [name, content] of Object.entries(files)) archive.append(content, { name, mode: 0o600 })
  await archive.finalize()
  return finished
}

async function main() {
  for (const store of [true, false]) {
    const zip = await fixtureZip({ 'manifest.json': '{}', 'agents/a.zip': 'fixture content' }, store)
    const files = await readPortableZip(zip)
    assert.equal(files.get('agents/a.zip')?.toString(), 'fixture content')
    const corrupt = Buffer.from(zip)
    const central = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    corrupt.writeUInt32LE(123, central + 16)
    await assert.rejects(readPortableZip(corrupt), /checksum|headers disagree/)
    const unsafe = Buffer.from(zip)
    for (let index = unsafe.indexOf('agents/a.zip'); index >= 0; index = unsafe.indexOf('agents/a.zip', index + 12)) unsafe.write('../bad/a.zip', index)
    await assert.rejects(readPortableZip(unsafe), /Unsafe ZIP path/)
    const link = Buffer.from(zip)
    link.writeUInt32LE((0o120777 << 16) >>> 0, central + 38)
    await assert.rejects(readPortableZip(link), /regular files/)
    const encrypted = Buffer.from(zip)
    encrypted.writeUInt16LE(1, central + 8)
    await assert.rejects(readPortableZip(encrypted), /encoding/)
    await assert.rejects(readPortableZip(zip.subarray(0, zip.length - 1)), /end record/)
  }
  await assert.rejects(readPortableZip(await fixtureZip({ 'manifest.json': '{}', 'MANIFEST.json': '{}' })), /collide/)
  await assert.rejects(readPortableZip(await fixtureZip({ 'manifest.json': '{}', 'agents/a.zip': 'x'.repeat(100_000) })), /expansion limit/)
  await assert.rejects(readPortableZip(Buffer.alloc(0)), /22 bytes/)
  console.log('portable-template-zip.test.ts: passed')
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
