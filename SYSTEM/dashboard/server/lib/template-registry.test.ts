import fs from 'fs'
import os from 'os'
import path from 'path'
import strictAssert from 'node:assert/strict'
import {
  buildRawGitHubTemplateFileUrl,
  fetchTemplateRegistryCatalog,
  getTemplateRegistryCandidateUrls,
  getTemplateRegistryUrl,
  getTemplateRegistryWriteToken,
  importTemplateRegistryEntry,
  isTemplateRegistryWriteEnabled,
  parseGitHubTemplateSourceUrl,
  postTemplateRegistryAction,
  templateExistsLocally,
} from './template-registry'
import { getTemplate } from './templates'
import { resetWorkspaceManagerForTests } from './workspace-manager'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

console.log(`\n${YELLOW}=== Template Registry Test Suite ===${RESET}\n`)

const originalFetch = globalThis.fetch
const originalWorkspace = process.env.OPENCLAW_WORKSPACE
const originalTestWorkspace = process.env.CLAWMAX_TEST_WORKSPACE
const originalRemoteUrl = process.env.TEMPLATE_REGISTRY_REMOTE_URL
const originalRegistryUrl = process.env.TEMPLATE_REGISTRY_URL
const originalWriteToken = process.env.TEMPLATE_REGISTRY_WRITE_TOKEN
const originalLegacyToken = process.env.TEMPLATE_REGISTRY_TOKEN

async function run() {
  await test('source URLs reject malformed and unsupported hosts and routes', () => {
    for (const value of ['', 'not a url', 'https://example.com/a/b/tree/main/x', 'https://github.com/a/b', 'https://github.com/a/b/releases/main/x']) {
      strictAssert.equal(parseGitHubTemplateSourceUrl(value), null, value)
    }
    strictAssert.deepEqual(parseGitHubTemplateSourceUrl(' https://github.com/a/b/blob/main/folder/item '), {
      owner: 'a', repo: 'b', ref: 'main', subpath: 'folder/item',
    })
  })

  await test('registry writes require configuration and never send an unconfigured request', async () => {
    delete process.env.TEMPLATE_REGISTRY_WRITE_TOKEN
    delete process.env.TEMPLATE_REGISTRY_TOKEN
    globalThis.fetch = (async () => { throw new Error('Unexpected network request') }) as any
    strictAssert.equal(isTemplateRegistryWriteEnabled(), false)
    await strictAssert.rejects(postTemplateRegistryAction('share', {}), /not configured/)
    process.env.TEMPLATE_REGISTRY_TOKEN = ' legacy-fixture '
    strictAssert.equal(getTemplateRegistryWriteToken(), 'legacy-fixture')
  })

  await test('registry write requests preserve payload, endpoint and explicit credential', async () => {
    process.env.TEMPLATE_REGISTRY_REMOTE_URL = 'https://registry.example.invalid/catalog///'
    process.env.TEMPLATE_REGISTRY_WRITE_TOKEN = ' fixture-token '
    for (const action of ['rate', 'share'] as const) {
      globalThis.fetch = (async (url: any, init: any) => {
        strictAssert.equal(String(url), `https://registry.example.invalid/catalog/${action}`)
        strictAssert.equal(init.method, 'POST')
        strictAssert.equal(init.headers.Authorization, 'Bearer fixture-token')
        strictAssert.deepEqual(JSON.parse(init.body), { rating: 4 })
        return { ok: true, json: async () => ({ accepted: true }) }
      }) as any
      strictAssert.deepEqual(await postTemplateRegistryAction(action, { rating: 4 }), { accepted: true })
    }
  })

  await test('registry writes report server and malformed-body errors without credentials', async () => {
    for (const [body, message] of [[{ error: 'Rejected submission' }, 'Rejected submission'], [{ error: 7 }, 'Template registry rate failed (503)']] as const) {
      globalThis.fetch = (async () => ({ ok: false, status: 503, json: async () => body })) as any
      await strictAssert.rejects(postTemplateRegistryAction('rate', {}), { message })
    }
    globalThis.fetch = (async () => ({ ok: false, status: 502, json: async () => { throw new Error('Malformed JSON') } })) as any
    await strictAssert.rejects(postTemplateRegistryAction('share', {}), { message: 'Template registry share failed (502)' })
    globalThis.fetch = (async () => ({ ok: true, json: async () => { throw new Error('Empty response') } })) as any
    strictAssert.deepEqual(await postTemplateRegistryAction('share', {}), {})
  })

  await test('catalog normalization handles optional metadata and discards missing identities', async () => {
    const valid = { name: ' Example ', slug: ' example ', type: ' AGENT ', templateTags: [' x ', '', null, 2], sourceUrl: ' https://example.invalid ', summary: ' Summary ', applyCount: '3', rating: '4', ratingCount: '2', metadata: { revision: 1 } }
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({
      registry: { version: 1 }, summary: { total: 1 }, templates: [null, {}, { title: 'No slug' }, valid],
      communitySubmissions: [{ title: 'Community', templateSlug: 'community', templateSource: 'user', type: 'unknown', tags: 'bad', metadata: 'bad', rating: 'bad' }],
    }) })) as any
    const result = await fetchTemplateRegistryCatalog()
    strictAssert.equal(result.templates.length, 1)
    strictAssert.deepEqual(result.templates[0], { title: 'Example', templateSlug: 'example', templateId: 'system:example', templateSource: 'system', templateType: 'agent', tags: ['x', '2'], sourceUrl: 'https://example.invalid', summary: 'Summary', applyCount: 3, rating: 4, ratingCount: 2, metadata: { revision: 1 } })
    strictAssert.equal(result.communitySubmissions[0].templateType, 'team')
    strictAssert.equal(result.communitySubmissions[0].templateSource, 'user')
    strictAssert.deepEqual(result.communitySubmissions[0].tags, [])
    strictAssert.equal(result.communitySubmissions[0].rating, undefined)
    strictAssert.equal(result.communitySubmissions[0].metadata, undefined)
    strictAssert.deepEqual(result.registry, { version: 1 })
    strictAssert.deepEqual(result.summary, { total: 1 })
  })

  await test('catalog handles missing arrays, malformed responses and non-Error failures', async () => {
    for (const body of [null, {}, { templates: {}, communitySubmissions: 'bad', registry: false, summary: 2 }]) {
      globalThis.fetch = (async () => ({ ok: true, json: async () => body })) as any
      strictAssert.deepEqual(await fetchTemplateRegistryCatalog(), { templates: [], communitySubmissions: [], registry: undefined, summary: undefined })
    }
    for (const thrown of ['offline', null]) {
      globalThis.fetch = (async () => { throw thrown }) as any
      await strictAssert.rejects(fetchTemplateRegistryCatalog(), { message: thrown || 'Failed to reach template registry' })
    }
    globalThis.fetch = (async () => ({ ok: false, status: 503, json: async () => { throw new Error('Bad JSON') } })) as any
    await strictAssert.rejects(fetchTemplateRegistryCatalog(), { message: 'Template registry request failed (503)' })
    globalThis.fetch = (async () => ({ ok: false, status: 403, json: async () => ({ error: 'Catalog denied' }) })) as any
    await strictAssert.rejects(fetchTemplateRegistryCatalog(), { message: 'Catalog denied' })
  })

  await test('parseGitHubTemplateSourceUrl parses GitHub tree URLs', () => {
    const parsed = parseGitHubTemplateSourceUrl('https://github.com/Maximilien-ai/templates/tree/main/templates/product-research-team')
    assert(!!parsed, 'Expected parsed source')
    assert(parsed?.owner === 'Maximilien-ai', 'Expected owner')
    assert(parsed?.repo === 'templates', 'Expected repo')
    assert(parsed?.ref === 'main', 'Expected ref')
    assert(parsed?.subpath === 'templates/product-research-team', 'Expected subpath')
  })

  await test('registry import rejects unsupported types and invalid sources without fetching', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-registry-invalid-'))
    const prior = process.env.CLAWMAX_TEST_WORKSPACE
    process.env.CLAWMAX_TEST_WORKSPACE = root
    resetWorkspaceManagerForTests()
    globalThis.fetch = (async () => { throw new Error('Unexpected network request') }) as any
    const input = { title: 'Unique invalid fixture', templateSlug: 'unique-invalid-fixture', templateType: 'agent' as const, sourceUrl: 'not a URL' }
    try {
      strictAssert.equal(templateExistsLocally({ ...input, templateType: 'workflow' }), false)
      await strictAssert.rejects(importTemplateRegistryEntry({ ...input, templateType: 'workflow' }), /Only agent, team, and company/)
      await strictAssert.rejects(importTemplateRegistryEntry(input), /GitHub tree\/blob URL/)
    } finally {
      if (prior === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE
      else process.env.CLAWMAX_TEST_WORKSPACE = prior
      resetWorkspaceManagerForTests()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  await test('registry import rejects missing, malformed and invalid template assets before saving', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-registry-assets-'))
    const prior = process.env.CLAWMAX_TEST_WORKSPACE
    process.env.CLAWMAX_TEST_WORKSPACE = root
    resetWorkspaceManagerForTests()
    const input = { title: 'Unique invalid fixture', templateSlug: 'unique-invalid-fixture', templateType: 'agent' as const, sourceUrl: 'https://github.com/fixture/templates/tree/main/example' }
    try {
      for (const [status, body, message] of [
        [404, '', /does not include template.json/],
        [503, '', /Failed to fetch template asset \(503\)/],
        [200, '{broken', /invalid template.json/],
        [200, '{"type":"organization"}', /type mismatch/],
        [200, '{"type":"agent"}', /required|missing/i],
      ] as const) {
        globalThis.fetch = (async () => ({ status, ok: status === 200, text: async () => body })) as any
        await strictAssert.rejects(importTemplateRegistryEntry(input), message)
        strictAssert.equal(templateExistsLocally(input), false, 'Failed import must not create a template')
      }
    } finally {
      if (prior === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE
      else process.env.CLAWMAX_TEST_WORKSPACE = prior
      resetWorkspaceManagerForTests()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  await test('buildRawGitHubTemplateFileUrl builds raw.githubusercontent paths', () => {
    const parsed = parseGitHubTemplateSourceUrl('https://github.com/Maximilien-ai/templates/tree/main/templates/product-research-team')
    assert(!!parsed, 'Expected parsed source')
    const url = buildRawGitHubTemplateFileUrl(parsed!, 'template.json')
    assert(
      url === 'https://raw.githubusercontent.com/Maximilien-ai/templates/main/templates/product-research-team/template.json',
      `Unexpected raw URL: ${url}`,
    )
  })

  await test('getTemplateRegistryCandidateUrls prefers www and falls back to apex', () => {
    delete process.env.TEMPLATE_REGISTRY_REMOTE_URL
    delete process.env.TEMPLATE_REGISTRY_URL
    const urls = getTemplateRegistryCandidateUrls()
    assert(urls[0] === 'https://www.clawmax.ai/api/template-registry', `Unexpected primary registry URL: ${urls[0]}`)
    assert(urls[1] === 'https://clawmax.ai/api/template-registry', `Unexpected fallback registry URL: ${urls[1]}`)
  })

  await test('remote URL override takes precedence over legacy registry URL', () => {
    process.env.TEMPLATE_REGISTRY_REMOTE_URL = 'https://registry.example.com/api/template-registry'
    process.env.TEMPLATE_REGISTRY_URL = 'https://legacy.example.com/api/template-registry'
    assert(
      getTemplateRegistryUrl() === 'https://registry.example.com/api/template-registry',
      `Expected remote URL override to win, got ${getTemplateRegistryUrl()}`,
    )
    const urls = getTemplateRegistryCandidateUrls()
    assert(urls.length === 1 && urls[0] === 'https://registry.example.com/api/template-registry', 'Expected only the configured remote URL candidate')
  })

  await test('write token prefers TEMPLATE_REGISTRY_WRITE_TOKEN and enables writes', () => {
    process.env.TEMPLATE_REGISTRY_WRITE_TOKEN = 'trusted-short-lived-token'
    process.env.TEMPLATE_REGISTRY_TOKEN = 'legacy-token'
    assert(getTemplateRegistryWriteToken() === 'trusted-short-lived-token', 'Expected write token override to win')
    assert(isTemplateRegistryWriteEnabled(), 'Expected template registry writes to be enabled')
  })

  await test('fetchTemplateRegistryCatalog falls back when the primary URL fails', async () => {
    delete process.env.TEMPLATE_REGISTRY_REMOTE_URL
    delete process.env.TEMPLATE_REGISTRY_URL
    const calls: string[] = []
    globalThis.fetch = (async (input: any) => {
      const url = String(input)
      calls.push(url)
      if (url === 'https://www.clawmax.ai/api/template-registry') {
        throw new Error('connect ECONNREFUSED')
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          templates: [
            {
              title: 'Product Research Team',
              templateType: 'team',
              templateSlug: 'product-research-team',
              templateId: 'system:product-research-team',
              templateSource: 'system',
              tags: ['product', 'research'],
            },
          ],
          communitySubmissions: [],
          summary: { total: 1 },
        }),
      } as any
    }) as any

    const catalog = await fetchTemplateRegistryCatalog()
    assert(calls.length === 2, `Expected two fetch attempts, got ${calls.length}`)
    assert(catalog.templates.length === 1, 'Expected canonical template from fallback registry URL')
    assert(catalog.templates[0]?.templateSlug === 'product-research-team', 'Expected fallback template payload')
  })

  await test('templateExistsLocally recognizes shipped system templates by display slug', () => {
    assert(
      templateExistsLocally({
        title: 'Software Engineer',
        templateSlug: 'software-engineer',
        templateType: 'agent',
      }),
      'Expected software engineer to already exist locally',
    )
  })

  await test('importTemplateRegistryEntry imports GitHub-backed agent templates into workspace templates', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-registry-'))
    process.env.OPENCLAW_WORKSPACE = workspace
    process.env.CLAWMAX_TEST_WORKSPACE = workspace
    resetWorkspaceManagerForTests()
    fs.mkdirSync(path.join(workspace, 'AGENTS'), { recursive: true })
    fs.mkdirSync(path.join(workspace, 'TEMPLATES', 'agents'), { recursive: true })
    fs.mkdirSync(path.join(workspace, 'TEMPLATES', 'organizations'), { recursive: true })

    globalThis.fetch = (async (input: any) => {
      const url = String(input)
      if (url.endsWith('/template.json')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            name: 'Registry QA Template',
            type: 'agent',
            version: '1.0.0',
            description: 'Imported from registry',
            author: 'Registry',
            tags: ['qa', 'registry'],
            agents: [{ id: 'registry-qa', name: 'Registry QA', role: 'QA Engineer', tags: ['qa'] }],
          }),
        } as any
      }
      if (url.endsWith('/IDENTITY.md')) {
        return { ok: true, status: 200, text: async () => '# Identity\n\nRegistry QA\n' } as any
      }
      if (url.endsWith('/SOUL.md')) {
        return { ok: true, status: 200, text: async () => '# Soul\n\nMeticulous.\n' } as any
      }
      if (url.endsWith('/TOOLS.md')) {
        return { ok: true, status: 200, text: async () => '# Tools\n\n- github\n' } as any
      }
      return { ok: false, status: 404, text: async () => '' } as any
    }) as any

    const result = await importTemplateRegistryEntry({
      title: 'Registry QA Template',
      templateSlug: 'registry-qa-template',
      templateType: 'agent',
      templateId: 'system:registry-qa-template',
      templateSource: 'system',
      sourceUrl: 'https://github.com/acme/templates/tree/main/templates/registry-qa-template',
    })

    assert(result.ok, 'Expected successful import')
    assert(!result.alreadyLocal, 'Expected template to be newly imported')

    const saved = getTemplate('agent', 'registry-qa-template') as any
    assert(!!saved, 'Expected saved workspace template')
    assert(saved.source === 'workspace', 'Expected imported template to be local workspace source')
    const templateDir = path.join(workspace, 'TEMPLATES', 'agents', 'registry-qa-template')
    assert(fs.existsSync(path.join(templateDir, 'template.json')), 'Expected template.json')
    assert(fs.existsSync(path.join(templateDir, 'IDENTITY.md')), 'Expected IDENTITY.md')
    assert(fs.existsSync(path.join(templateDir, 'SOUL.md')), 'Expected SOUL.md')
    assert(fs.existsSync(path.join(templateDir, 'TOOLS.md')), 'Expected TOOLS.md')
  })

  globalThis.fetch = originalFetch
  if (originalWorkspace === undefined) delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (originalTestWorkspace === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = originalTestWorkspace
  if (originalRemoteUrl === undefined) delete process.env.TEMPLATE_REGISTRY_REMOTE_URL
  else process.env.TEMPLATE_REGISTRY_REMOTE_URL = originalRemoteUrl
  if (originalRegistryUrl === undefined) delete process.env.TEMPLATE_REGISTRY_URL
  else process.env.TEMPLATE_REGISTRY_URL = originalRegistryUrl
  if (originalWriteToken === undefined) delete process.env.TEMPLATE_REGISTRY_WRITE_TOKEN
  else process.env.TEMPLATE_REGISTRY_WRITE_TOKEN = originalWriteToken
  if (originalLegacyToken === undefined) delete process.env.TEMPLATE_REGISTRY_TOKEN
  else process.env.TEMPLATE_REGISTRY_TOKEN = originalLegacyToken
  resetWorkspaceManagerForTests()

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) {
    console.log(`${RED}Some tests failed${RESET}`)
    process.exit(1)
  }
  console.log(`${GREEN}All tests passed! ✓${RESET}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
