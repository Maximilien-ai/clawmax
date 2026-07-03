import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import router, { __test } from './skills'

type Handler = (req: any, res: any) => any

function getRouteHandler(method: 'post' | 'get', routePath: string): Handler {
  const layer = (router as any).stack.find((entry: any) => (
    entry.route?.path === routePath && entry.route?.methods?.[method]
  ))
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`)
  }
  return layer.route.stack[layer.route.stack.length - 1].handle
}

function makeReq(overrides: Record<string, unknown> = {}) {
  const headers = (overrides.headers as Record<string, string> | undefined) || {}
  return {
    body: {},
    params: {},
    query: {},
    headers,
    header(name: string) {
      return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()]
    },
    ...overrides,
  }
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: any) {
      this.jsonBody = payload
      return this
    },
  }
}

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

async function main() {
  const importHandler = getRouteHandler('post', '/import')
  const importUploadHandler = getRouteHandler('post', '/import-upload')

  function createZipFromDir(sourceDir: string, zipPath: string) {
    execFileSync('python3', ['-c', [
      'import os, sys, zipfile',
      'source_dir, zip_path = sys.argv[1], sys.argv[2]',
      'with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:',
      '    for root, _dirs, files in os.walk(source_dir):',
      '        for name in files:',
      '            full = os.path.join(root, name)',
      '            rel = os.path.relpath(full, source_dir)',
      '            zf.write(full, rel)',
    ].join('\n'), sourceDir, zipPath], { stdio: 'pipe' })
  }

  await test('import trims sourcePath and explains when the runtime cannot see it', async () => {
    const missingPath = path.join(os.tmpdir(), `missing-skill-${Date.now()}`, 'quickbooks-po-automation')
    const res = makeRes()
    await importHandler(makeReq({ body: { sourcePath: `  ${missingPath}  ` } }), res)

    assert.equal(res.statusCode, 400)
    assert.match(res.jsonBody?.error || '', /dashboard runtime/i)
    assert.match(res.jsonBody?.error || '', /copy\/mount/i)
    assert.match(res.jsonBody?.error || '', /quickbooks-po-automation/)
    assert.match(res.jsonBody?.error || '', /SKILLS\/custom/i)
    assert.match(res.jsonBody?.suggestedPath || '', /SKILLS\/custom/i)
    assert.doesNotMatch(res.jsonBody?.error || '', /"  \//)
  })

  await test('import rejects non-directory sourcePath values clearly', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-import-file-'))
    const filePath = path.join(root, 'skill.md')
    fs.writeFileSync(filePath, '# not-a-directory')

    try {
      const res = makeRes()
      await importHandler(makeReq({ body: { sourcePath: filePath } }), res)
      assert.equal(res.statusCode, 400)
      assert.equal(res.jsonBody?.error, 'sourcePath must be a directory')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  await test('runtime guidance helper mentions cloud and remote runtime cases', () => {
    const message = __test.getLocalSkillImportSourcePathGuidance('/tmp/custom-skill')
    assert.match(message, /cloud/i)
    assert.match(message, /container/i)
    assert.match(message, /remote\/on-prem/i)
    assert.match(message, /copy\/mount/i)
  })

  await test('detectImportableSkillRoot accepts archives extracted under one top-level folder', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-import-root-'))
    const nested = path.join(root, 'workspace-ls')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(nested, 'SKILL.md'), '# workspace-ls')

    try {
      const result = __test.detectImportableSkillRoot(root)
      assert.equal(result.ok, true)
      if (result.ok) {
        assert.equal(result.sourcePath, nested)
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  await test('import-upload imports a zipped single skill from the client into the active workspace', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-upload-workspace-'))
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-upload-source-'))
    const bundleRoot = path.join(sourceRoot, 'workspace-ls')
    const zipPath = path.join(os.tmpdir(), `workspace-ls-${Date.now()}.zip`)
    const previousTestWorkspace = process.env.CLAWMAX_TEST_WORKSPACE

    fs.mkdirSync(path.join(workspaceRoot, 'SYSTEM'), { recursive: true })
    fs.mkdirSync(bundleRoot, { recursive: true })
    fs.writeFileSync(path.join(bundleRoot, 'SKILL.md'), '# workspace-ls')
    createZipFromDir(sourceRoot, zipPath)
    process.env.CLAWMAX_TEST_WORKSPACE = workspaceRoot

    try {
      const res = makeRes()
      await importUploadHandler(makeReq({
        body: fs.readFileSync(zipPath),
        headers: {
          'x-file-name': 'workspace-ls.zip',
        },
      }), res)

      assert.equal(res.statusCode, 200)
      assert.equal(res.jsonBody?.ok, true)
      assert.equal(res.jsonBody?.skillId, 'workspace-ls')
      assert.equal(typeof res.jsonBody?.upload?.extractedFiles, 'number')
      assert(fs.existsSync(path.join(workspaceRoot, 'SKILLS', 'custom', 'workspace-ls', 'SKILL.md')))
      const stagingRoot = path.join(workspaceRoot, 'SYSTEM', '.skill-imports')
      const remainingStagingEntries = fs.existsSync(stagingRoot) ? fs.readdirSync(stagingRoot).filter(Boolean) : []
      assert.equal(remainingStagingEntries.length, 0, 'Expected staged upload directories to be cleaned up')
    } finally {
      if (previousTestWorkspace === undefined) {
        delete process.env.CLAWMAX_TEST_WORKSPACE
      } else {
        process.env.CLAWMAX_TEST_WORKSPACE = previousTestWorkspace
      }
      if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true })
      fs.rmSync(workspaceRoot, { recursive: true, force: true })
      fs.rmSync(sourceRoot, { recursive: true, force: true })
    }
  })

  console.log('\nAll tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
