/** Preserve the actionable part of a native sessions.create rejection through
 * both Dashboard error-formatting passes, without echoing raw runtime logs. */
export function describeUnavailableHarness(text: string): string | undefined {
  const failure = /\bModel ([a-z0-9._:/-]{1,200}) requires agent harness "([a-z0-9._-]{1,80})", but no enabled plugin provides it\./i.exec(text)
  if (!failure) return undefined
  return `Model ${failure[1]} requires agent harness "${failure[2]}", but no enabled plugin provides it. Choose a model supported by this Gateway, or ask the instance owner to enable the required plugin and restart the Gateway.`
}
