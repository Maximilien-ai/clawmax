export function summarizeWorkflowParticipantFailure(message: string): string {
  const text = String(message || '').trim()
  if (!text) return 'Workflow participant failed.'
  if (/^Agent reported failure:\s*/i.test(text)) {
    return summarizeWorkflowParticipantFailure(text.replace(/^Agent reported failure:\s*/i, ''))
  }
  if (/^LLM request rejected:/i.test(text) || /usage limits|quota|insufficient_quota|rate limit|too many requests|429\b/i.test(text)) {
    return 'The model provider rejected this workflow request because the account hit a quota or rate limit. Wait a moment and retry, or update the provider billing and usage limits for the selected model.'
  }
  if (/Incorrect API key provided/i.test(text)) {
    return 'The configured model provider API key was rejected for this workflow run. Update the API key or runtime auth profile and retry.'
  }
  if (/has auth issue \(skipping all models\)/i.test(text)) {
    return 'This runtime is currently marked with a provider auth issue, usually because a prior request failed authentication. Refresh the API key or auth profile for this runtime and retry after the auth state clears.'
  }
  if (/No API key found for provider/i.test(text)) {
    return 'No model provider credentials are configured for this workflow run. Add the missing API key or auth profile in BYOK, runtime settings, or the agent auth store and retry.'
  }
  if (/is in cooldown \(suspending lanes\)/i.test(text) || /timed out/i.test(text)) {
    return 'The model provider is temporarily cooling down after a timeout or transient failure. Wait a moment and retry, or switch this workflow to a faster fallback model.'
  }
  if (/context overflow|prompt too large|prompt_cache_key|string too long|runtime error detail/i.test(text)) {
    return 'The model provider rejected the workflow request before generation because the prompt or runtime payload was too large. Reduce the input size or split the workflow into smaller steps, then retry.'
  }
  if (/EmbeddedAttemptSessionTakeoverError|session file changed while embedded prompt lock was released/i.test(text)) {
    return 'Workflow execution hit an embedded session conflict while another run was active. Reset the active chat or session and retry.'
  }
  if (/^No execution path configured\b/i.test(text) || /^No API keys available\b/i.test(text)) {
    return 'No model execution path is configured for this workflow run. Add hosted provider keys or configure a local runtime in BYOK / workspace integrations.'
  }
  if (/^COMMS FAIL/i.test(text) || /Unknown channel:/i.test(text)) {
    return 'Communication delivery failed. This workflow tried to post to a group or community that is missing, misconfigured, or not resolvable from the current targeting.'
  }
  return text
}
