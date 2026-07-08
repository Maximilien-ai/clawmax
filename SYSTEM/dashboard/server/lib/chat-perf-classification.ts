export type ChatPerfClassification = {
  ok: boolean
  note: string
  text?: string
}

export function classifyCurlChatStatusForPerf(exitCode: number): string {
  switch (exitCode) {
    case 0:
      return ''
    case 28:
      return 'error:transport-timeout:curl timed out waiting for chat response'
    case 7:
      return 'error:transport-connect:could not connect to chat endpoint'
    case 22:
      return 'error:http-failure:chat request returned a failing HTTP status'
    case 52:
      return 'error:empty-reply:chat endpoint returned an empty reply'
    case 56:
      return 'error:transport-reset:chat connection was reset during streaming'
    default:
      return `error:transport-curl-exit-${exitCode}:chat request failed before a usable response arrived`
  }
}

function classifyErrorNote(message: string): ChatPerfClassification {
  const normalized = String(message || '').trim()
  if (!normalized) return { ok: false, note: 'unexpected-format' }

  if (/No model provider credentials are configured for this chat/i.test(normalized)) {
    return { ok: false, note: `skipped:no-credentials:${normalized}` }
  }

  return { ok: false, note: `error:${normalized}` }
}

export function classifyAgentChatPayloadForPerf(raw: string): ChatPerfClassification {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.text === 'string' && parsed.text.trim()) {
      return { ok: true, note: 'ok', text: parsed.text.trim() }
    }
    if (typeof parsed?.response === 'string' && parsed.response.trim()) {
      return { ok: true, note: 'ok-response', text: parsed.response.trim() }
    }
    const nestedResponse = parsed?.result?.response
    if (typeof nestedResponse === 'string' && nestedResponse.trim()) {
      return { ok: true, note: 'ok-json', text: nestedResponse.trim() }
    }
    if (typeof parsed?.error === 'string' && parsed.error.trim()) {
      return classifyErrorNote(parsed.error)
    }
    if (typeof parsed?.message === 'string' && parsed.message.trim() && !parsed?.ok) {
      return classifyErrorNote(parsed.message)
    }
  } catch {}

  const dataLines = raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
    .filter((line) => line !== '[DONE]')

  let sawComplete = false
  let sawDelta = false
  let completeText = ''
  let deltaText = ''
  let errorText = ''

  for (const line of dataLines) {
    try {
      const parsed = JSON.parse(line)
      if (parsed?.type === 'delta') {
        sawDelta = true
        if (typeof parsed?.data?.text === 'string') deltaText += parsed.data.text
      } else if (parsed?.type === 'complete') {
        sawComplete = true
        if (typeof parsed?.data?.text === 'string') completeText = parsed.data.text
      } else if (parsed?.type === 'error') {
        if (typeof parsed?.data === 'string' && parsed.data.trim()) errorText = parsed.data.trim()
        else if (typeof parsed?.data?.error === 'string' && parsed.data.error.trim()) errorText = parsed.data.error.trim()
      }
    } catch {}
  }

  if (errorText) return classifyErrorNote(errorText)

  const finalText = (completeText || deltaText).trim()
  if (sawComplete || (sawDelta && finalText)) {
    return { ok: true, note: 'ok-stream', text: finalText }
  }

  const trimmedRaw = raw.trim()
  if (trimmedRaw && dataLines.length === 0) {
    if (/Agent timeout/i.test(trimmedRaw)) return { ok: false, note: `error:${trimmedRaw}` }
    if (/No model provider credentials are configured for this chat/i.test(trimmedRaw)) {
      return { ok: false, note: `skipped:no-credentials:${trimmedRaw}` }
    }
  }

  return { ok: false, note: 'unexpected-format' }
}

export function resolvePerfModelProvider(model: string): string {
  if (model.startsWith('openai/')) return 'openai'
  if (model.startsWith('anthropic/')) return 'anthropic'
  if (model.startsWith('google/') || model.startsWith('gemini/')) return 'gemini'
  if (model.startsWith('ollama/')) return 'ollama'
  if (model.startsWith('openai-compatible/')) return 'openai-compatible'
  return 'unknown'
}

export function classifyPerfModelAvailability(
  model: string,
  configured: {
    openai?: boolean
    anthropic?: boolean
    gemini?: boolean
    ollama?: boolean
    openaiCompatible?: boolean
  },
): string | null {
  switch (resolvePerfModelProvider(model)) {
    case 'openai':
      return configured.openai ? null : 'skipped:no-credentials:openai provider is not configured for perf sampling'
    case 'anthropic':
      return configured.anthropic ? null : 'skipped:no-credentials:anthropic provider is not configured for perf sampling'
    case 'gemini':
      return configured.gemini ? null : 'skipped:no-credentials:gemini provider is not configured for perf sampling'
    case 'ollama':
      return configured.ollama ? null : 'skipped:no-credentials:ollama provider is not configured for perf sampling'
    case 'openai-compatible':
      return configured.openaiCompatible ? null : 'skipped:no-credentials:openai-compatible provider is not configured for perf sampling'
    default:
      return `skipped:unsupported-model:${model}`
  }
}
