export function summarizeAgentChatFailure(message: string): string {
  const text = String(message || '').trim()
  if (!text) return 'No reply from agent.'
  if (/\[Edit agent model\]\(\/agents\?agent=/i.test(text)) return text
  if (/FsSafeError: directory changed during operation/i.test(text)) return 'The agent runtime changed files while this chat was running and the request could not complete. Retry once. If it keeps happening, restart the runtime or disable unstable runtime plugins before retrying.'
  if (/unsupported model|Unknown model:/i.test(text)) return 'This agent is configured with a model that the current runtime does not support. Choose a different model for the agent and try again.'
  if (/No API key found for provider/i.test(text)) return 'No model provider credentials are configured for this chat. Add the missing API key or auth profile in BYOK, runtime settings, or the agent auth store and retry.'
  if (/Incorrect API key provided/i.test(text)) return 'The configured model provider API key was rejected. Update the API key or runtime auth profile for this agent and try again.'
  if (/has auth issue \(skipping all models\)/i.test(text)) return 'This runtime is currently marked with a provider auth issue, usually because a prior request failed authentication. Refresh the API key or auth profile for this runtime and retry after the auth state clears.'
  if (/Agent couldn't generate a response|incomplete turn detected|hasLastAssistant=no/i.test(text)) return 'The agent used tools but did not produce a final reply. Some tool actions may already have completed. Verify the requested results, then retry or reset this chat session.'
  if (/insufficient_quota|quota exceeded|rate limit|too many requests|429\b/i.test(text)) return 'The model provider rejected this request because the account hit a quota or rate limit. Wait a moment and retry, or update the provider billing/usage limits for this runtime.'
  if (/is in cooldown \(suspending lanes\)/i.test(text)) return 'The model provider is temporarily cooling down after a timeout. Wait a moment and retry, or switch this agent to a faster fallback model.'
  if (/gateway/i.test(text)) return 'Agent chat could not reach the gateway runtime.'
  if (/timeout/i.test(text)) return 'Agent chat timed out before a reply was produced. Retry once, or switch this agent to a faster model if the issue persists.'
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
