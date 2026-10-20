import { isDeepStrictEqual } from 'util'
import { sha256 } from './portable-template'
import { PortableTemplateError } from './portable-template-zip'
import type { TemplateAuthorityEvidence } from './template-authority'

export interface TemplateExecutionPolicySource {
  /** Server-owned policy lookup; never a request field or a client path. */
  read(id: string): unknown
}

/** The only currently supported policy. This does not authorize execution or
 * imply support for Skill installation, credential delivery or graph routing.
 * Hash the canonical JSON below, not a policy name or an arbitrary file format.
 */
export function noToolsTemplatePolicy(id: string) {
  return {
    apiVersion: 'clawmax.template-execution-policy/v1alpha1',
    credentials: [], heartbeat: { every: '0m' }, id, skills: [], tools: { deny: ['*'] },
  }
}

export function verifyTemplateExecutionPolicies(authority: TemplateAuthorityEvidence, source: TemplateExecutionPolicySource): void {
  if (authority.bindings.some(binding => binding.skills.length || binding.credentials.length)) {
    throw new PortableTemplateError('template_policy_unavailable', 'Committed Template execution policy is unavailable or unsupported', 409)
  }
  verifyTemplateStagingPolicies(authority, source)
}

/** A mixed revision may contain a credentialed Agent. That must not turn an
 * unrelated, no-tools Agent into a credentialed execution, nor block its
 * independently authorized no-tools eligibility. This check is only policy
 * validation; it never grants runtime admission by itself. */
export function verifyTemplateNoToolsAgentPolicy(authority: TemplateAuthorityEvidence, artifactId: string, source: TemplateExecutionPolicySource): void {
  verifyTemplateStagingPolicies(authority, source)
  const matches = authority.bindings.filter(binding => binding.artifactId === artifactId)
  if (matches.length !== 1 || matches[0].skills.length || matches[0].credentials.length) {
    throw new PortableTemplateError('template_policy_unavailable', 'Committed Template execution policy is unavailable or unsupported', 409)
  }
}

/** Staging keeps the no-tools gateway policy while recording Skill and named
 * credential requirements. It does not authorize a model or Skill invocation. */
export function verifyTemplateStagingPolicies(authority: TemplateAuthorityEvidence, source: TemplateExecutionPolicySource): void {
  const fail = (): never => { throw new PortableTemplateError('template_policy_unavailable', 'Committed Template execution policy is unavailable or unsupported', 409) }
  for (const binding of authority.bindings) {
    const expected = noToolsTemplatePolicy(binding.policy.id)
    let actual: unknown
    try { actual = source.read(binding.policy.id) } catch { fail() }
    if (!isDeepStrictEqual(actual, expected) || binding.policy.sha256 !== sha256(JSON.stringify(expected))) fail()
  }
}
