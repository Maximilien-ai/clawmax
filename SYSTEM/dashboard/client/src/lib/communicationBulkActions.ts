export type CommunicationChannelType = 'community' | 'group'

export interface CommunicationBulkChannel {
  name: string
  type: CommunicationChannelType
}

export function getCommunicationChannelKey(channel: CommunicationBulkChannel): string {
  return `${channel.type}:${channel.name}`
}

export function buildBulkHistoryClearPlan(
  channels: CommunicationBulkChannel[],
  selectedChannelKeys: Set<string>,
): CommunicationBulkChannel[] {
  return channels.filter((channel) => selectedChannelKeys.has(getCommunicationChannelKey(channel)))
}

export function getChannelHistoryClearEndpoint(channel: CommunicationBulkChannel): string {
  const encodedName = encodeURIComponent(channel.name)
  return channel.type === 'community'
    ? `/api/communities/${encodedName}/messages`
    : `/api/groups/${encodedName}/messages`
}
