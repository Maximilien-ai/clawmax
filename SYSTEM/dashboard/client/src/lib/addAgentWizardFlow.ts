export function normalizePromptInput(override: unknown, fallback: string): string {
  return typeof override === 'string' ? override.trim() : fallback.trim()
}

export function resolveAddAgentWizardLaunchState(input: {
  startWithAI?: boolean
  initialAiDescription?: string
}) {
  const aiPrompt = input.startWithAI
    ? normalizePromptInput(input.initialAiDescription, '')
    : ''

  return {
    initialStep: input.startWithAI ? 2 : 1,
    aiPrompt,
    enableAi: !!aiPrompt,
  } as const
}
