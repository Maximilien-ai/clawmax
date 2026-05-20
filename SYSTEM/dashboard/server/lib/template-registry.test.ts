import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  buildRawGitHubTemplateFileUrl,
  fetchTemplateRegistryCatalog,
  getTemplateRegistryCandidateUrls,
  getTemplateRegistryUrl,
  getTemplateRegistryWriteToken,
  importTemplateRegistryEntry,
  isTemplateRegistryWriteEnabled,
  parseGitHubTemplateSourceUrl,
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
const originalRemoteUrl = process.env.TEMPLATE_REGISTRY_REMOTE_URL
const originalRegistryUrl = process.env.TEMPLATE_REGISTRY_URL
const originalWriteToken = process.env.TEMPLATE_REGISTRY_WRITE_TOKEN
const originalLegacyToken = process.env.TEMPLATE_REGISTRY_TOKEN

async function run() {
  await test('parseGitHubTemplateSourceUrl parses GitHub tree URLs', () => {
    const parsed = parseGitHubTemplateSourceUrl('https://github.com/Maximilien-ai/templates/tree/main/templates/product-research-team')
    assert(!!parsed, 'Expected parsed source')
    assert(parsed?.owner === 'Maximilien-ai', 'Expected owner')
    assert(parsed?.repo === 'templates', 'Expected repo')
    assert(parsed?.ref === 'main', 'Expected ref')
    assert(parsed?.subpath === 'templates/product-research-team', 'Expected subpath')
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
