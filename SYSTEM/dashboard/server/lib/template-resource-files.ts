import fs from 'fs'
import matter from 'gray-matter'
import { compileTemplateResourceGraph } from './template-resource-graph'
import { TemplateCompiler } from './template-revisions'
import { PortableTemplateError } from './portable-template-zip'
import { sha256 } from './portable-template'
import { templateStoragePath } from './template-storage-path'
import { WorkspaceFileMutation } from './workspace-file-transaction'
import { resolveTemplateAuthority, TemplateAuthoritySource } from './template-authority'
import { compileTemplateSkillMutations } from './template-skill-package'

const line = (value: string) => value.replace(/[\r\n\u2028\u2029]/g, ' ').replace(/\*\*/g, '').trim()

/** Builds canonical workspace file mutations without writing anything.
 * This adapter intentionally admits no execution authority. It is internal,
 * not a public apply API, until gateway commit/recovery and authority binding
 * are integrated. Full graph sidecars preserve semantics legacy Markdown
 * readers cannot represent; those readers must never execute a flattened graph.
 */
export function createTemplateResourceFileCompiler(workspacePath: string, authoritySource?: TemplateAuthoritySource): TemplateCompiler {
  return (bundle, request, prefix, context) => {
    const hasEmbeddedSkills = bundle.artifacts.some(item => [...(item.files?.keys() || [])].some(file => file.startsWith('content/skills/')))
    if (!authoritySource && (Object.keys(request.bindings).length || bundle.manifest.secretRequirements.length || bundle.artifacts.some(item => item.kind === 'agent' && item.definition.skills.length))) {
      throw new PortableTemplateError('template_authority_unavailable', 'Skill, policy, and credential bindings require server-owned authority admission', 409)
    }
    if (authoritySource && !context) throw new PortableTemplateError('template_authority_unavailable', 'Server actor and workspace context are required', 409)
    const authority = authoritySource ? resolveTemplateAuthority(bundle, request.bindings, context!, authoritySource) : undefined
    if (hasEmbeddedSkills && !authority) throw new PortableTemplateError('template_authority_unavailable', 'Embedded Skill files require server-owned authority admission', 409)
    const graph = compileTemplateResourceGraph(bundle, prefix)
    const mutations: WorkspaceFileMutation[] = []
    if (authority) mutations.push(...compileTemplateSkillMutations(bundle, authority, workspacePath))
    const create = (relative: string, content: string) => {
      const file = templateStoragePath(workspacePath, relative)
      if (fs.existsSync(file)) throw new PortableTemplateError('resource_conflict', 'Template resource already exists', 409)
      mutations.push({ path: relative, expectedSha256: null, content })
    }
    for (const agent of graph.agents) {
      const dir = `AGENTS/${agent.id}`
      if (fs.existsSync(templateStoragePath(workspacePath, dir)) && fs.readdirSync(templateStoragePath(workspacePath, dir)).length) throw new PortableTemplateError('resource_conflict', 'Template agent directory is already occupied', 409)
      create(`${dir}/IDENTITY.md`, `# Identity\n\n**Name:** ${line(agent.name)}\n**Tags:** ${agent.tags.join(', ')}\n\n${line(agent.description)}\n`)
      create(`${dir}/SOUL.md`, agent.instructions)
      create(`${dir}/TEMPLATE_RESOURCE.json`, JSON.stringify(agent))
      if (authority) create(`${dir}/TEMPLATE_AUTHORITY.json`, JSON.stringify(authority.bindings.find(binding => binding.artifactId === agent.artifactId)))
      const groups = graph.groups.filter(group => group.members.some(member => member.agentId === agent.id))
      create(`${dir}/GROUPS.md`, `# Groups\n\n${groups.map(group => `- ${group.id}`).join('\n')}\n`)
    }
    if (graph.communities.length) {
      const relative = 'ORG/COMMUNITIES.md'
      const file = templateStoragePath(workspacePath, relative)
      let before: string | null = null
      if (fs.existsSync(file)) {
        const stat = fs.statSync(file)
        if (!stat.isFile() || stat.size > 1024 * 1024) throw new PortableTemplateError('resource_conflict', 'Community registry is not a bounded regular file', 409)
        before = fs.readFileSync(file, 'utf8')
      }
      for (const community of graph.communities) {
        if ((before || '').split('\n').some(row => row.trim() === `### ${line(community.name)}`)) throw new PortableTemplateError('resource_conflict', 'Template Community already exists', 409)
        create(`ORG/template-communities/${community.id}.json`, JSON.stringify(community))
      }
      const entries = graph.communities.map(community => `### ${line(community.name)}\n- **Description:** ${line(community.description)}\n- **Tags:** ${community.tags.join(', ')}\n- **Members:** ${community.memberAgentIds.join(', ')}\n- **Template Resource ID:** ${community.id}\n`).join('\n')
      mutations.push({ path: relative, expectedSha256: before === null ? null : sha256(before), content: `${before || '# Communities\n'}\n## Communities\n\n${entries}` })
    }
    if (graph.groups.length) {
      const relative = 'ORG/GROUPS.md'
      const file = templateStoragePath(workspacePath, relative)
      let before: string | null = null
      if (fs.existsSync(file)) {
        const stat = fs.statSync(file)
        if (!stat.isFile() || stat.size > 1024 * 1024) throw new PortableTemplateError('resource_conflict', 'Group registry is not a bounded regular file', 409)
        before = fs.readFileSync(file, 'utf8')
      }
      for (const group of graph.groups) {
        if ((before || '').split('\n').some(row => row.trim() === `### ${group.id}`)) throw new PortableTemplateError('resource_conflict', 'Template Group already exists', 409)
        create(`ORG/template-groups/${group.id}.json`, JSON.stringify(group))
      }
      const entries = graph.groups.map(group => {
        const community = graph.communities.find(item => item.groupIds.includes(group.id))
        return `### ${group.id}\n- **Description:** ${line(group.name)} — ${line(group.description)}\n${community ? `- **Community:** ${line(community.name)}\n` : ''}- **Members:** ${[...new Set(group.members.map(member => member.agentId))].join(', ')}\n`
      }).join('\n')
      mutations.push({ path: relative, expectedSha256: before === null ? null : sha256(before), content: `${before || '# Organization\n'}\n## Groups\n\n${entries}` })
    }
    for (const workflow of graph.workflows) {
      create(`WORKFLOWS/${workflow.id}.json`, JSON.stringify(workflow))
      create(`WORKFLOWS/${workflow.id}.md`, matter.stringify(workflow.objective, {
        name: workflow.name, description: workflow.description, enabled: false,
        schedule: '', status: 'blocked', executionMode: workflow.execution.mode,
        // The original schedule/step DAG is retained in the adjacent graph file.
        targeting: { agents: [], groups: [], communities: [], tags: [] },
        type: workflow.runPolicy.type, maxRuns: workflow.runPolicy.maxRuns,
        runCount: 0, dependsOn: workflow.runPolicy.dependsOn,
        created: bundle.manifest.createdAt, modified: bundle.manifest.createdAt,
        author: 'template', templateArtifactId: workflow.artifactId,
      }))
    }
    return {
      resources: graph.resources, mutations, authorityDigest: authority?.digest || sha256('clawmax.template.authority/pending-v1'),
      ...(authority ? { authority: { registryRevision: authority.registryRevision, workspaceId: authority.workspaceId, bindings: authority.bindings } } : {}),
    }
  }
}
