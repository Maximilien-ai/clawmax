import assert from 'assert'
import fs from 'fs'
import path from 'path'

const componentsDir = path.join(__dirname, 'components')
const agentChatSource = fs.readFileSync(path.join(componentsDir, 'AgentChatPanel.tsx'), 'utf8')
const legacyChatSource = fs.readFileSync(path.join(componentsDir, 'ChatPanel.tsx'), 'utf8')
const groupChatSource = fs.readFileSync(path.join(componentsDir, 'GroupChatPanel.tsx'), 'utf8')
const detailSource = fs.readFileSync(path.join(componentsDir, 'AgentDetailPanel.tsx'), 'utf8')

for (const [name, source] of [
  ['AgentChatPanel', agentChatSource],
  ['ChatPanel', legacyChatSource],
  ['GroupChatPanel', groupChatSource],
] as const) {
  assert(source.includes('useRef<HTMLTextAreaElement>(null)'), `${name} must use a multiline composer ref`)
  assert(source.includes('<textarea'), `${name} must render a textarea composer`)
  assert(
    name !== 'ChatPanel'
      ? source.includes('shouldSendChatOnKeyDown(e)')
      : source.includes("e.key === 'Enter' && !e.shiftKey"),
    `${name} must submit plain Enter only`,
  )
  assert(source.includes('Shift+Enter for a new line'), `${name} must disclose the multiline keyboard action`)
  assert(source.includes('flex items-end gap-2'), `${name} must keep adjacent actions aligned as the composer grows`)
  assert(source.includes('rows={composerExpanded ? 4 : 1}'), `${name} must start compact and expand on demand`)
  assert(source.includes('resize-y'), `${name} must allow manual resizing`)
  assert(source.includes('aria-expanded={composerExpanded}'), `${name} must expose expansion state`)
  assert(source.includes('Collapse message box') && source.includes('Expand message box'), `${name} must name both chevron actions`)
  assert(source.includes("composerExpanded ? '' : 'rotate-180'"), `${name} must show an upward chevron when compact and a downward chevron when expanded`)
}

assert(agentChatSource.includes("!input.includes('\\n')"), 'Multiline agent chat must preserve native arrow-key navigation')
assert(detailSource.includes('Press Esc to close details'), 'Agent detail must disclose the Escape shortcut')
assert(detailSource.includes('else if (editingCostLimit)'), 'Escape must dismiss inline budget editing before closing details')

console.log('ChatComposerMultiline.test.ts: compact and expandable composers and detail shortcut passed')
