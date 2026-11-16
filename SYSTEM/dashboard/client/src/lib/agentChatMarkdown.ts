export type AgentChatMarkdownRole = 'assistant' | 'user'

export function getAgentChatInlineCodeClassName(role: AgentChatMarkdownRole): string {
  if (role === 'user') {
    return '!rounded !bg-white/20 !px-1 !py-0.5 !font-mono !text-[0.95em] !text-white'
  }
  return '!rounded !bg-gray-200 !px-1 !py-0.5 !font-mono !text-[0.95em] !text-gray-900 dark:!bg-slate-800 dark:!text-gray-100'
}

/** The `<pre>` inside a code block's frame (getAgentChatCodeFrameClassName), below its header. */
export function getAgentChatCodeBlockClassName(role: AgentChatMarkdownRole): string {
  if (role === 'user') {
    return '!m-0 !overflow-x-auto !rounded-none !bg-sky-700/70 !px-3 !py-2 !text-xs !text-white'
  }
  return '!m-0 !overflow-x-auto !rounded-none !bg-gray-50 !px-3 !py-2 !text-xs !text-gray-900 dark:!bg-slate-950/80 dark:!text-gray-100'
}

export function getAgentChatCodeFrameClassName(role: AgentChatMarkdownRole): string {
  if (role === 'user') {
    return 'mb-2 overflow-hidden rounded-lg ring-1 ring-white/20 last:mb-0'
  }
  return 'mb-2 overflow-hidden rounded-lg ring-1 ring-gray-200 last:mb-0 dark:ring-slate-800'
}

export function getAgentChatCodeHeaderClassName(role: AgentChatMarkdownRole): string {
  if (role === 'user') {
    return 'flex items-center justify-between gap-2 border-b border-white/15 bg-sky-900/50 px-3 py-1 text-[11px] text-sky-100'
  }
  return 'flex items-center justify-between gap-2 border-b border-gray-200 bg-gray-100 px-3 py-1 text-[11px] text-gray-600 dark:border-slate-800 dark:bg-slate-900 dark:text-gray-300'
}

export function getAgentChatLinkClassName(role: AgentChatMarkdownRole): string {
  if (role === 'user') {
    return '!text-white !underline hover:!text-white/90'
  }
  return '!text-sky-700 !underline hover:!text-sky-800 dark:!text-sky-300 dark:hover:!text-sky-200'
}

/** The part of a rendered Markdown (hast) node a code block needs. */
export interface MarkdownNode {
  type: string
  tagName?: string
  value?: string
  properties?: { className?: unknown }
  children?: MarkdownNode[]
}

function collectText(node: MarkdownNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.value ?? ''
  return (node.children ?? []).map(collectText).join('')
}

/** Whether a `<code>` node is a code block's (whose text always ends in a newline) rather than inline code. */
export function isCodeBlockNode(node: MarkdownNode | undefined): boolean {
  return collectText(node).endsWith('\n')
}

/**
 * A fenced code block's language and its code exactly as written between the fences: no fence, no
 * info string, no surrounding prose, indentation and blank lines intact.
 */
export function getCodeBlockContent(pre: MarkdownNode | undefined): { code: string; language: string | null } {
  const code = pre?.children?.find((child) => child.type === 'element' && child.tagName === 'code')
  const classNames = Array.isArray(code?.properties?.className) ? code.properties.className.map(String) : []
  const language = classNames.find((name) => name.startsWith('language-'))?.slice('language-'.length) || null
  const text = collectText(code ?? pre)
  // The renderer ends every code block with the newline before its closing fence; the code does not.
  return { code: text.endsWith('\n') ? text.slice(0, -1) : text, language }
}
