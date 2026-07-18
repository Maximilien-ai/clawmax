#!/usr/bin/env node

async function main() {
  const [skillId, action] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log('Usage: clawmax-skill-run <registered-skill-id> <action>')
    process.exit(0)
  }
  if (!skillId || !action) {
    console.error('Usage: clawmax-skill-run <registered-skill-id> <action>')
    process.exit(2)
  }

  const endpoint = `${process.env.CLAWMAX_SECRET_BROKER_URL || ''}`.trim()
  const token = `${process.env.CLAWMAX_SECRET_BROKER_TOKEN || ''}`.trim()
  if (!endpoint || !token) {
    throw new Error('Brokered skill execution is unavailable in this agent session. Configure the workspace secret broker and start a new chat or workflow run.')
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ skillId, action }),
  })
  const payload = await response.json() as { stdout?: string; stderr?: string; error?: string }
  if (!response.ok) {
    throw new Error(payload.error || payload.stderr || `Brokered skill execution failed with HTTP ${response.status}`)
  }
  if (payload.stdout) process.stdout.write(payload.stdout.endsWith('\n') ? payload.stdout : `${payload.stdout}\n`)
  if (payload.stderr) process.stderr.write(payload.stderr.endsWith('\n') ? payload.stderr : `${payload.stderr}\n`)
}

main().catch((error: any) => {
  console.error(error?.message || 'Brokered skill execution failed')
  process.exit(1)
})
