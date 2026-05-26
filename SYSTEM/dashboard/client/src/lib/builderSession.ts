export type BuilderSessionMessage = {
  role: 'assistant' | 'user'
  content: string
  label?: string
}

export type BuilderSessionRecommendation = {
  intent: string
  scope: string
  operation: string
  confidence: string
  summary?: string
  recommendedPath?: {
    title?: string
    reasoning?: string
    primaryAction?: {
      label?: string
      description?: string
    }
  }
  testPlan?: string[]
  groupingSuggestion?: {
    label: string
    rationale: string
    alternatives?: string[]
  }
  matchedAssets?: {
    agents?: Array<{ name: string }>
    skills?: Array<{ name: string }>
    agentTemplates?: Array<{ name: string }>
    organizationTemplates?: Array<{ name: string }>
    workflows?: Array<{ name: string }>
  }
} | null

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'builder-session'
}

function escapeMarkdown(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}

function formatTimestamp(date: Date): string {
  return date.toISOString()
}

export function buildBuilderRecommendationKey(recommendation: BuilderSessionRecommendation): string | null {
  if (!recommendation) return null
  const title = recommendation.recommendedPath?.title || 'recommendation'
  return [
    recommendation.intent,
    recommendation.scope,
    recommendation.operation,
    title,
  ].join('|')
}

export function createBuilderSessionDocPath(args: {
  workspaceName?: string
  sessionTitle?: string
  timestamp?: number
}): string {
  const date = new Date(args.timestamp || Date.now())
  const dateKey = date.toISOString().slice(0, 10)
  const workspaceSlug = slugify(args.workspaceName || 'workspace')
  const titleSlug = slugify(args.sessionTitle || 'builder-session')
  return `SYSTEM/Builder Sessions/${workspaceSlug}/${dateKey}/${titleSlug}.md`
}

export function createBuilderSessionMarkdown(args: {
  workspaceName?: string
  workspaceId?: string
  sessionId: string
  sessionTitle?: string
  timestamp?: number
  messages: BuilderSessionMessage[]
  recommendation: BuilderSessionRecommendation
  feedback?: 'up' | 'down'
}): string {
  const timestamp = new Date(args.timestamp || Date.now())
  const frontmatter = [
    '---',
    'docType: builder-session',
    `workspaceName: ${JSON.stringify(args.workspaceName || '')}`,
    `workspaceId: ${JSON.stringify(args.workspaceId || '')}`,
    `sessionId: ${JSON.stringify(args.sessionId)}`,
    `sessionTitle: ${JSON.stringify(args.sessionTitle || 'Builder session')}`,
    `generatedAt: ${JSON.stringify(formatTimestamp(timestamp))}`,
    `feedback: ${JSON.stringify(args.feedback || '')}`,
    `intent: ${JSON.stringify(args.recommendation?.intent || '')}`,
    `scope: ${JSON.stringify(args.recommendation?.scope || '')}`,
    `operation: ${JSON.stringify(args.recommendation?.operation || '')}`,
    `confidence: ${JSON.stringify(args.recommendation?.confidence || '')}`,
    '---',
  ].join('\n')

  const lines: string[] = [frontmatter, '', `# ${args.sessionTitle || 'Builder Session'}`, '']

  if (args.workspaceName) {
    lines.push(`- Workspace: ${args.workspaceName}`)
  }
  if (args.workspaceId) {
    lines.push(`- Workspace ID: \`${args.workspaceId}\``)
  }
  lines.push(`- Session ID: \`${args.sessionId}\``)
  lines.push(`- Generated: ${formatTimestamp(timestamp)}`)
  if (args.feedback) {
    lines.push(`- Feedback: ${args.feedback}`)
  }

  if (args.recommendation) {
    lines.push('', '## Recommendation', '')
    lines.push(`- Intent: ${args.recommendation.intent}`)
    lines.push(`- Scope: ${args.recommendation.scope}`)
    lines.push(`- Operation: ${args.recommendation.operation}`)
    lines.push(`- Confidence: ${args.recommendation.confidence}`)
    if (args.recommendation.recommendedPath?.title) {
      lines.push(`- Title: ${args.recommendation.recommendedPath.title}`)
    }
    if (args.recommendation.summary) {
      lines.push('', escapeMarkdown(args.recommendation.summary))
    }
    if (args.recommendation.recommendedPath?.reasoning) {
      lines.push('', '### Reasoning', '', escapeMarkdown(args.recommendation.recommendedPath.reasoning))
    }
    if (args.recommendation.groupingSuggestion?.label) {
      lines.push('', '### Suggested Grouping', '')
      lines.push(`- Label: ${args.recommendation.groupingSuggestion.label}`)
      lines.push(`- Rationale: ${args.recommendation.groupingSuggestion.rationale}`)
      if ((args.recommendation.groupingSuggestion.alternatives || []).length > 0) {
        lines.push(`- Alternatives: ${(args.recommendation.groupingSuggestion.alternatives || []).join(', ')}`)
      }
    }
    if ((args.recommendation.testPlan || []).length > 0) {
      lines.push('', '### Test Plan', '')
      for (const step of args.recommendation.testPlan || []) {
        lines.push(`- ${escapeMarkdown(step)}`)
      }
    }
  }

  lines.push('', '## Conversation', '')
  for (const message of args.messages) {
    const heading = message.role === 'user' ? 'User' : 'Builder agent'
    lines.push(`### ${heading}`, '', escapeMarkdown(message.content), '')
  }

  const matched = args.recommendation?.matchedAssets
  if (matched) {
    const sections: Array<[string, Array<{ name: string }> | undefined]> = [
      ['Agents', matched.agents],
      ['Skills', matched.skills],
      ['Agent Templates', matched.agentTemplates],
      ['Team Templates', matched.organizationTemplates],
      ['Workflows', matched.workflows],
    ]
    const nonEmpty = sections.filter(([, items]) => Array.isArray(items) && items.length > 0)
    if (nonEmpty.length > 0) {
      lines.push('## Matched Assets', '')
      for (const [label, items] of nonEmpty) {
        lines.push(`### ${label}`, '')
        for (const item of items || []) {
          lines.push(`- ${item.name}`)
        }
        lines.push('')
      }
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
