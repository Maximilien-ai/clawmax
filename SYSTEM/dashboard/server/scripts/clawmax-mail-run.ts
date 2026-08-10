#!/usr/bin/env node

export {}

function usage(): never {
  console.error('Usage: clawmax-mail-run accounts | invoke <gmail|microsoft365> <account-id> <capability> [json-args]')
  process.exit(2)
}

async function main() {
  const [command, provider, accountId, capability, rawArgs] = process.argv.slice(2)
  if (command === '--help' || command === '-h') {
    console.log('Usage: clawmax-mail-run accounts | invoke <gmail|microsoft365> <account-id> <capability> [json-args]')
    return
  }
  if (command !== 'accounts' && command !== 'invoke') usage()

  const endpoint = `${process.env.CLAWMAX_MAIL_BROKER_URL || ''}`.trim().replace(/\/$/, '')
  const token = `${process.env.CLAWMAX_MAIL_BROKER_TOKEN || ''}`.trim()
  if (!endpoint || !token) {
    throw new Error('Brokered mail access is unavailable in this agent session. Authorize the agent and start a new chat or workflow run.')
  }

  let body: Record<string, unknown> = {}
  let route = 'accounts'
  if (command === 'invoke') {
    if (!provider || !accountId || !capability) usage()
    let args: unknown = {}
    if (rawArgs) {
      try {
        args = JSON.parse(rawArgs)
      } catch {
        throw new Error('Mail invocation arguments must be a valid JSON object')
      }
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        throw new Error('Mail invocation arguments must be a valid JSON object')
      }
    }
    route = 'execute'
    body = { provider, accountId, capability, args }
  }

  const response = await fetch(`${endpoint}/${route}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json() as { accounts?: unknown; result?: unknown; error?: string }
  if (!response.ok) throw new Error(payload.error || `Brokered mail request failed with HTTP ${response.status}`)
  process.stdout.write(`${JSON.stringify(command === 'accounts' ? payload.accounts : payload.result, null, 2)}\n`)
}

main().catch((error: any) => {
  console.error(error?.message || 'Brokered mail request failed')
  process.exit(1)
})
