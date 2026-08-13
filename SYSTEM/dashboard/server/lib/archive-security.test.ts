import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { extractZipSecurely } from './archive-security'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-archive-security-'))

function makeZip(name: string, source: string): string {
  const zipPath = path.join(root, `${name}.zip`)
  execFileSync('python3', ['-c', source, zipPath])
  return zipPath
}

try {
  const safeZip = makeZip('safe', [
    'import sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1], "w") as zf:',
    '    zf.writestr("bundle/IDENTITY.md", "# Identity")',
  ].join('\n'))
  const safeTarget = path.join(root, 'safe-target')
  const safe = extractZipSecurely(safeZip, safeTarget)
  assert.deepEqual(safe.files, ['bundle/IDENTITY.md'])
  assert(fs.existsSync(path.join(safeTarget, 'bundle', 'IDENTITY.md')))

  const traversalZip = makeZip('traversal', [
    'import sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1], "w") as zf:',
    '    zf.writestr("../escape.txt", "blocked")',
  ].join('\n'))
  assert.throws(
    () => extractZipSecurely(traversalZip, path.join(root, 'traversal-target')),
    /unsafe path/i,
  )
  assert(!fs.existsSync(path.join(root, 'escape.txt')))

  const symlinkZip = makeZip('symlink', [
    'import stat, sys, zipfile',
    'info = zipfile.ZipInfo("bundle/link")',
    'info.create_system = 3',
    'info.external_attr = (stat.S_IFLNK | 0o777) << 16',
    'with zipfile.ZipFile(sys.argv[1], "w") as zf:',
    '    zf.writestr(info, "../../outside")',
  ].join('\n'))
  assert.throws(
    () => extractZipSecurely(symlinkZip, path.join(root, 'symlink-target')),
    /symbolic link/i,
  )

  const limitsZip = makeZip('limits', [
    'import sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1], "w", compression=zipfile.ZIP_DEFLATED) as zf:',
    '    zf.writestr("large.txt", "A" * 4096)',
  ].join('\n'))
  assert.throws(
    () => extractZipSecurely(limitsZip, path.join(root, 'limits-target'), { maxEntryBytes: 1024 }),
    /size limit/i,
  )

  console.log('archive-security.test.ts: 8 tests passed')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
