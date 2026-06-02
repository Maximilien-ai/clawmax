import { strict as assert } from 'assert'
import { getAgentChatCodeBlockClassName, getAgentChatInlineCodeClassName } from './agentChatMarkdown'

console.log('\n=== Agent Chat Markdown Helper Test Suite ===\n')

const assistantBlock = getAgentChatCodeBlockClassName('assistant')
assert(assistantBlock.includes('bg-gray-50'), 'Expected assistant code blocks to use a light background in light mode')
assert(assistantBlock.includes('text-gray-900'), 'Expected assistant code blocks to keep dark readable text in light mode')

const userBlock = getAgentChatCodeBlockClassName('user')
assert(userBlock.includes('text-white'), 'Expected user code blocks to keep white text')

const assistantInline = getAgentChatInlineCodeClassName('assistant')
assert(assistantInline.includes('text-gray-900'), 'Expected assistant inline code to keep readable dark text')

const userInline = getAgentChatInlineCodeClassName('user')
assert(userInline.includes('text-white'), 'Expected user inline code to stay readable on blue bubbles')

console.log('✓ Agent chat markdown helper tests passed')
