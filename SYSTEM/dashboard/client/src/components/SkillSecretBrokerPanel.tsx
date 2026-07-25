import React, { useCallback, useEffect, useMemo, useState } from 'react'

interface BrokerGrant {
  id: string
  agentId: string
  skillId: string
  skillFingerprint: string
  keys: string[]
  createdAt: string
  expiresAt?: string
  revokedAt?: string
}

interface BrokerStatus {
  configured: boolean
  workspaceId: string
  secrets: Array<{ key: string; present: true; preview: string }>
  grants: BrokerGrant[]
  registeredSkills: string[]
}

interface AgentSummary {
  id: string
  name?: string
}

export function SkillSecretBrokerPanel() {
  const [status, setStatus] = useState<BrokerStatus | null>(null)
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [secretKey, setSecretKey] = useState('CLAWMAX_TEST_SECRET')
  const [secretValue, setSecretValue] = useState('')
  const [agentId, setAgentId] = useState('')
  const [skillId, setSkillId] = useState('clawmax-secret-test')
  const [grantKeys, setGrantKeys] = useState('CLAWMAX_TEST_SECRET')
  const [busy, setBusy] = useState(false)
  const [setupCopied, setSetupCopied] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    const [statusResponse, agentsResponse] = await Promise.all([
      fetch('/api/skill-secret-broker/status'),
      fetch('/api/agents'),
    ])
    const statusPayload = await statusResponse.json()
    const agentsPayload = await agentsResponse.json()
    if (!statusResponse.ok) throw new Error(statusPayload.error || 'Failed to load skill secret broker')
    setStatus(statusPayload)
    const nextAgents = Array.isArray(agentsPayload?.agents) ? agentsPayload.agents : []
    setAgents(nextAgents)
    setAgentId((current) => current || nextAgents[0]?.id || '')
    setSkillId((current) => current || statusPayload.registeredSkills?.[0] || '')
  }, [])

  useEffect(() => {
    refresh().catch((error) => setMessage({ kind: 'error', text: error.message }))
  }, [refresh])

  const activeGrants = useMemo(() => (status?.grants || []).filter((grant) => !grant.revokedAt), [status])

  async function request(url: string, options: RequestInit) {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(url, {
        ...options,
        headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Request failed')
      await refresh()
      return payload
    } catch (error: any) {
      setMessage({ kind: 'error', text: error.message || 'Request failed' })
      throw error
    } finally {
      setBusy(false)
    }
  }

  async function saveSecret() {
    try {
      await request(`/api/skill-secret-broker/secrets/${encodeURIComponent(secretKey.trim())}`, {
        method: 'PUT',
        body: JSON.stringify({ value: secretValue }),
      })
      setSecretValue('')
      setMessage({ kind: 'success', text: `${secretKey.trim()} saved to encrypted workspace storage` })
    } catch {}
  }

  async function authorize() {
    try {
      await request('/api/skill-secret-broker/grants', {
        method: 'POST',
        body: JSON.stringify({
          agentId,
          skillId,
          keys: grantKeys.split(',').map((key) => key.trim()).filter(Boolean),
        }),
      })
      setMessage({ kind: 'success', text: `Authorized ${skillId} for ${agentId}` })
    } catch {}
  }

  async function copyOperatorSetup() {
    const setup = [
      '1. Generate a key: openssl rand -base64 48',
      '2. Set the result as CLAWMAX_SECRET_MASTER_KEY in your deployment or container secret environment.',
      '3. Restart the ClawMax dashboard, then return to Keys & Secrets.',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(setup)
      setSetupCopied(true)
      window.setTimeout(() => setSetupCopied(false), 2000)
    } catch {
      setMessage({ kind: 'error', text: 'Could not copy setup steps. Select the command and copy it manually.' })
    }
  }

  if (!status) {
    return <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800">Loading brokered skill secrets...</div>
  }

  return (
    <section className="space-y-4 border-y border-gray-200 py-5 dark:border-gray-700" aria-labelledby="skill-secret-broker-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="skill-secret-broker-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">Agent Skill Secret Access</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Store workspace secrets encrypted and authorize one assigned skill, agent, fingerprint, and exact key set. Agents can invoke registered actions but cannot browse or retrieve raw values.
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${status.configured
          ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300'
          : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
        }`}>
          {status.configured ? 'Encrypted broker ready' : 'Operator key required'}
        </span>
      </div>

      {!status.configured && (
        <div id="skill-secret-operator-setup" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
          <div className="font-semibold">Encrypted saving is locked</div>
          <ol className="mt-2 min-w-0 list-decimal space-y-2 pl-5 [overflow-wrap:anywhere]">
            <li>
              Generate a random key:
              <code className="mt-1 block w-fit max-w-full break-all rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-950/50">openssl rand -base64 48</code>
            </li>
            <li>Set it as <code>CLAWMAX_SECRET_MASTER_KEY</code> in the deployment or container secret environment.</li>
            <li>Restart the ClawMax dashboard, then return here.</li>
          </ol>
          <p className="mt-2 text-xs">The key must remain outside the workspace so exported workspaces cannot decrypt saved credentials.</p>
          <button type="button" onClick={copyOperatorSetup} className="mt-3 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-950/40">
            {setupCopied ? 'Setup steps copied' : 'Copy setup steps'}
          </button>
        </div>
      )}

      {message && (
        <div className={`rounded-md border p-3 text-sm ${message.kind === 'success'
          ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200'
          : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Encrypted Workspace Secrets</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Use API tokens, OAuth credentials, service-account values, or supported app passwords. Do not store a normal Google account password.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
            <input disabled={!status.configured || busy} aria-describedby={!status.configured ? 'skill-secret-operator-setup' : undefined} value={secretKey} onChange={(event) => setSecretKey(event.target.value.toUpperCase())} placeholder={status.configured ? 'SECRET_KEY' : 'Configure operator key first'} className="min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800" />
            <input disabled={!status.configured || busy} aria-describedby={!status.configured ? 'skill-secret-operator-setup' : undefined} type="password" value={secretValue} onChange={(event) => setSecretValue(event.target.value)} placeholder={status.configured ? 'Secret value' : 'Saving is locked'} className="min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800" />
            <button type="button" title={!status.configured ? 'Configure CLAWMAX_SECRET_MASTER_KEY and restart first' : 'Save encrypted workspace secret'} disabled={!status.configured || busy || !secretKey.trim() || !secretValue} onClick={saveSecret} className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">{status.configured ? 'Save' : 'Set operator key first'}</button>
          </div>
          <div className="space-y-2">
            {status.secrets.length === 0 && <div className="text-sm text-gray-400">No encrypted workspace secrets.</div>}
            {status.secrets.map((secret) => (
              <div key={secret.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                <span className="font-mono text-gray-800 dark:text-gray-200">{secret.key}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{secret.preview}</span>
                  <button type="button" disabled={busy} onClick={() => {
                    if (!window.confirm(`Delete encrypted workspace secret ${secret.key}? Existing grants will stop working.`)) return
                    request(`/api/skill-secret-broker/secrets/${encodeURIComponent(secret.key)}`, { method: 'DELETE' }).catch(() => undefined)
                  }} className="text-xs font-medium text-red-600 hover:text-red-700">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Authorize Assigned Skill</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Assign the skill to the agent first. Changing its content invalidates the fingerprint and requires a new grant.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={agentId} onChange={(event) => setAgentId(event.target.value)} className="min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
              <option value="">Select agent</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name || agent.id}</option>)}
            </select>
            <select value={skillId} onChange={(event) => setSkillId(event.target.value)} className="min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
              {status.registeredSkills.map((skill) => <option key={skill} value={skill}>{skill}</option>)}
            </select>
            <input value={grantKeys} onChange={(event) => setGrantKeys(event.target.value.toUpperCase())} placeholder="KEY_ONE, KEY_TWO" className="min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 sm:col-span-2" />
            <button type="button" disabled={!status.configured || busy || !agentId || !skillId || !grantKeys.trim()} onClick={authorize} className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2">Authorize Secret Access</button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Active Grants</h3>
        <div className="mt-2 space-y-2">
          {activeGrants.length === 0 && <div className="text-sm text-gray-400">No active skill grants.</div>}
          {activeGrants.map((grant) => (
            <div key={grant.id} className="flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <div className="font-medium text-gray-900 dark:text-gray-100">{grant.agentId} · {grant.skillId}</div>
                <div className="mt-1 break-all text-xs text-gray-500">{grant.keys.join(', ')} · fingerprint {grant.skillFingerprint.slice(0, 12)}</div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={async () => {
                  try {
                    const payload = await request(`/api/skill-secret-broker/grants/${grant.id}/test`, { method: 'POST', body: JSON.stringify({ action: 'check' }) })
                    setMessage({ kind: 'success', text: `Broker test passed: ${payload.stdout || 'authorized action completed'}` })
                  } catch {}
                }} className="rounded-md border border-sky-300 px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/20">Test Access</button>
                <button type="button" disabled={busy} onClick={() => request(`/api/skill-secret-broker/grants/${grant.id}`, { method: 'DELETE' }).then(() => setMessage({ kind: 'success', text: 'Secret access revoked' })).catch(() => undefined)} className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20">Revoke</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
