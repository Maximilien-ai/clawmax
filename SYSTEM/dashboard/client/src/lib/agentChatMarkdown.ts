export type AgentChatMarkdownRole = 'assistant' | 'user'

export function getAgentChatInlineCodeClassName(role: AgentChatMarkdownRole): string {
  if (role === 'user') {
    return '!rounded !bg-white/20 !px-1 !py-0.5 !font-mono !text-[0.95em] !text-white'
  }
  return '!rounded !bg-gray-200 !px-1 !py-0.5 !font-mono !text-[0.95em] !text-gray-900 dark:!bg-slate-800 dark:!text-gray-100'
}

export function getAgentChatCodeBlockClassName(role: AgentChatMarkdownRole): string {
  if (role === 'user') {
    return '!mb-2 !overflow-x-auto !rounded-lg !bg-sky-700/70 !px-3 !py-2 !text-xs !text-white last:!mb-0'
  }
  return '!mb-2 !overflow-x-auto !rounded-lg !bg-gray-50 !px-3 !py-2 !text-xs !text-gray-900 !ring-1 !ring-gray-200 last:!mb-0 dark:!bg-slate-950/80 dark:!text-gray-100 dark:!ring-slate-800'
}
