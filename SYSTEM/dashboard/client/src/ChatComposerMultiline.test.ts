import assert from 'assert'
import fs from 'fs'
import path from 'path'

const componentsDir = path.join(__dirname, 'components')
const agentChatSource = fs.readFileSync(path.join(componentsDir, 'AgentChatPanel.tsx'), 'utf8')
const legacyChatSource = fs.readFileSync(path.join(componentsDir, 'ChatPanel.tsx'), 'utf8')

for (const [name, source] of [
  ['AgentChatPanel', agentChatSource],
  ['ChatPanel', legacyChatSource],
] as const) {
  assert(source.includes('useRef<HTMLTextAreaElement>(null)'), `${name} must use a multiline composer ref`)
  assert(source.includes('<textarea'), `${name} must render a textarea composer`)
  assert(source.includes("e.key === 'Enter' && !e.shiftKey"), `${name} must submit plain Enter only`)
  assert(source.includes('Shift+Enter for a new line'), `${name} must disclose the multiline keyboard action`)
  assert(source.includes('flex items-end gap-2'), `${name} must keep adjacent actions aligned as the composer grows`)
}

assert(agentChatSource.includes("if (input.includes('\\n')) return"), 'Multiline agent chat must preserve native arrow-key navigation')

console.log('ChatComposerMultiline.test.ts: 11 assertions passed')
