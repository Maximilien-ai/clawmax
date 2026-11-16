/**
 * The OpenClaw model catalog is read from the installed package's plugin manifests. Fixtures are
 * real directory layouts on a temp filesystem, so package-root discovery runs as it does in use.
 *
 * Run with: npx ts-node --transpileOnly server/lib/openclaw-model-catalog.test.ts
 */
import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  checkOpenClawModelSupport,
  clearOpenClawModelCatalogCache,
  describeOpenClawModelRejection,
  filterOpenClawRunnableModels,
  getOpenClawModelCatalog,
} from './openclaw-model-catalog'

// The OpenAI ids OpenClaw 2026.9.7 ships in extensions/openai/openclaw.plugin.json.
const OPENAI_2026_9_7 = ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.4-pro', 'gpt-5.4-mini', 'gpt-5.4-nano']

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`✓ ${name}`)
  } catch (error: any) {
    console.error(`✗ ${name}\n  ${error.message}`)
    process.exitCode = 1
  }
}

function writePackage(root: string) {
  const plugin = (dir: string, manifest: object) => {
    fs.mkdirSync(path.join(root, 'dist', 'extensions', dir), { recursive: true })
    fs.writeFileSync(path.join(root, 'dist', 'extensions', dir, 'openclaw.plugin.json'), JSON.stringify(manifest))
  }
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'openclaw', version: '2026.9.7' }))
  fs.writeFileSync(path.join(root, 'openclaw.mjs'), '// entry point\n')
  plugin('openai', { id: 'openai', enabledByDefault: true, modelCatalog: { providers: { openai: { models: OPENAI_2026_9_7.map((id) => ({ id })) } } } })
  plugin('anthropic', { id: 'anthropic', enabledByDefault: true, modelCatalog: { providers: { anthropic: { models: [{ id: 'claude-haiku-4-5' }, { id: 'claude-sonnet-5-5' }] } } } })
  // Disabled plugins and providers resolved through user endpoints never narrow the list.
  plugin('vendor-mirror', { id: 'vendor-mirror', enabledByDefault: false, modelCatalog: { providers: { openai: { models: [{ id: 'gpt-4o-mini' }] } } } })
  plugin('openrouter', { id: 'openrouter', enabledByDefault: true, modelCatalog: { providers: { openrouter: { models: [{ id: 'auto' }] } } } })
  plugin('no-catalog', { id: 'no-catalog' })
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-openclaw-catalog-'))
const previousConfig = process.env.OPENCLAW_CONFIG_PATH
process.env.OPENCLAW_CONFIG_PATH = path.join(tmp, 'profile', 'openclaw.json')
const previousBin = process.env.OPENCLAW_BIN
const previousRoot = process.env.OPENCLAW_PACKAGE_ROOT
delete process.env.OPENCLAW_PACKAGE_ROOT
try {
  // ClawMax's pinned target: a launcher script outside the package that execs its entry point.
  const pinnedRoot = path.join(tmp, 'targets', 'v2026.9.7', 'src')
  fs.mkdirSync(pinnedRoot, { recursive: true })
  writePackage(pinnedRoot)
  const launcher = path.join(tmp, 'targets', 'v2026.9.7', 'bin', 'openclaw')
  fs.mkdirSync(path.dirname(launcher), { recursive: true })
  fs.writeFileSync(launcher, `#!/usr/bin/env bash\nset -euo pipefail\ncd /\nexec node "${pinnedRoot}/openclaw.mjs" "$@"\n`, { mode: 0o755 })

  // npm, Homebrew and the container image: a bin symlink to the package's own entry point.
  const npmRoot = path.join(tmp, 'lib', 'node_modules', 'openclaw')
  fs.mkdirSync(npmRoot, { recursive: true })
  writePackage(npmRoot)
  fs.chmodSync(path.join(npmRoot, 'openclaw.mjs'), 0o755)
  const npmBin = path.join(tmp, 'bin', 'openclaw')
  fs.mkdirSync(path.dirname(npmBin), { recursive: true })
  fs.symlinkSync(path.join(npmRoot, 'openclaw.mjs'), npmBin)

  for (const [layout, bin] of [['pinned launcher', launcher], ['npm symlink', npmBin]]) {
    test(`reads the installed catalog through a ${layout}`, () => {
      process.env.OPENCLAW_BIN = bin
      clearOpenClawModelCatalogCache()
      const catalog = getOpenClawModelCatalog()
      assert(catalog, 'Expected a readable catalog')
      assert.strictEqual(catalog.version, '2026.9.7')
      assert.deepStrictEqual([...catalog.providers.get('openai')!].sort(), [...OPENAI_2026_9_7].sort(), 'A disabled plugin must not add ids')
      assert(!catalog.providers.has('openrouter'), 'OpenRouter ids pass through to the user endpoint and are never narrowed')
      assert(!catalog.providers.has('anthropic'), 'Only providers whose unlisted snapshots are confirmed to fail are read')
    })
  }

  test('an explicit OPENCLAW_PACKAGE_ROOT wins over the CLI it is paired with', () => {
    process.env.OPENCLAW_BIN = path.join(tmp, 'missing', 'openclaw')
    process.env.OPENCLAW_PACKAGE_ROOT = npmRoot
    clearOpenClawModelCatalogCache()
    try {
      assert.strictEqual(getOpenClawModelCatalog()?.providers.get('openai')?.has('gpt-5.4-mini'), true)
      process.env.OPENCLAW_PACKAGE_ROOT = path.join(tmp, 'missing-root')
      clearOpenClawModelCatalogCache()
      assert.strictEqual(getOpenClawModelCatalog(), null, 'A selected root without plugins must not fall back to another installation')
    } finally {
      delete process.env.OPENCLAW_PACKAGE_ROOT
    }
  })

  test('rules out only the confirmed failure: an OpenAI dated snapshot of a listed alias', () => {
    process.env.OPENCLAW_BIN = launcher
    clearOpenClawModelCatalogCache()
    const rows: Array<[string, ReturnType<typeof checkOpenClawModelSupport>]> = [
      ['openai/o3-2025-04-16', { status: 'unsupported', replacement: 'openai/gpt-5.4-mini' }],
      ['openai/gpt-5.4-mini-2026-03-17', { status: 'unsupported', replacement: 'openai/gpt-5.4-mini' }],
      ['openai/gpt-5.5-2026-04-23', { status: 'unsupported', replacement: 'openai/gpt-5.5' }],
      // OpenClaw 2026.9.7 resolves these unlisted ids through forward-compat rules.
      ['openai/gpt-5.6', { status: 'unverified' }],
      ['openai/chat-latest', { status: 'unverified' }],
      // Not in the catalog and not a snapshot of a listed alias: unknown, so never rejected.
      ['openai/gpt-4o-mini', { status: 'unverified' }],
      ['openai/gpt-4o-2024-08-06', { status: 'unverified' }],
      // Anthropic, Google and xAI may resolve unlisted ids; they are not judged.
      ['anthropic/claude-haiku-4-5-20251001', { status: 'unverified' }],
      ['anthropic/claude-haiku-4-5', { status: 'unverified' }],
      ['openai/gpt-5.4-mini', { status: 'supported' }],
      ['openai/gpt-5.5', { status: 'supported' }],
      ['ollama/qwen2.5:latest', { status: 'unverified' }],
      ['openrouter/auto', { status: 'unverified' }],
      ['openai-compatible/local-model', { status: 'unverified' }],
      ['google/gemini-2.5-flash', { status: 'unverified' }],
      ['gpt-5.4-mini', { status: 'unverified' }],
      ['', { status: 'unverified' }],
    ]
    for (const [model, expected] of rows) assert.deepStrictEqual(checkOpenClawModelSupport(model), expected, model)
    assert.deepStrictEqual(
      filterOpenClawRunnableModels(['openai/gpt-5.4-mini', 'openai/gpt-5.4-mini-2026-03-17', 'ollama/llama3', 'openai/gpt-5.6', 'anthropic/claude-haiku-4-5-20251001', 'openai/gpt-5.5']),
      ['openai/gpt-5.4-mini', 'ollama/llama3', 'openai/gpt-5.6', 'anthropic/claude-haiku-4-5-20251001', 'openai/gpt-5.5'],
    )
  })

  test('rejection names the slot, the runtime and the explicit replacement', () => {
    process.env.OPENCLAW_BIN = launcher
    clearOpenClawModelCatalogCache()
    const message = describeOpenClawModelRejection([
      { model: 'openai/gpt-5.5', label: 'primary model' },
      { model: 'openai/gpt-5.4-mini-2026-03-17', label: 'backup model' },
    ])
    assert(message, 'Expected the backup model to be rejected')
    assert(message.startsWith('The backup model `openai/gpt-5.4-mini-2026-03-17` is not in the openai model catalog of the installed OpenClaw 2026.9.7 runtime'), message)
    assert(message.includes('Use `openai/gpt-5.4-mini`'), message)
    assert.strictEqual(describeOpenClawModelRejection([{ model: 'openai/gpt-5.5', label: 'primary model' }, { model: undefined, label: 'backup model' }]), null)
    assert.strictEqual(describeOpenClawModelRejection([{ model: 'openai/gpt-5.6', label: 'primary model' }, { model: 'openai/gpt-4o-mini', label: 'backup model' }]), null, 'Unverified models are never rejected')
  })

  test('custom profiles, unreadable configuration and other versions are never falsely rejected', () => {
    const catalog = { version: '2026.9.7', providers: new Map([['openai', new Set(['gpt-5.4-mini'])]]) }
    const snapshot = 'openai/gpt-5.4-mini-2026-03-17'
    const configPath = process.env.OPENCLAW_CONFIG_PATH!
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    for (const content of [
      JSON.stringify({ models: { providers: { openai: { models: [{ id: 'gpt-5.4-mini-2026-03-17' }] } } } }),
      '{ // JSON5 custom configuration\n models: {} }',
      JSON.stringify({ models: { $include: './models.json' } }),
    ]) {
      fs.writeFileSync(configPath, content)
      assert.equal(checkOpenClawModelSupport(snapshot, catalog).status, 'unverified')
      assert.deepEqual(filterOpenClawRunnableModels([snapshot], catalog), [snapshot])
    }
    fs.writeFileSync(configPath, '{}')
    assert.equal(checkOpenClawModelSupport(snapshot, catalog).status, 'unsupported', 'custom config changes are not stale-cached')
    for (const version of [undefined, '2026.9.8', '2026.3.28']) {
      assert.equal(checkOpenClawModelSupport(snapshot, { ...catalog, version }).status, 'unverified')
    }
    fs.unlinkSync(configPath)
  })

  test('image-only models are rejected even without a catalog; custom namespaces are preserved', () => {
    for (const model of ['openai/chatgpt-image-latest', 'openai/gpt-image-1', 'openai/dall-e-3']) {
      assert.equal(checkOpenClawModelSupport(model, null).status, 'unsupported')
      assert(describeOpenClawModelRejection([{ model, label: 'model' }], null)?.includes('generates images'))
    }
    assert.equal(checkOpenClawModelSupport('ollama/chatgpt-image-latest', null).status, 'unverified')
    assert.equal(checkOpenClawModelSupport('openai/gpt-5.4-mini', null).status, 'unverified')
  })

  test('without a readable installation nothing is ruled out or claimed', () => {
    process.env.OPENCLAW_BIN = path.join(tmp, 'missing', 'openclaw')
    clearOpenClawModelCatalogCache()
    assert.strictEqual(getOpenClawModelCatalog(), null)
    assert.deepStrictEqual(checkOpenClawModelSupport('openai/gpt-5.4-mini-2026-03-17'), { status: 'unverified' })
    assert.deepStrictEqual(filterOpenClawRunnableModels(['openai/gpt-5.4-mini-2026-03-17']), ['openai/gpt-5.4-mini-2026-03-17'])
    assert.strictEqual(describeOpenClawModelRejection([{ model: 'openai/gpt-5.4-mini-2026-03-17', label: 'model' }]), null)
  })
} finally {
  if (previousConfig === undefined) delete process.env.OPENCLAW_CONFIG_PATH
  else process.env.OPENCLAW_CONFIG_PATH = previousConfig
  if (previousBin === undefined) delete process.env.OPENCLAW_BIN
  else process.env.OPENCLAW_BIN = previousBin
  if (previousRoot === undefined) delete process.env.OPENCLAW_PACKAGE_ROOT
  else process.env.OPENCLAW_PACKAGE_ROOT = previousRoot
  clearOpenClawModelCatalogCache()
  fs.rmSync(tmp, { recursive: true, force: true })
}

if (!process.exitCode) console.log(`openclaw-model-catalog.test.ts: ${passed} tests passed`)
