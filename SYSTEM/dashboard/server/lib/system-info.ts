import type { HostAgentStatus } from './host-agent-status'
import type { MaintenanceBannerConfig } from './dashboard-env'
import type { RuntimeInstanceIdentity } from './opik'

type AgentLike = {
  paused?: boolean
  status?: string
}

export type SystemInfoPayloadInput = {
  workspace: string
  hostname: string
  platform: NodeJS.Platform | string
  agents: AgentLike[]
  version: string
  instanceLabel: string | null
  gitBranch: string
  deploymentKind: string
  managedRuntime: boolean
  ollamaEnabled: boolean
  defaultOllamaBaseUrl: string
  defaultOpenAiCompatibleBaseUrl: string
  maintenanceBanner: MaintenanceBannerConfig | null
  hostAgentStatus: HostAgentStatus | null
  runtimeIdentity: RuntimeInstanceIdentity
  orgName: string | null
}

export function buildSystemInfoPayload(input: SystemInfoPayloadInput) {
  const activeAgents = input.agents.filter((agent) => !agent.paused)
  return {
    workspace: input.workspace,
    hostname: input.hostname,
    platform: input.platform,
    instanceKey: input.runtimeIdentity.instanceKey || null,
    machineId: input.runtimeIdentity.machineId || null,
    machineName: input.runtimeIdentity.machineName || null,
    agentCount: input.agents.length,
    activeAgentCount: activeAgents.length,
    pausedAgentCount: input.agents.length - activeAgents.length,
    onlineCount: activeAgents.filter((agent) => agent.status === 'online').length,
    version: input.version,
    instanceLabel: input.instanceLabel,
    gitBranch: input.gitBranch,
    deploymentKind: input.deploymentKind,
    managedRuntime: input.managedRuntime,
    ollamaEnabled: input.ollamaEnabled,
    defaultOllamaBaseUrl: input.defaultOllamaBaseUrl,
    defaultOpenAiCompatibleBaseUrl: input.defaultOpenAiCompatibleBaseUrl,
    maintenanceBanner: input.maintenanceBanner,
    hostAgentStatus: input.hostAgentStatus,
    orgName: input.orgName,
  }
}
