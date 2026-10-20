/**
 * Integration validation test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/integration-validation.test.ts
 */

import { validateAnthropicKey, validateCogneeConfig, validateGeminiKey, validateIntegrations, validateOllamaConfig, validateOpenAICompatibleConfig, validateOpenAIKey, validateOpenRouterKey, validateOpikConfig, validateSensoConfig, validateXaiKey } from './integration-validation'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function mockFetch(status: number, body: any = {}): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as any
}

function captureFetch(
  status: number,
  recorder: { url?: string; init?: RequestInit }
): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    recorder.url = url
    recorder.init = init
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({}),
    } as any
  }) as any
}

function mockOllamaFetch(models: string[]): typeof fetch {
  return (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ models: models.map((name) => ({ name })) }),
  })) as any
}

console.log(`\n${YELLOW}=== Integration Validation Test Suite ===${RESET}\n`)

async function run() {
  const providers = [
    { name: 'OpenAI', key: 'sk-test', validate: validateOpenAIKey, catalog: false },
    { name: 'Anthropic', key: 'sk-ant-test', validate: validateAnthropicKey, catalog: false },
    { name: 'Gemini', key: 'gemini-test', validate: validateGeminiKey, catalog: false },
    { name: 'OpenRouter', key: 'sk-or-test', validate: validateOpenRouterKey, catalog: true },
    { name: 'xAI', key: 'xai-test', validate: validateXaiKey, catalog: true },
  ]
  for (const provider of providers) {
    await test(`${provider.name} skips blank credentials without network access`, async () => {
      let calls = 0
      const result = await provider.validate('  ', (async () => { calls++; throw new Error('unexpected request') }) as typeof fetch)
      assert(result.ok && result.status === 'skipped', 'Expected optional unconfigured provider')
      assert(calls === 0, 'Blank credentials must not reach the network')
    })
    for (const status of [401, 403, 400, 404, 402, 429, 500]) {
      await test(`${provider.name} classifies HTTP ${status} without accepting failed requests`, async () => {
        let calls = 0
        const result = await provider.validate(provider.key, (async () => {
          calls++
          return mockFetch(provider.catalog && calls === 1 ? 200 : status)('https://unused.test')
        }) as typeof fetch)
        const invalidStatus = status === 401 || status === 403
          || (provider.name !== 'Gemini' && [400, 404].includes(status))
          || (provider.catalog && status === 402)
        assert(result.status === (invalidStatus ? 'invalid' : 'error'), `Unexpected status: ${result.status}`)
        assert(!result.ok, 'Failed request must not be accepted')
        assert(result.message.includes(provider.name), 'Expected provider-specific guidance')
        assert(calls === (provider.catalog ? 2 : 1), 'Unexpected request count')
      })
    }
    for (const failure of [new Error('connection refused'), {}]) {
      await test(`${provider.name} reports network errors with a fallback message`, async () => {
        const result = await provider.validate(provider.key, (async () => { throw failure }) as typeof fetch)
        assert(!result.ok && result.status === 'error', 'Network failure must not validate credentials')
        assert(result.message.includes(failure instanceof Error ? failure.message : 'network error'), 'Missing network guidance')
      })
    }
    if (provider.catalog) {
      for (const status of [401, 403, 503]) {
        for (const body of [{}, { message: 'Catalog unavailable' }]) {
          await test(`${provider.name} stops after catalog HTTP ${status} (${JSON.stringify(body)})`, async () => {
            let calls = 0
            const result = await provider.validate(provider.key, (async () => {
              calls++
              return mockFetch(status, body)('https://unused.test')
            }) as typeof fetch)
            assert(calls === 1, 'Failed catalog must prevent a completion request')
            assert(result.status === (status === 503 ? 'error' : 'invalid'), 'Wrong catalog error classification')
            assert(result.message === ('message' in body ? body.message : status === 503 ? `${provider.name} models check returned 503` : `${provider.name} rejected this key`), 'Wrong catalog guidance')
          })
        }
      }
    }
  }

  for (const [name, validate, key] of [
    ['OpenAI', validateOpenAIKey, 'sk-test'],
    ['xAI', validateXaiKey, 'xai-test'],
  ] as const) {
    for (const warning of ['does not exist', 'do not have access', 'not found', 'unsupported', 'unavailable']) {
      await test(`${name} retains authenticated model-availability warning: ${warning}`, async () => {
        let calls = 0
        const message = `Validation model ${warning}`
        const result = await validate(key, (async () => {
          calls++
          return mockFetch(name === 'xAI' && calls === 1 ? 200 : 404, { error: { message } })('https://unused.test')
        }) as typeof fetch)
        assert(result.ok && result.status === 'valid', 'Model availability is not an invalid credential')
        assert(result.message.includes(message) && result.message.includes('other models'), 'Warning must explain limited validation')
      })
    }
  }

  for (const body of [{ message: '  Request rejected  ' }, { error: { message: 42 } }, { error: { message: ' ' } }, null]) {
    await test(`OpenAI handles provider error payload ${JSON.stringify(body)}`, async () => {
      const result = await validateOpenAIKey('sk-test', mockFetch(400, body))
      assert(!result.ok && result.status === 'invalid', 'Malformed/error payload must not validate')
      assert(result.message === (body?.message ? 'Request rejected' : 'OpenAI key could not complete a test prompt on gpt-4o-mini'), 'Expected trimmed message or safe fallback')
    })
  }
  await test('non-JSON provider errors fall back to actionable guidance', async () => {
    const result = await validateOpenAIKey('sk-test', async () => new Response('<html>Bad request</html>', { status: 400 }))
    assert(result.status === 'invalid' && /could not complete/.test(result.message), 'Expected non-JSON fallback')
  })

  await test('credential mismatch checks reject every recognized foreign provider and app credential', async () => {
    let calls = 0
    const noNetwork = (async () => { calls++; throw new Error('unexpected request') }) as typeof fetch
    for (const key of ['AIza' + 'a'.repeat(24), 'sk-ant-test-value']) {
      assert((await validateOpenAIKey(key, noNetwork)).status === 'invalid', 'Expected foreign key rejection')
    }
    for (const key of ['sk-openai-test-value', 'AIza' + 'a'.repeat(24), 'random-key', 'sess-token', '1//token', 'ghp_token', 'github_pat_token']) {
      assert((await validateAnthropicKey(key, noNetwork)).status === 'invalid', 'Expected non-Anthropic key rejection')
    }
    assert((await validateGeminiKey('sk-ant-test-value', noNetwork)).status === 'invalid', 'Expected Anthropic/Gemini mismatch')
    assert(calls === 0, 'Invalid credential shapes must never be transmitted')
  })

  for (const stage of ['models', 'completion']) {
    for (const status of [401, 403, 400, 404, 500]) {
      for (const detail of ['', 'Provider diagnostic']) {
        await test(`compatible endpoint classifies ${stage} HTTP ${status}, detail=${!!detail}`, async () => {
          const requests: string[] = []
          const result = await validateOpenAICompatibleConfig(' https://local.example.test/v1/// ', ' key ', 'chat-model', (async (url, init) => {
            requests.push(String(url))
            assert((init?.headers as Record<string, string>).Authorization === 'Bearer key', 'Expected trimmed authorization')
            if (stage === 'completion' && requests.length === 1) return mockFetch(200, { data: [{ id: 'chat-model' }] })('https://unused.test')
            return mockFetch(status, detail ? { error: { message: detail } } : {})('https://unused.test')
          }) as typeof fetch)
          assert(requests[0] === 'https://local.example.test/v1/models', 'Expected normalized URL')
          assert(requests.length === (stage === 'models' ? 1 : 2), 'Catalog failure must stop completion')
          const invalidStatus = status === 401 || status === 403 || (stage === 'completion' && [400, 404].includes(status))
          assert(!result.ok && result.status === (invalidStatus ? 'invalid' : 'error'), 'Wrong failure classification')
          assert(detail ? result.message === detail : result.message.includes('OpenAI-compatible'), 'Missing provider diagnostic/fallback')
        })
      }
    }
  }
  await test('compatible endpoint rejects missing URL and empty/malformed catalogs', async () => {
    assert((await validateOpenAICompatibleConfig('', '', '', mockFetch(200))).status === 'skipped', 'Expected optional endpoint')
    assert((await validateOpenAICompatibleConfig('', 'key', '', mockFetch(200))).status === 'invalid', 'Credentials require URL')
    for (const body of [{}, { data: [] }, { data: [{}, { id: ' ' }] }]) {
      const result = await validateOpenAICompatibleConfig('https://local.example.test/v1', '', '', mockFetch(200, body))
      assert(result.status === 'invalid' && /no models/.test(result.message), 'Empty catalogs cannot validate chat')
    }
    for (const failure of [new Error('offline'), {}]) {
      const result = await validateOpenAICompatibleConfig('https://local.example.test/v1', '', '', (async () => { throw failure }) as typeof fetch)
      assert(result.status === 'error' && result.message.includes(failure instanceof Error ? 'offline' : 'network error'), 'Expected connection error')
    }
  })

  await test('Ollama distinguishes missing models, missing API and connection failures', async () => {
    for (const body of [{}, { models: [{}, { name: ' ' }] }]) {
      const result = await validateOllamaConfig('https://ollama.example.test/', '', mockFetch(200, body))
      assert(result.status === 'invalid' && /no local models/.test(result.message), 'Expected empty model guidance')
    }
    assert((await validateOllamaConfig('https://ollama.example.test', 'missing', mockOllamaFetch(['other']))).status === 'invalid', 'Missing default must fail')
    const available = await validateOllamaConfig('https://ollama.example.test', '', mockOllamaFetch(['one', 'two']))
    assert(available.ok && /2 installed/.test(available.message), 'Expected available model count')
    for (const status of [404, 503]) {
      const result = await validateOllamaConfig('https://ollama.example.test', '', mockFetch(status))
      assert(result.status === (status === 404 ? 'invalid' : 'error'), 'Wrong Ollama HTTP classification')
    }
    for (const failure of [new Error('offline'), {}]) {
      const result = await validateOllamaConfig('', 'llama', (async () => { throw failure }) as typeof fetch)
      assert(result.status === 'error' && result.message.includes(failure instanceof Error ? 'offline' : 'connection error'), 'Expected Ollama connection guidance')
    }
  })

  await test('Opik encodes project, trims credentials and classifies failed requests', async () => {
    for (const status of [200, 401, 403, 404, 500]) {
      const request: { url?: string; init?: RequestInit } = {}
      const result = await validateOpikConfig(' key ', ' team ', ' project / name ', captureFetch(status, request))
      assert(request.url?.includes('project_name=project%20%2F%20name') === true, 'Project must be URL encoded')
      const headers = request.init?.headers as Record<string, string>
      assert(headers.Authorization === 'key' && headers['Comet-Workspace'] === 'team', 'Expected trimmed credentials')
      assert(result.status === (status === 200 ? 'valid' : status === 500 ? 'error' : 'invalid'), 'Wrong Opik classification')
    }
    for (const failure of [new Error('offline'), {}]) {
      const result = await validateOpikConfig('key', 'team', '', (async () => { throw failure }) as typeof fetch)
      assert(result.status === 'error' && result.message.includes(failure instanceof Error ? 'offline' : 'network error'), 'Expected Opik connection guidance')
    }
  })
  await test('self-hosted Cognee does not claim live API validation', async () => {
    const result = await validateCogneeConfig('', 'https://cognee.example.test', '', '')
    assert(result.ok && /self-hosted/.test(result.message) && /requires one/.test(result.message), 'Expected optional key guidance')
  })

  await test('validateOpenAIKey returns valid on 200', async () => {
    const request: { url?: string; init?: RequestInit } = {}
    const result = await validateOpenAIKey('sk-test', captureFetch(200, request))
    assert(result.status === 'valid', 'Expected valid status')
    assert(!!request.url?.includes('/v1/chat/completions'), 'Expected OpenAI prompt validation endpoint')
    assert(request.init?.method === 'POST', 'Expected OpenAI validation to POST a test completion')
    const headers = request.init?.headers as Record<string, string> | undefined
    assert(headers?.['content-type'] === 'application/json', 'Expected OpenAI validation to send JSON content-type')
  })

  await test('validateAnthropicKey returns invalid on 401', async () => {
    const result = await validateAnthropicKey('sk-ant-test', mockFetch(401))
    assert(result.status === 'invalid', 'Expected invalid status')
  })

  await test('validateAnthropicKey posts a tiny test prompt', async () => {
    const request: { url?: string; init?: RequestInit } = {}
    const result = await validateAnthropicKey('sk-ant-test', captureFetch(200, request))
    assert(result.status === 'valid', 'Expected valid status')
    assert(!!request.url?.includes('/v1/messages'), 'Expected Anthropic messages endpoint')
    assert(request.init?.method === 'POST', 'Expected Anthropic validation to POST a test prompt')
  })

  await test('validateGeminiKey returns valid on 200', async () => {
    const result = await validateGeminiKey('gemini-test', mockFetch(200))
    assert(result.status === 'valid', 'Expected valid status')
  })

  await test('validateOpenRouterKey checks native catalog and completion endpoints', async () => {
    const requests: string[] = []
    const result = await validateOpenRouterKey('sk-or-test', (async (url: string) => {
      requests.push(url)
      return {
        ok: true,
        status: 200,
        json: async () => url.endsWith('/models') ? { data: [{ id: 'openrouter/auto' }] } : { choices: [{ message: { content: 'OK' } }] },
      } as any
    }) as any)
    assert(result.status === 'valid', 'Expected valid OpenRouter key')
    assert(requests[0] === 'https://openrouter.ai/api/v1/models', 'Expected native OpenRouter catalog endpoint')
    assert(requests[1] === 'https://openrouter.ai/api/v1/chat/completions', 'Expected native OpenRouter completion endpoint')
  })

  await test('validateOpenRouterKey rejects non-OpenRouter key shapes before network use', async () => {
    const result = await validateOpenRouterKey('sk-openai-test', mockFetch(200))
    assert(result.status === 'invalid', 'Expected non-OpenRouter key rejected')
    assert(/sk-or-/i.test(result.message), 'Expected actionable OpenRouter key prefix guidance')
  })

  await test('validateXaiKey checks the native catalog and completion endpoints', async () => {
    const requests: string[] = []
    const result = await validateXaiKey('xai-test', (async (url: string) => {
      requests.push(url)
      return { ok: true, status: 200, json: async () => ({}) } as any
    }) as any)
    assert(result.status === 'valid', 'Expected valid xAI key')
    assert(requests[0] === 'https://api.x.ai/v1/models', 'Expected native xAI catalog endpoint')
    assert(requests[1] === 'https://api.x.ai/v1/chat/completions', 'Expected native xAI completion endpoint')
  })

  await test('validateXaiKey rejects non-xAI key shapes before network use', async () => {
    const result = await validateXaiKey('sk-openai-test', mockFetch(200))
    assert(result.status === 'invalid', 'Expected non-xAI key rejected')
    assert(/xai-/i.test(result.message), 'Expected actionable xAI key prefix guidance')
  })

  await test('validateOpenAIKey rejects obvious Anthropic key shape before network validation', async () => {
    const result = await validateOpenAIKey('sk-ant-api03-test-value', mockFetch(200))
    assert(result.status === 'invalid', 'Expected invalid status')
    assert(/Anthropic key/i.test(result.message), 'Expected mismatch message to mention Anthropic key')
  })

  await test('validateGeminiKey rejects obvious OpenAI key shape before network validation', async () => {
    const result = await validateGeminiKey('sk-proj-test-value', mockFetch(200))
    assert(result.status === 'invalid', 'Expected invalid status')
    assert(/OpenAI key/i.test(result.message), 'Expected mismatch message to mention OpenAI key')
  })

  await test('validateOpenAIKey rejects obvious session or subscription credentials before network validation', async () => {
    const result = await validateOpenAIKey('sess_demo_subscription_key', mockFetch(200))
    assert(result.status === 'invalid', 'Expected invalid status')
    assert(/developer API key|subscription or app credentials/i.test(result.message), 'Expected subscription credential warning')
  })

  await test('validateOpenAIKey surfaces provider error message for 400 responses', async () => {
    const result = await validateOpenAIKey('sk-test', mockFetch(400, {
      error: { message: 'The model `gpt-4o-mini` does not exist or you do not have access to it.' },
    }))
    assert(result.status === 'valid', 'Expected non-blocking valid status for unavailable validation model')
    assert(/may still work for other models/i.test(result.message), 'Expected warning that other models may still work')
    assert(/does not exist|do not have access/i.test(result.message), 'Expected provider error message to be surfaced')
  })

  await test('validateAnthropicKey rejects non-developer credential shapes before network validation', async () => {
    const result = await validateAnthropicKey('ya29.demo-token', mockFetch(200))
    assert(result.status === 'invalid', 'Expected invalid status')
    assert(/subscription or app credentials|developer API key/i.test(result.message), 'Expected Anthropic credential warning')
  })

  await test('validateOpenAICompatibleConfig accepts reachable endpoint without API key', async () => {
    let calls = 0
    const result = await validateOpenAICompatibleConfig('http://127.0.0.1:1234/v1', '', '', (async (url: string) => {
      calls++
      if (url.endsWith('/models')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: 'text-embedding-nomic-embed-text-v1.5' }, { id: 'local-model' }] }),
        } as any
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
      } as any
    }) as any)
    assert(result.status === 'valid', 'Expected valid status')
    assert(calls === 2, `Expected 2 OpenAI-compatible calls, got ${calls}`)
  })

  await test('validateOpenAICompatibleConfig rejects embedding-only endpoints by default', async () => {
    const result = await validateOpenAICompatibleConfig('http://127.0.0.1:1234/v1', '', '', (async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'text-embedding-nomic-embed-text-v1.5' }] }),
    })) as any)
    assert(result.status === 'invalid', 'Expected invalid status')
    assert(/non-chat|Load all discovered models/i.test(result.message), 'Expected unsupported-model guidance')
  })

  await test('validateOpenAICompatibleConfig rejects configured embedding defaults explicitly', async () => {
    const result = await validateOpenAICompatibleConfig('http://127.0.0.1:1234/v1', '', 'text-embedding-nomic-embed-text-v1.5', (async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'text-embedding-nomic-embed-text-v1.5' }, { id: 'qwen3-8b' }] }),
    })) as any)
    assert(result.status === 'invalid', 'Expected invalid status for embedding default')
    assert(/does not look chat-capable/i.test(result.message), 'Expected chat-capable guidance')
  })

  await test('validateOpenAICompatibleConfig rejects unavailable configured default model', async () => {
    const result = await validateOpenAICompatibleConfig('http://127.0.0.1:1234/v1', '', 'missing-model', (async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'local-model' }] }),
    })) as any)
    assert(result.status === 'invalid', 'Expected invalid status')
    assert(/default model/i.test(result.message), 'Expected missing default model message')
  })

  await test('validateOpikConfig requires workspace when key is present', async () => {
    const result = await validateOpikConfig('opik-key', '', 'clawmax', mockFetch(200))
    assert(result.status === 'invalid', 'Expected invalid status for missing workspace')
  })

  await test('validateOllamaConfig returns valid when default model exists', async () => {
    const result = await validateOllamaConfig('http://localhost:11434', 'llama3.2', mockOllamaFetch(['llama3.2', 'qwen2.5']))
    assert(result.status === 'valid', 'Expected valid status')
  })

  await test('validateSensoConfig checks presence of key', async () => {
    const result = await validateSensoConfig('senso-key')
    assert(result.status === 'valid', 'Expected valid status')
  })

  await test('validateCogneeConfig accepts Cloud API key and self-hosted URL defaults', async () => {
    const result = await validateCogneeConfig('cognee-key', 'https://cognee.example.test', 'clawmax-memory', 'GRAPH_COMPLETION')
    assert(result.status === 'valid', 'Expected valid status')
  })

  await test('validateCogneeConfig rejects invalid self-hosted base URL', async () => {
    const result = await validateCogneeConfig('', 'not a url', '', '')
    assert(result.status === 'invalid', 'Expected invalid status for malformed Cognee Base URL')
  })

  await test('validateIntegrations aggregates provider checks', async () => {
    const result = await validateIntegrations({
      openai: 'sk-openai-test-value',
      openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
      anthropic: 'sk-ant-test-value',
      gemini: 'gemini-key',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaDefaultModel: 'llama3.2',
      opikApiKey: 'opik-key',
      opikWorkspace: 'team',
      opikProject: 'clawmax',
      sensoApiKey: 'senso-key',
      cogneeApiKey: 'cognee-key',
      cogneeBaseUrl: 'https://cognee.example.test',
      cogneeDatasetName: 'clawmax-memory',
      cogneeSearchType: 'GRAPH_COMPLETION',
    }, (async (url: string) => {
      if (url.includes('/api/tags')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ models: [{ name: 'llama3.2' }] }),
        } as any
      }
      if (url.includes('127.0.0.1:1234/v1/models')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: 'local-model' }] }),
        } as any
      }
      if (url.includes('127.0.0.1:1234/v1/chat/completions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
        } as any
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as any
    }) as any)

    assert(result.openai?.status === 'valid', 'Expected OpenAI valid')
    assert(result.openaiCompatible?.status === 'valid', 'Expected OpenAI-compatible valid')
    assert(result.anthropic?.status === 'valid', 'Expected Anthropic valid')
    assert(result.gemini?.status === 'valid', 'Expected Gemini valid')
    assert(result.ollama?.status === 'valid', 'Expected Ollama valid')
    assert(result.opik?.status === 'valid', 'Expected Opik valid')
    assert(result.senso?.status === 'valid', 'Expected Senso valid')
    assert(result.cognee?.status === 'valid', 'Expected Cognee valid')
  })

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) {
    console.log(`${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`${GREEN}All tests passed${RESET}`)
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
