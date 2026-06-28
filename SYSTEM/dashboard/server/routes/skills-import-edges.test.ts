import assert from 'node:assert/strict'
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
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
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

  await test('import trims sourcePath and explains when the runtime cannot see it', async () => {
    const missingPath = path.join(os.tmpdir(), `missing-skill-${Date.now()}`, 'quickbooks-po-automation')
    const res = makeRes()
    await importHandler(makeReq({ body: { sourcePath: `  ${missingPath}  ` } }), res)

    assert.equal(res.statusCode, 400)
    assert.match(res.jsonBody?.error || '', /dashboard runtime/i)
    assert.match(res.jsonBody?.error || '', /copy\/mount/i)
    assert.match(res.jsonBody?.error || '', /quickbooks-po-automation/)
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

  console.log('\nAll tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
