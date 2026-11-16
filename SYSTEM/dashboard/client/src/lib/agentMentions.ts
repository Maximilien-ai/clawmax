export type MentionAgent = { id: string; name?: string; archived?: boolean }
export function mentionedAgentIds(text: string, agents: MentionAgent[]): string[] {
  const active = agents.filter(a => !a.archived)
  if (/(?:^|[\s`(])@all(?![\w-])/i.test(text)) return active.map(a => a.id)
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return active.filter(a => [a.id, a.name].filter(Boolean).some(name => new RegExp(`(?:^|[\\s\`(])@${escape(name!)}(?![\\w-])`, 'i').test(text))).map(a => a.id)
}
export function updateMentionSelection(before: string, after: string, selected: string[], agents: MentionAgent[]): string[] {
  const old = new Set(mentionedAgentIds(before, agents))
  return [...new Set([...selected.filter(id => !old.has(id)), ...mentionedAgentIds(after, agents)])]
}
