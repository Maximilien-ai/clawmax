import assert from 'assert'
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname)
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const modal = read('components/AIPromptEditorModal.tsx')
const panel = read('components/PromptQualityPanel.tsx')
const builder = read('pages/Builder.tsx')
const integrations = [
  ['pages/Builder.tsx', 'domain="builder"', 'qualityDomain="builder"'],
  ['components/AddAgentWizard.tsx', 'domain="agent"', 'qualityDomain="agent"'],
  ['pages/SkillsTest.tsx', 'domain="skill"', 'qualityDomain="skill"'],
  ['components/TemplateWizard.tsx', 'domain="template"', 'qualityDomain="template"'],
  ['pages/Workflows.tsx', 'domain="workflow"', 'qualityDomain="workflow"'],
  ['pages/PluginWorkspacePage.tsx', 'domain="plugin"', 'qualityDomain="plugin"'],
] as const

assert(modal.includes('<PromptQualityPanel prompt={draft} domain={qualityDomain} />'), 'Every AI Editor must score its live draft')
assert(modal.includes("qualityDomain = 'general'"), 'AI Editor must provide a safe general scoring fallback')
assert(panel.includes('Prompt readiness'), 'Scoring panel must identify the score as prompt readiness')
assert(panel.includes('quality.score}/100'), 'Scoring panel must show a stable 100-point score')
assert(panel.includes('quality.suggestions.map'), 'Scoring panel must show prioritized improvement suggestions')
assert(panel.includes('recordPromptQualityFeedback'), 'Scoring guidance must expose a local feedback hook')
assert(panel.includes('suggestionIds: quality.suggestions.map'), 'Feedback must capture rule IDs rather than raw prompt text')
assert(!panel.includes('score: quality.score,\n      prompt'), 'Feedback payload must not include raw prompt text')
assert(panel.includes('sm:flex-row sm:justify-between'), 'Scoring guidance and feedback must stack on phone widths')
assert(panel.includes('collapsible?: boolean'), 'Scoring panel must support a compact disclosure when space is limited')
assert(panel.includes("'Show readiness details'"), 'Collapsed scoring must provide an explicit details action')
assert(panel.includes('aria-expanded={expanded}'), 'Readiness disclosure must expose its expanded state')
assert(builder.includes('<PromptQualityPanel prompt={prompt} domain="builder" compact collapsible />'), 'Builder must keep readiness compact until a user asks for details')
assert(builder.includes("builderQuestion ? 'Ask Builder' : 'Design This'"), 'Question commands must expose a direct Builder action')
assert(builder.includes('This asks the Builder about the current workspace'), 'Question commands must explain that they do not generate a recommendation')

for (const [relativePath, inlineDomain, editorDomain] of integrations) {
  const source = read(relativePath)
  assert(source.includes(inlineDomain), `${relativePath} must score its initial AI prompt`)
  assert(source.includes(editorDomain), `${relativePath} must preserve its domain in AI Editor`)
}

assert(read('components/AgentTemplateWizard.tsx').includes('qualityDomain="agent"'), 'Agent template AI Editor must use agent rules')
assert(read('components/WorkflowEditorDialog.tsx').includes('qualityDomain="workflow"'), 'Workflow description AI Editor must use workflow rules')
assert(read('pages/Workflows.tsx').includes('ariaLabelledBy="workflow-ai-create-title"'), 'Workflow AI Create must use the shared mobile-safe dialog')
assert(read('pages/PluginWorkspacePage.tsx').includes('ariaLabelledBy="plugin-ai-create-title"'), 'Plugin AI Create must use the shared mobile-safe dialog')

console.log('PromptQualityIntegration.test.ts: 32 tests passed')
