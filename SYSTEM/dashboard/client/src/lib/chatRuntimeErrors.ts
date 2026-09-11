export function summarizeAgentChatFailure(message: string, options?: { agentId?: string }): string {
  const text = String(message || '').trim()
  if (!text) return 'No reply from agent.'
  if (/\[Edit agent model\]\(\/agents\?agent=/i.test(text)) return text
  if (/ENOSPC|no space left on device|database or disk is full|ERR_SQLITE_(?:FULL|ERROR)/i.test(text)) return 'This instance is out of storage space, so the agent cannot save the chat state needed to reply. Free or expand the instance storage, then retry. No model change is needed.'
  if (/failed to initialize (?:sqlite )?state runtime/i.test(text)) return 'The agent could not initialize its local chat state. Check the instance storage capacity and permissions, then retry. If the instance has free space, restart the runtime before trying again.'
  if (/OpenClaw agent database is unavailable while agent .* is deleted/i.test(text)) return 'This agent was deleted from OpenClaw and can no longer chat. Close this chat and refresh Agents; recreate the agent if you still need it.'
  const unsupportedWebSearch = text.match(/Tool ['"]web_search_preview['"] is not supported with ([a-z0-9._-]+)/i)
  if (unsupportedWebSearch) {
    const rawModel = unsupportedWebSearch[1].replace(/[.,;:]+$/, '')
    const model = /\bprovider=openai\b/i.test(text) && !rawModel.includes('/')
      ? `openai/${rawModel}`
      : rawModel
    const editLink = options?.agentId
      ? `/agents?agent=${encodeURIComponent(options.agentId)}&action=edit`
      : '/agents'
    return `Model compatibility error: \`${model}\` cannot use the web-search tool required by this OpenClaw runtime. Choose a different suggested model or a known tool-compatible model, save it, and retry. [Edit agent model](${editLink})`
  }
  if (/FsSafeError: directory changed during operation/i.test(text)) return 'The agent runtime changed files while this chat was running and the request could not complete. Retry once. If it keeps happening, restart the runtime or disable unstable runtime plugins before retrying.'
  if (/unsupported model|Unknown model:/i.test(text)) return 'This agent is configured with a model that the current runtime does not support. Choose a different model for the agent and try again.'
  if (/No API key found for provider/i.test(text)) return 'No model provider credentials are configured for this chat. Add the missing API key or auth profile in BYOK, runtime settings, or the agent auth store and retry.'
  if (/Incorrect API key provided/i.test(text)) return 'The configured model provider API key was rejected. Update the API key or runtime auth profile for this agent and try again.'
  if (/has auth issue \(skipping all models\)/i.test(text)) return 'This runtime is currently marked with a provider auth issue, usually because a prior request failed authentication. Refresh the API key or auth profile for this runtime and retry after the auth state clears.'
  if (/Agent couldn't generate a response|incomplete turn detected|hasLastAssistant=no/i.test(text)) return 'The agent used tools but did not produce a final reply. Some tool actions may already have completed. Verify the requested results, then retry or reset this chat session.'
  if (/insufficient_quota|quota exceeded|rate limit|too many requests|429\b/i.test(text)) return 'The model provider rejected this request because the account hit a quota or rate limit. Wait a moment and retry, or update the provider billing/usage limits for this runtime.'
  if (/is in cooldown \(suspending lanes\)/i.test(text)) return 'The model provider is temporarily cooling down after a timeout. Wait a moment and retry, or switch this agent to a faster fallback model.'
  if (/gateway/i.test(text)) return 'Agent chat could not reach the gateway runtime.'
  if (/timeout/i.test(text)) {
    const editLink = options?.agentId
      ? `/agents?agent=${encodeURIComponent(options.agentId)}&action=edit`
      : '/agents'
    return `The selected model did not reply before the runtime deadline. Retry once. If this repeats, choose a faster suggested model or configure a backup model. [Edit agent model](${editLink})`
  }
  if (/No API keys available|No execution path configured/i.test(text)) return 'No model execution path is configured for this chat. Add hosted provider keys or configure a local runtime in BYOK / workspace integrations.'
  return text
}

export function formatAgentWorkStatus(elapsedMs: number): string {
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  if (elapsedSeconds < 15) return 'Agent is working...'
  const elapsed = elapsedSeconds < 60
    ? `${elapsedSeconds}s`
    : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`
  return `Agent is working and may be using tools. ${elapsed} elapsed; tool-enabled requests can take up to 3 minutes.`
}
