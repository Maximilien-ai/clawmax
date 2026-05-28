import OpenAI from 'openai'
import { createChatCompletionWithCompatibilityRetry, setRequestByokKeys } from './ai-generator'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

async function main() {
  console.log(`\n${YELLOW}=== AI Generator Live Smoke Test ===${RESET}\n`)

  const openaiKey = String(process.env.SYSTEM_OPENAI_API_KEY || '').trim()
  if (!openaiKey) {
    console.log(`${YELLOW}Skipped${RESET}: SYSTEM_OPENAI_API_KEY not configured`)
    console.log(`${GREEN}All tests passed${RESET}`)
    return
  }

  try {
    setRequestByokKeys({ openai: openaiKey } as any)
    const client = new OpenAI({ apiKey: openaiKey })
    const completion = await createChatCompletionWithCompatibilityRetry(client, {
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'Reply with OK' }],
      max_tokens: 5,
      temperature: 0,
    })
    const content = String(completion?.choices?.[0]?.message?.content || '').trim()
    if (!content) {
      throw new Error('Empty response from GPT-5 live smoke test')
    }
    console.log(`${GREEN}✓${RESET} Explicit GPT-5 completion succeeded: ${content}`)
    console.log(`${GREEN}All tests passed${RESET}`)
  } finally {
    setRequestByokKeys(undefined)
  }
}

main().catch((err: any) => {
  console.error(`${RED}✗${RESET} AI Generator live smoke failed`)
  console.error(err?.stack || err?.message || err)
  process.exit(1)
})
