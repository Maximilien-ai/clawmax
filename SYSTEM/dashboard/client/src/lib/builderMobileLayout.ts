export function shouldReserveBuilderTranscriptSpace({
  messageCount,
  hasRecommendation,
  loading,
}: {
  messageCount: number
  hasRecommendation: boolean
  loading: boolean
}): boolean {
  return messageCount > 0 || hasRecommendation || loading
}
