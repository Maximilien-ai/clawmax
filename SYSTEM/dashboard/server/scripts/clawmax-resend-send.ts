#!/usr/bin/env node

import fs from 'fs'
import { executeClawmaxResendSend, parseClawmaxResendSendArgs } from '../lib/clawmax-resend-command'

function printHelp() {
  console.log(`Usage:
  clawmax-resend-send --to recipient@example.com --subject "Subject" [--body "Text"] [--body-file path] [--attach path]...

Options:
  --to             Recipient email address
  --subject        Email subject
  --body           Plain-text email body
  --body-file      Read the body from a file
  --attach         Workspace-relative attachment path (repeatable)
  --agent-id       Override sender agent id (defaults to CLAWMAX_AGENT_ID or "agent")
  --workspace-root Override workspace root (defaults to OPENCLAW_WORKSPACE or cwd)
  --workspace-label Override workspace label for email footer

You can also pipe the body through stdin if --body/--body-file are omitted.`)
}

async function main() {
  try {
    const stdinBody = !process.stdin.isTTY ? fs.readFileSync(0, 'utf-8') : ''
    const options = parseClawmaxResendSendArgs(process.argv.slice(2), process.env, stdinBody)
    const result = await executeClawmaxResendSend(options)
    console.log(result.message)
  } catch (err: any) {
    if (err?.message === 'HELP') {
      printHelp()
      process.exit(0)
    }
    console.error(err?.message || 'Failed to send email with clawmax-resend-send')
    process.exit(1)
  }
}

main()
