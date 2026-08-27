import assert from 'assert'
import {
  generateArchiveTitle,
  generateCronFromText,
} from './ai-generator'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    passed++
  } catch (err: any) {
    console.error(`${RED}✗${RESET} ${name}`)
    console.error(err?.stack || err)
    failed++
  }
}

async function withSystemProviderKeysCleared<T>(fn: () => Promise<T> | T): Promise<T> {
  const dashboardEnv = require('./dashboard-env')
  const original = {
    SYSTEM_OPENAI_API_KEY: process.env.SYSTEM_OPENAI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    SYSTEM_ANTHROPIC_API_KEY: process.env.SYSTEM_ANTHROPIC_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    resolveSystemExecutionProviderKeys: dashboardEnv.resolveSystemExecutionProviderKeys,
  }
  delete process.env.SYSTEM_OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.SYSTEM_ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  dashboardEnv.resolveSystemExecutionProviderKeys = () => ({})

  try {
    return await fn()
  } finally {
    dashboardEnv.resolveSystemExecutionProviderKeys = original.resolveSystemExecutionProviderKeys
    if (typeof original.SYSTEM_OPENAI_API_KEY === 'undefined') delete process.env.SYSTEM_OPENAI_API_KEY
    else process.env.SYSTEM_OPENAI_API_KEY = original.SYSTEM_OPENAI_API_KEY
    if (typeof original.OPENAI_API_KEY === 'undefined') delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = original.OPENAI_API_KEY
    if (typeof original.SYSTEM_ANTHROPIC_API_KEY === 'undefined') delete process.env.SYSTEM_ANTHROPIC_API_KEY
    else process.env.SYSTEM_ANTHROPIC_API_KEY = original.SYSTEM_ANTHROPIC_API_KEY
    if (typeof original.ANTHROPIC_API_KEY === 'undefined') delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = original.ANTHROPIC_API_KEY
  }
}

console.log(`\n${YELLOW}=== AI Generator Edge Test Suite ===${RESET}\n`)

void (async () => {
  await test('generateArchiveTitle returns Empty conversation for empty archives', async () => {
    assert.strictEqual(await generateArchiveTitle([]), 'Empty conversation')
  })

  await test('generateArchiveTitle falls back to the first user message when no OpenAI key is configured', async () => {
    await withSystemProviderKeysCleared(async () => {
      const title = await generateArchiveTitle([
        { role: 'assistant', content: 'Hello there' },
        { role: 'user', content: 'Investigate the notification regression in archived chats and timeline dates' },
        { role: 'assistant', content: 'Sure, I can help.' },
      ])
      assert.strictEqual(title, 'Investigate the notification regression in archive')
    })
  })

  await test('generateCronFromText keeps one-time requests manual without needing an API key', async () => {
    await withSystemProviderKeysCleared(async () => {
      const result = await generateCronFromText('Run this one time tomorrow at 9am', 'America/New_York')
      assert.strictEqual(result.cron, '')
      assert.match(result.explanation, /Cron expressions always repeat/i)
      assert.strictEqual(result.error, undefined)
    })
  })

  await test('generateCronFromText reports missing credentials cleanly for recurring schedules', async () => {
    await withSystemProviderKeysCleared(async () => {
      const result = await generateCronFromText('Every weekday at 9am', 'America/New_York')
      assert.strictEqual(result.cron, '')
      assert.strictEqual(result.explanation, '')
      // A CLI runtime is now an accepted execution path, so the message names both.
      assert.strictEqual(result.error, 'No OpenAI API key or CLI runtime configured')
    })
  })

  await test('generateArchiveTitle falls back to a generic Conversation title when there is no user message', async () => {
    await withSystemProviderKeysCleared(async () => {
      const title = await generateArchiveTitle([
        { role: 'assistant', content: 'Hello there' },
        { role: 'assistant', content: 'Still waiting on user input.' },
      ])
      assert.strictEqual(title, 'Conversation')
    })
  })

  await test('generateArchiveTitle uses the first user message as the fallback source even when later messages are longer', async () => {
    await withSystemProviderKeysCleared(async () => {
      const title = await generateArchiveTitle([
        { role: 'user', content: 'Short kickoff request' },
        { role: 'assistant', content: 'Acknowledged' },
        { role: 'user', content: 'This later follow-up is much longer and should not replace the fallback title source' },
      ])
      assert.strictEqual(title, 'Short kickoff request')
    })
  })

  console.log('\n========================================')
  console.log(`Tests passed: ${passed}`)
  console.log(`Tests failed: ${failed}`)
  console.log('========================================')

  if (failed > 0) {
    console.error(`\n${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All tests passed${RESET}`)
  }
})()
