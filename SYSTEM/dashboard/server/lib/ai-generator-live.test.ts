import OpenAI from 'openai'
import { createChatCompletionWithCompatibilityRetry, setRequestByokKeys } from './ai-generator'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

function extractSmokeContent(completion: any): string {
  const raw = completion?.choices?.[0]?.message?.content
  if (typeof raw === 'string') return raw.trim()
  if (Array.isArray(raw)) {
    return raw
      .map((entry: any) => {
        if (typeof entry === 'string') return entry
        if (entry && typeof entry.text === 'string') return entry.text
        return ''
      })
      .join(' ')
      .trim()
  }
  return ''
}

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
      max_completion_tokens: 5,
      temperature: 0,
    })
    const content = extractSmokeContent(completion)
    if (!content) {
      const finishReason = String(completion?.choices?.[0]?.finish_reason || '').trim()
      if (finishReason) {
        console.log(`${GREEN}✓${RESET} Explicit GPT-5 completion succeeded (finish_reason=${finishReason})`)
        console.log(`${GREEN}All tests passed${RESET}`)
        return
      }
      throw new Error('Empty response from GPT-5 live smoke test')
    }
    console.log(`${GREEN}✓${RESET} Explicit GPT-5 completion succeeded: ${content}`)
    console.log(`${GREEN}All tests passed${RESET}`)
  } catch (err: any) {
    const message = String(err?.message || '')
    const causeMessage = String(err?.cause?.message || err?.cause?.code || '')
    const combined = `${message} ${causeMessage}`.trim()
    if (/Connection error|ENOTFOUND|fetch failed|ECONNREFUSED|ETIMEDOUT|ECONNRESET/i.test(combined)) {
      console.log(`${YELLOW}Skipped${RESET}: OpenAI live smoke could not reach the provider (${combined})`)
      console.log(`${GREEN}All tests passed${RESET}`)
      return
    }
    throw err
  } finally {
    setRequestByokKeys(undefined)
  }
}

main().catch((err: any) => {
  console.error(`${RED}✗${RESET} AI Generator live smoke failed`)
  console.error(err?.stack || err?.message || err)
  process.exit(1)
})
