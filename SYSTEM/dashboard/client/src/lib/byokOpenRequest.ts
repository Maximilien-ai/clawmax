export interface ByokOpenRequest<TStep extends string> {
  step?: TStep
  provider?: string
  fromAiEditor?: boolean
}

export function resolveByokOpenRequest<TStep extends string>(detail: ByokOpenRequest<TStep> | undefined, initialStep: TStep) {
  return {
    step: detail?.step || initialStep,
    provider: detail?.provider === 'anthropic' ? 'anthropic' as const : null,
    aboveAiEditor: detail?.fromAiEditor === true,
  }
}
