import assert from 'assert'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const workspaceModulePath = require.resolve('../lib/workspace')
const workspaceIntegrationsModulePath = require.resolve('../lib/workspace-integrations')
const agentExecutionModulePath = require.resolve('../lib/agent-execution')
const agentRuntimeModulePath = require.resolve('../lib/agent-runtime')
const runtimeSessionsModulePath = require.resolve('../lib/runtime-sessions')
const skillsModulePath = require.resolve('../lib/skills')
const safeEnvModulePath = require.resolve('../lib/safe-env')
const wsModulePath = require.resolve('ws')

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed++
    })
    .catch((err: any) => {
      console.log(`${RED}✗${RESET} ${name}`)
      console.error(`  Error: ${err.message}`)
      testsFailed++
    })
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    ...overrides,
  } as any
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
    headersSent: false,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: any) {
      this.jsonBody = body
      this.headersSent = true
      return this
    },
    writeHead(code: number) {
      this.statusCode = code
      return this
    },
    flushHeaders() {},
    write() {},
    end() {
      this.headersSent = true
    },
  }
}

/** SSE-flavored res mock: parses `data: {...}\n\n` frames written by chat.ts's send() helper and
 *  exposes a `done` promise that resolves the first time end() is called, so tests can await
 *  actual SSE completion instead of the route handler's own (largely un-awaited) returned promise. */
function makeSseRes() {
  const events: { type: string; data: any }[] = []
  let ended = false
  let resolveDone: () => void = () => {}
  const done = new Promise<void>((resolve) => { resolveDone = resolve })
  return {
    statusCode: 200,
    writeHead() { return this },
    flushHeaders() {},
    write(chunk: string) {
      const match = /^data: (.*)\n\n$/.exec(String(chunk))
      if (match) {
        try { events.push(JSON.parse(match[1])) } catch {}
      }
    },
    end() {
      if (!ended) {
        ended = true
        resolveDone()
      }
    },
    get writableEnded() { return ended },
    events,
    done,
  }
}

function getRouteHandler(method: 'get' | 'post', routePath: string) {
  delete require.cache[require.resolve('./chat')]
  const router = require('./chat').default
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
}

async function withModuleOverrides<T>(modulePath: string, overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> {
  delete require.cache[modulePath]
  const mod = require(modulePath)
  const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, mod[key]]))
  Object.assign(mod, overrides)
  delete require.cache[require.resolve('./chat')]
  try {
    return await fn()
  } finally {
    Object.assign(mod, originals)
    delete require.cache[require.resolve('./chat')]
  }
}

async function withFakeWebSocket<T>(mode: 'open' | 'error', fn: () => Promise<T> | T): Promise<T> {
  delete require.cache[wsModulePath]
  const originalModule = require(wsModulePath)

  class FakeWebSocket {
    handlers: Record<string, Function[]> = {}
    constructor(_url: string, _options: any) {
      setImmediate(() => {
        const event = mode === 'open' ? 'open' : 'error'
        for (const handler of this.handlers[event] || []) handler(new Error('simulated connection issue'))
      })
    }
    on(event: string, handler: Function) {
      this.handlers[event] ||= []
      this.handlers[event].push(handler)
    }
    close() {}
  }

  require.cache[wsModulePath] = {
    ...(require.cache[wsModulePath] || {}),
    id: wsModulePath,
    filename: wsModulePath,
    loaded: true,
    exports: {
      __esModule: true,
      default: FakeWebSocket,
    },
  } as any
  delete require.cache[require.resolve('./chat')]
  try {
    return await fn()
  } finally {
    require.cache[wsModulePath] = {
      ...(require.cache[wsModulePath] || {}),
      id: wsModulePath,
      filename: wsModulePath,
      loaded: true,
      exports: originalModule,
    } as any
    delete require.cache[require.resolve('./chat')]
  }
}

console.log(`\n${YELLOW}=== Chat Route Edge Test Suite ===${RESET}\n`)

async function run() {
  await test('gateway route returns 404 when the agent gateway is not configured', async () => {
    await withModuleOverrides(workspaceModulePath, {
      getAgentGatewayConfig: () => null,
    }, async () => {
      const handler = getRouteHandler('get', '/:id/gateway')
      const res = makeRes()
      await handler(makeReq({ params: { id: 'valid-agent' } }), res)
      assert.strictEqual(res.statusCode, 404)
      assert.strictEqual(res.jsonBody?.available, false)
      assert(/Gateway not configured/i.test(res.jsonBody?.error || ''))
    })
  })

  await test('gateway route marks the gateway available after a successful websocket open', async () => {
    await withModuleOverrides(workspaceModulePath, {
      getAgentGatewayConfig: () => ({ port: 18789, token: 'secret', wsUrl: 'ws://127.0.0.1:18789', httpUrl: 'http://127.0.0.1:18789' }),
    }, async () => {
      await withFakeWebSocket('open', async () => {
        const handler = getRouteHandler('get', '/:id/gateway')
        const res = makeRes()
        await handler(makeReq({ params: { id: 'valid-agent' } }), res)
        await new Promise((resolve) => setTimeout(resolve, 10))
        assert.strictEqual(res.statusCode, 200)
        assert.strictEqual(res.jsonBody?.available, true)
        assert.strictEqual(res.jsonBody?.hasToken, true)
      })
    })
  })

  await test('gateway route marks the gateway unavailable after a websocket error', async () => {
    await withModuleOverrides(workspaceModulePath, {
      getAgentGatewayConfig: () => ({ port: 18789, token: '', wsUrl: 'ws://127.0.0.1:18789', httpUrl: 'http://127.0.0.1:18789' }),
    }, async () => {
      await withFakeWebSocket('error', async () => {
        const handler = getRouteHandler('get', '/:id/gateway')
        const res = makeRes()
        await handler(makeReq({ params: { id: 'valid-agent' } }), res)
        await new Promise((resolve) => setTimeout(resolve, 10))
        assert.strictEqual(res.statusCode, 200)
        assert.strictEqual(res.jsonBody?.available, false)
        assert.strictEqual(res.jsonBody?.hasToken, false)
      })
    })
  })

  await test('chat readiness reports missing model configuration before runtime execution', async () => {
    await withModuleOverrides(agentExecutionModulePath, {
      resolveAgentExecutionConfig: () => ({
        workspace: '/tmp/workspace/AGENTS/valid-agent',
        model: '',
        provider: 'openai',
      }),
      deriveWorkspaceRootFromAgentWorkspace: () => '/tmp/workspace',
    }, async () => {
      await withModuleOverrides(workspaceIntegrationsModulePath, {
        readWorkspaceIntegrationConfig: () => ({}),
      }, async () => {
        await withModuleOverrides(safeEnvModulePath, {
          userExecutionEnv: () => ({}),
        }, async () => {
          const handler = getRouteHandler('post', '/:id/chat/readiness')
          const res = makeRes()
          await handler(makeReq({ params: { id: 'valid-agent' }, body: {} }), res)
          assert.strictEqual(res.statusCode, 200)
          assert.strictEqual(res.jsonBody?.available, false)
          assert(/has no model configured/i.test(res.jsonBody?.error || ''))
        })
      })
    })
  })

  await test('chat readiness uses BYOK fallback models to become available when hosted keys exist', async () => {
    await withModuleOverrides(agentExecutionModulePath, {
      resolveAgentExecutionConfig: () => ({
        workspace: '/tmp/workspace/AGENTS/valid-agent',
        model: '',
        provider: 'openai',
      }),
      deriveWorkspaceRootFromAgentWorkspace: () => '/tmp/workspace',
    }, async () => {
      await withModuleOverrides(workspaceIntegrationsModulePath, {
        readWorkspaceIntegrationConfig: () => ({}),
      }, async () => {
        await withModuleOverrides(safeEnvModulePath, {
          userExecutionEnv: () => ({ OPENAI_API_KEY: 'sk-test' }),
        }, async () => {
          const handler = getRouteHandler('post', '/:id/chat/readiness')
          const res = makeRes()
          await handler(makeReq({ params: { id: 'valid-agent' }, body: { byok: { openai: 'sk-browser' } } }), res)
          assert.strictEqual(res.statusCode, 200)
          assert.strictEqual(res.jsonBody?.available, true)
          assert.strictEqual(res.jsonBody?.resolvedAgent?.model, 'openai/gpt-5.4-mini')
          assert.strictEqual(res.jsonBody?.resolvedAgent?.provider, 'openai')
        })
      })
    })
  })

  await test('chat readiness does not treat unrelated local runtimes as a hosted provider fallback', async () => {
    await withModuleOverrides(agentExecutionModulePath, {
      resolveAgentExecutionConfig: () => ({
        workspace: '/tmp/workspace/AGENTS/openai-agent',
        model: 'openai/gpt-5.4-mini',
        provider: 'openai',
      }),
      deriveWorkspaceRootFromAgentWorkspace: () => '/tmp/workspace',
    }, async () => {
      await withModuleOverrides(workspaceIntegrationsModulePath, {
        readWorkspaceIntegrationConfig: () => ({
          ollamaBaseUrl: 'http://ollama:11434',
          openaiCompatibleBaseUrl: 'http://lmstudio:1234/v1',
        }),
      }, async () => {
        await withModuleOverrides(safeEnvModulePath, {
          userExecutionEnv: () => ({
            OLLAMA_BASE_URL: 'http://ollama:11434',
            OPENAI_BASE_URL: 'http://lmstudio:1234/v1',
          }),
        }, async () => {
          const handler = getRouteHandler('post', '/:id/chat/readiness')
          const res = makeRes()
          await handler(makeReq({ params: { id: 'openai-agent' }, body: {} }), res)
          assert.strictEqual(res.statusCode, 200)
          assert.strictEqual(res.jsonBody?.available, false)
          assert(/no openai credential is available/i.test(res.jsonBody?.error || ''))
        })
      })
    })
  })

  await test('chat readiness explains missing OpenAI-compatible base URLs clearly', async () => {
    await withModuleOverrides(agentExecutionModulePath, {
      resolveAgentExecutionConfig: () => ({
        workspace: '/tmp/workspace/AGENTS/lm-agent',
        model: 'openai-compatible/qwen3',
        provider: 'openai-compatible',
      }),
      deriveWorkspaceRootFromAgentWorkspace: () => '/tmp/workspace',
    }, async () => {
      await withModuleOverrides(workspaceIntegrationsModulePath, {
        readWorkspaceIntegrationConfig: () => ({}),
      }, async () => {
        await withModuleOverrides(safeEnvModulePath, {
          userExecutionEnv: () => ({}),
        }, async () => {
          const handler = getRouteHandler('post', '/:id/chat/readiness')
          const res = makeRes()
          await handler(makeReq({ params: { id: 'lm-agent' }, body: {} }), res)
          assert.strictEqual(res.statusCode, 200)
          assert.strictEqual(res.jsonBody?.available, false)
          assert(/no OpenAI-compatible Base URL is configured/i.test(res.jsonBody?.error || ''))
        })
      })
    })
  })

  await test('chat readiness surfaces the runtime-specific missing-CLI error for a claude-pinned agent', async () => {
    await withModuleOverrides(agentExecutionModulePath, {
      resolveAgentExecutionConfig: () => ({
        workspace: '/tmp/workspace/AGENTS/claude-agent',
        model: 'anthropic/claude-sonnet-4-20250514',
        provider: 'anthropic',
        runtime: 'claude',
      }),
      deriveWorkspaceRootFromAgentWorkspace: () => '/tmp/workspace',
    }, async () => {
      await withModuleOverrides(workspaceIntegrationsModulePath, {
        readWorkspaceIntegrationConfig: () => ({}),
      }, async () => {
        await withModuleOverrides(safeEnvModulePath, {
          userExecutionEnv: () => ({}),
        }, async () => {
          await withModuleOverrides(agentRuntimeModulePath, {
            buildRuntimePlan: () => ({
              cliPath: null,
              args: [],
              missingCliError: 'Claude Code CLI is not available in this runtime. Install it or set CLAUDE_BIN to the executable path.',
              streamsDeltas: false,
            }),
          }, async () => {
            const handler = getRouteHandler('post', '/:id/chat/readiness')
            const res = makeRes()
            await handler(makeReq({ params: { id: 'claude-agent' }, body: {} }), res)
            assert.strictEqual(res.statusCode, 200)
            assert.strictEqual(res.jsonBody?.available, false)
            assert(/Claude Code CLI is not available/i.test(res.jsonBody?.error || ''), `Unexpected error: ${res.jsonBody?.error}`)
          })
        })
      })
    })
  })

  await test('chat readiness surfaces RuntimeModelError text for a non-Anthropic model pinned to claude', async () => {
    await withModuleOverrides(agentExecutionModulePath, {
      resolveAgentExecutionConfig: () => ({
        workspace: '/tmp/workspace/AGENTS/claude-agent',
        model: 'openai/gpt-5',
        provider: 'openai',
        runtime: 'claude',
      }),
      deriveWorkspaceRootFromAgentWorkspace: () => '/tmp/workspace',
    }, async () => {
      await withModuleOverrides(workspaceIntegrationsModulePath, {
        readWorkspaceIntegrationConfig: () => ({}),
      }, async () => {
        await withModuleOverrides(safeEnvModulePath, {
          userExecutionEnv: () => ({}),
        }, async () => {
          const { RuntimeModelError } = require(agentRuntimeModulePath)
          await withModuleOverrides(agentRuntimeModulePath, {
            buildRuntimePlan: () => {
              throw new RuntimeModelError("Claude Code runtime supports Anthropic models only. Agent model is 'openai/gpt-5'. Pick an Anthropic model or switch the agent's runtime.")
            },
          }, async () => {
            const handler = getRouteHandler('post', '/:id/chat/readiness')
            const res = makeRes()
            await handler(makeReq({ params: { id: 'claude-agent' }, body: {} }), res)
            assert.strictEqual(res.statusCode, 200)
            assert.strictEqual(res.jsonBody?.available, false)
            assert(/Anthropic models only/i.test(res.jsonBody?.error || ''), `Unexpected error: ${res.jsonBody?.error}`)
          })
        })
      })
    })
  })

  await test('chat readiness reports available for a droid-pinned agent once its CLI resolves', async () => {
    await withModuleOverrides(agentExecutionModulePath, {
      resolveAgentExecutionConfig: () => ({
        workspace: '/tmp/workspace/AGENTS/droid-agent',
        model: 'openai/gpt-5',
        provider: 'openai',
        runtime: 'droid',
      }),
      deriveWorkspaceRootFromAgentWorkspace: () => '/tmp/workspace',
    }, async () => {
      await withModuleOverrides(workspaceIntegrationsModulePath, {
        readWorkspaceIntegrationConfig: () => ({}),
      }, async () => {
        await withModuleOverrides(safeEnvModulePath, {
          userExecutionEnv: () => ({}),
        }, async () => {
          await withModuleOverrides(agentRuntimeModulePath, {
            buildRuntimePlan: () => ({
              cliPath: '/Users/test/.local/bin/droid',
              args: ['exec', ''],
              missingCliError: 'Factory Droid CLI is not available in this runtime. Install it or set DROID_BIN to the executable path.',
              streamsDeltas: false,
            }),
          }, async () => {
            const handler = getRouteHandler('post', '/:id/chat/readiness')
            const res = makeRes()
            await handler(makeReq({ params: { id: 'droid-agent' }, body: {} }), res)
            assert.strictEqual(res.statusCode, 200)
            assert.strictEqual(res.jsonBody?.available, true)
            assert.strictEqual(res.jsonBody?.resolvedAgent?.runtime, 'droid')
          })
        })
      })
    })
  })

  await test('chat readiness reports available for a droid-pinned agent with no model configured', async () => {
    // Regression test: the blanket "no model configured" gate must not run before the
    // non-openclaw runtime branch. Droid legitimately has no model set (e.g. a workspace running
    // purely on FACTORY_API_KEY with no hosted provider keys) and falls back to its own default —
    // see runtimeModelArg('droid', undefined) in agent-runtime.ts.
    let buildRuntimePlanCalledWithModel: string | undefined = 'not-called'
    await withModuleOverrides(agentExecutionModulePath, {
      resolveAgentExecutionConfig: () => ({
        workspace: '/tmp/workspace/AGENTS/droid-agent',
        model: undefined,
        provider: undefined,
        runtime: 'droid',
      }),
      deriveWorkspaceRootFromAgentWorkspace: () => '/tmp/workspace',
    }, async () => {
      await withModuleOverrides(workspaceIntegrationsModulePath, {
        readWorkspaceIntegrationConfig: () => ({}),
      }, async () => {
        await withModuleOverrides(safeEnvModulePath, {
          userExecutionEnv: () => ({}),
        }, async () => {
          await withModuleOverrides(agentRuntimeModulePath, {
            buildRuntimePlan: (o: { model?: string }) => {
              buildRuntimePlanCalledWithModel = o.model
              return {
                cliPath: '/Users/test/.local/bin/droid',
                args: ['exec', ''],
                missingCliError: 'Factory Droid CLI is not available in this runtime. Install it or set DROID_BIN to the executable path.',
                streamsDeltas: false,
              }
            },
          }, async () => {
            const handler = getRouteHandler('post', '/:id/chat/readiness')
            const res = makeRes()
            await handler(makeReq({ params: { id: 'droid-agent' }, body: {} }), res)
            assert.strictEqual(res.statusCode, 200)
            assert.strictEqual(res.jsonBody?.available, true, `Expected modelless droid agent to be available, got: ${JSON.stringify(res.jsonBody)}`)
            assert.strictEqual(res.jsonBody?.error, undefined, 'Expected no "no model configured" error for a droid agent')
            assert.strictEqual(buildRuntimePlanCalledWithModel, undefined, 'Expected buildRuntimePlan to run (and receive the missing model) instead of being short-circuited by the model gate')
          })
        })
      })
    })
  })

  await test('chat readiness still requires an Anthropic-mappable model for a claude-pinned agent with no model configured', async () => {
    // Contract: unlike droid, claude has no CLI-side default model — an unset model must still be
    // rejected, via the real RuntimeModelError thrown by runtimeModelArg('claude', undefined).
    await withModuleOverrides(agentExecutionModulePath, {
      resolveAgentExecutionConfig: () => ({
        workspace: '/tmp/workspace/AGENTS/claude-agent',
        model: undefined,
        provider: undefined,
        runtime: 'claude',
      }),
      deriveWorkspaceRootFromAgentWorkspace: () => '/tmp/workspace',
    }, async () => {
      await withModuleOverrides(workspaceIntegrationsModulePath, {
        readWorkspaceIntegrationConfig: () => ({}),
      }, async () => {
        await withModuleOverrides(safeEnvModulePath, {
          userExecutionEnv: () => ({}),
        }, async () => {
          // No agentRuntimeModulePath override here — exercises the real buildRuntimePlan/
          // runtimeModelArg('claude', undefined) path, which throws RuntimeModelError.
          const handler = getRouteHandler('post', '/:id/chat/readiness')
          const res = makeRes()
          await handler(makeReq({ params: { id: 'claude-agent' }, body: {} }), res)
          assert.strictEqual(res.statusCode, 200)
          assert.strictEqual(res.jsonBody?.available, false, `Expected modelless claude agent to be unavailable, got: ${JSON.stringify(res.jsonBody)}`)
          assert(/Anthropic models only/i.test(res.jsonBody?.error || ''), `Expected RuntimeModelError text, got: ${res.jsonBody?.error}`)
        })
      })
    })
  })

  await test('chat readiness treats a legacy resolvedAgent shape with no runtime field as openclaw', async () => {
    await withModuleOverrides(agentExecutionModulePath, {
      resolveAgentExecutionConfig: () => ({
        workspace: '/tmp/workspace/AGENTS/legacy-agent',
        model: 'openai/gpt-4o-mini',
        provider: 'openai',
        // Deliberately omits `runtime` to simulate a stale caller/mock shape.
      }),
      deriveWorkspaceRootFromAgentWorkspace: () => '/tmp/workspace',
    }, async () => {
      await withModuleOverrides(workspaceIntegrationsModulePath, {
        readWorkspaceIntegrationConfig: () => ({}),
      }, async () => {
        await withModuleOverrides(safeEnvModulePath, {
          userExecutionEnv: () => ({ OPENAI_API_KEY: 'sk-test' }),
        }, async () => {
          await withModuleOverrides(agentRuntimeModulePath, {
            buildRuntimePlan: () => {
              throw new Error('buildRuntimePlan should not run for a missing/legacy runtime field — it must default to openclaw')
            },
          }, async () => {
            const handler = getRouteHandler('post', '/:id/chat/readiness')
            const res = makeRes()
            await handler(makeReq({ params: { id: 'legacy-agent' }, body: {} }), res)
            assert.strictEqual(res.statusCode, 200)
            assert.strictEqual(res.jsonBody?.available, true)
          })
        })
      })
    })
  })

  await test('a droid chat request queued behind another in-flight chat for the same agent is not killed by a watchdog armed before its turn to execute', async () => {
    // Regression test: the outer 180s watchdog must arm only once execution actually starts (after
    // runExclusiveAgentExecution's real per-agent lock is acquired), not at request-arrival time —
    // otherwise a request queued behind another in-flight chat for the same agent has its budget
    // silently eaten while waiting and can be killed while the underlying CLI call is still healthy.
    const log: string[] = []
    const originalSetTimeout = global.setTimeout
    ;(global as any).setTimeout = ((handler: (...args: any[]) => void, delay?: number, ...args: any[]) => {
      if (delay === 180000) {
        log.push('watchdog-armed')
        // Never let the real 3-minute watchdog fire inside the test — clearTimeout() silently
        // no-ops on a non-Timeout value, so a bare object is a safe inert stand-in.
        return {} as any
      }
      return originalSetTimeout(handler as any, delay as any, ...args)
    }) as any

    try {
      await withModuleOverrides(agentExecutionModulePath, {
        resolveAgentExecutionConfig: () => ({
          workspace: '/tmp/workspace/AGENTS/queued-agent',
          model: undefined,
          provider: undefined,
          runtime: 'droid',
        }),
        deriveWorkspaceRootFromAgentWorkspace: () => '/tmp/workspace',
      }, async () => {
        await withModuleOverrides(workspaceIntegrationsModulePath, {
          readWorkspaceIntegrationConfig: () => ({}),
          hasWorkspaceManagedPartnerSecrets: () => false,
        }, async () => {
          await withModuleOverrides(safeEnvModulePath, {
            userExecutionEnv: () => ({}),
          }, async () => {
            await withModuleOverrides(skillsModulePath, {
              getAgentSkills: () => [],
            }, async () => {
              await withModuleOverrides(runtimeSessionsModulePath, {
                hasRuntimeSession: () => false,
              }, async () => {
                let call = 0
                await withModuleOverrides(agentRuntimeModulePath, {
                  buildRuntimePlan: () => ({
                    cliPath: '/fake/bin/droid',
                    args: ['exec', ''],
                    missingCliError: 'unused',
                    streamsDeltas: false,
                  }),
                  runRuntimeCli: async () => {
                    const tag = ++call === 1 ? 'A' : 'B'
                    log.push(`${tag}:execution-start`)
                    await new Promise((resolve) => originalSetTimeout(resolve, 30))
                    log.push(`${tag}:execution-end`)
                    return { text: `reply-${tag}` }
                  },
                }, async () => {
                  const handler = getRouteHandler('post', '/:id/chat')

                  const resA = makeSseRes()
                  const handlerPromiseA = handler(makeReq({ params: { id: 'queued-agent' }, body: { message: 'first' }, on() {} }), resA)

                  // Give request A a moment to acquire the per-agent exclusive lock and begin
                  // executing before firing request B, so B genuinely queues behind it via
                  // runExclusiveAgentExecution's real per-agent lock chain (agent-execution.ts).
                  await new Promise((resolve) => originalSetTimeout(resolve, 10))

                  const resB = makeSseRes()
                  const handlerPromiseB = handler(makeReq({ params: { id: 'queued-agent' }, body: { message: 'second' }, on() {} }), resB)

                  await Promise.all([handlerPromiseA, handlerPromiseB, resA.done, resB.done])

                  assert(!resA.events.some((e) => e.type === 'error'), `Expected the first request to complete without a spurious timeout error, got: ${JSON.stringify(resA.events)}`)
                  assert(!resB.events.some((e) => e.type === 'error'), `Expected the queued (second) request to complete without a spurious timeout error, got: ${JSON.stringify(resB.events)}`)
                  assert(resB.events.some((e) => e.type === 'complete' && e.data?.text === 'reply-B'), `Expected the queued request to deliver its real reply, got: ${JSON.stringify(resB.events)}`)

                  const watchdogArmCount = log.filter((entry) => entry === 'watchdog-armed').length
                  assert.strictEqual(watchdogArmCount, 2, `Expected exactly one watchdog arm per request, got ${watchdogArmCount}: ${log.join(', ')}`)
                  assert(
                    log.lastIndexOf('watchdog-armed') > log.indexOf('A:execution-end'),
                    `Expected the queued request's watchdog to arm only once its own execution began (after the first request finished), got order: ${log.join(', ')}`
                  )
                })
              })
            })
          })
        })
      })
    } finally {
      global.setTimeout = originalSetTimeout
    }
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
