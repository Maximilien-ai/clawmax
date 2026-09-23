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
  const fail = (): never => { throw new PortableTemplateError('template_policy_unavailable', 'Committed Template execution policy is unavailable or unsupported', 409) }
  for (const binding of authority.bindings) {
    // Never silently drop requested execution authority to fit the supported
    // adapter. In particular, this cannot stand in for Collector-only access.
    if (binding.skills.length || binding.credentials.length) fail()
    const expected = noToolsTemplatePolicy(binding.policy.id)
    let actual: unknown
    try { actual = source.read(binding.policy.id) } catch { fail() }
    if (!isDeepStrictEqual(actual, expected) || binding.policy.sha256 !== sha256(JSON.stringify(expected))) fail()
  }
}
