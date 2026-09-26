export function channelLabel(channel: { name: string; displayName?: unknown }): string {
  return typeof channel.displayName === 'string' && channel.displayName.trim() ? channel.displayName.trim() : channel.name
}
