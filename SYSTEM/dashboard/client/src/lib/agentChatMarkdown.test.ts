import { strict as assert } from 'assert'
import fs from 'fs'
import path from 'path'
import { getAgentChatCodeBlockClassName, getAgentChatInlineCodeClassName, getAgentChatLinkClassName } from './agentChatMarkdown'

console.log('\n=== Agent Chat Markdown Helper Test Suite ===\n')

const assistantBlock = getAgentChatCodeBlockClassName('assistant')
assert(assistantBlock.includes('!bg-gray-50'), 'Expected assistant code blocks to use a forced light background in light mode')
assert(assistantBlock.includes('!text-gray-900'), 'Expected assistant code blocks to keep forced dark readable text in light mode')

const userBlock = getAgentChatCodeBlockClassName('user')
assert(userBlock.includes('text-white'), 'Expected user code blocks to keep white text')

const assistantInline = getAgentChatInlineCodeClassName('assistant')
assert(assistantInline.includes('!text-gray-900'), 'Expected assistant inline code to keep forced readable dark text')

const userInline = getAgentChatInlineCodeClassName('user')
assert(userInline.includes('text-white'), 'Expected user inline code to stay readable on blue bubbles')

const assistantLink = getAgentChatLinkClassName('assistant')
assert(assistantLink.includes('!text-sky-700'), 'Expected assistant links to force a readable light-mode color')

const userLink = getAgentChatLinkClassName('user')
assert(userLink.includes('!text-white'), 'Expected user links to stay readable on blue bubbles')

const css = fs.readFileSync(path.join(__dirname, '../index.css'), 'utf8')
const panel = fs.readFileSync(path.join(__dirname, '../components/AgentChatPanel.tsx'), 'utf8')
assert(css.includes('.prose.agent-chat-user-markdown :is(p, h1, h2, h3, h4, h5, h6, ul, ol, li, strong, em, blockquote, th, td)'))
assert(css.includes('color: inherit !important;'), 'User prose must override generic paragraph colors')
assert(panel.includes('prose-invert agent-chat-user-markdown'), 'Apply scoped colors to user Markdown')
assert(panel.includes("'bg-sky-700 text-white'"), 'White text needs a sufficiently dark blue bubble')
assert(panel.includes('text-xs text-sky-100 mt-1'), 'User timestamps must not lose contrast through opacity')

console.log('✓ Agent chat markdown helper tests passed')
