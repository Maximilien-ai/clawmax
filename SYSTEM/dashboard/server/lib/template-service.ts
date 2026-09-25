import fs from 'fs'
import path from 'path'
import os from 'os'
import { sha256 } from './portable-template'
import { readTemplateAuthorityRegistry, assertTemplateLifecycleAuthority } from './template-authority'
import { noToolsTemplatePolicy, verifyTemplateStagingPolicies } from './template-execution-policy'
import { createTemplateResourceFileCompiler } from './template-resource-files'
import { TemplateRevisionStore } from './template-revisions'
import { TemplateApplyCoordinator } from './template-apply-coordinator'
import { createTemplateGatewayTransport, TemplateGatewayTransaction } from './template-gateway-transaction'
import { getGatewayClient, type GatewayRPCClient } from './gateway-rpc'
import { templateStoragePath } from './template-storage-path'
import type { TemplateWorkspaceContext } from '../routes/instance-templates'
import type { CliTemplateExecution } from '../routes/instance-chat'

type RuntimeClient = Pick<GatewayRPCClient, 'getConfig' | 'patchTemplateAgentEntriesAtRevision' | 'runNoToolsTemplateAgent'>

/** Operator-owned configuration only; no registry is accepted from an HTTP
 * request or workspace file. Every request rereads authority, so revocation
 * applies without a restart. Only the fixed no-tools policy is supported. */
export function createConfiguredTemplateResolver(options: {
  authorityDirectory: string; agentStateRoot: string
  runtime: { platform: string; revision: string }; client: RuntimeClient
}) {
  if (!path.isAbsolute(options.authorityDirectory) || !path.isAbsolute(options.agentStateRoot)
    || !/^(linux|darwin)\/(amd64|arm64)$/.test(options.runtime.platform)
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.runtime.revision)) throw new Error('Invalid server Template configuration')
  return (context: TemplateWorkspaceContext): CliTemplateExecution => {
    const directory = fs.realpathSync(options.authorityDirectory)
    const workspace = fs.realpathSync(context.workspacePath)
    const relative = path.relative(workspace, directory)
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Template authority must be outside the workspace')
    const file = templateStoragePath(directory, `${sha256(context.workspaceId)}.json`)
    const authority = { runtime: options.runtime, read: () => readTemplateAuthorityRegistry(file) }
    // Fail at service resolution for missing configuration, without creating
    // workspace state or reaching the gateway.
    authority.read()
    const compile = createTemplateResourceFileCompiler(context.workspacePath, authority)
    const store = new TemplateRevisionStore(context.workspacePath, context.workspaceId, (...args) => {
      const compiled = compile(...args)
      if (!compiled.authority) throw new Error('Template authority is unavailable')
      verifyTemplateStagingPolicies(compiled.authority, { read: noToolsTemplatePolicy })
      // Planning and stopped gateway registration do not grant execution.
      // Skill/credential-bearing revisions remain blocked by the separate
      // runtime policy checks in TemplateApplyCoordinator.
      return compiled
    })
    const coordinator = new TemplateApplyCoordinator(store,
      new TemplateGatewayTransaction(context.workspacePath, createTemplateGatewayTransport(options.client)), options.agentStateRoot)
    return { store, coordinator, authority, policies: { read: noToolsTemplatePolicy }, runtime: options.client,
      assertStagingAvailable: () => assertTemplateLifecycleAuthority(context, authority),
      // Reserved resources cannot enter legacy runtimes. Coordinator locking,
      // immutable stopped/disabled resources and pending receipts guard cleanup.
      assertStopped() {},
    }
  }
}

export function configuredTemplateRuntimePlatform(env: NodeJS.ProcessEnv = process.env): string {
  const localPlatform = `${process.platform}/${process.arch === 'x64' ? 'amd64' : process.arch}`
  return env.NODE_ENV !== 'production'
    && env.CLAWMAX_DEV_HOST_SKILL_AUTHORITY === '1'
    && env.DASHBOARD_APP_URL === 'http://localhost:5174'
    && env.CLAWMAX_DEV_HOST_TEMPLATE_PLATFORM === 'linux/arm64'
      ? 'linux/arm64' : localPlatform
}

export function configuredTemplateResolverFromEnv() {
  const authorityDirectory = process.env.CLAWMAX_TEMPLATE_AUTHORITY_DIR
  if (!authorityDirectory) return undefined
  // A Mac dev host may inspect a Linux-staged Template while the signed Mac
  // CLI executes separately. This does not admit the Template Agent runtime.
  return createConfiguredTemplateResolver({ authorityDirectory,
    agentStateRoot: path.join(os.homedir(), '.openclaw', 'agents'),
    runtime: { platform: configuredTemplateRuntimePlatform(), revision: process.env.CLAWMAX_TEMPLATE_RUNTIME_REVISION || '' },
    client: {
      getConfig: () => getGatewayClient().getConfig(),
      patchTemplateAgentEntriesAtRevision: (entries, hash) => getGatewayClient().patchTemplateAgentEntriesAtRevision(entries, hash),
      runNoToolsTemplateAgent: input => getGatewayClient().runNoToolsTemplateAgent(input),
    },
  })
}
