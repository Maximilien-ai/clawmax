import assert from 'assert'
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname)
const wizard = fs.readFileSync(path.join(root, 'components/ByokWizard.tsx'), 'utf8')
const skills = fs.readFileSync(path.join(root, 'pages/SkillsTest.tsx'), 'utf8')

assert(wizard.includes("initialStep === 'partners' ? 'Partner Integrations'"), 'Partners entry point must use a partner-focused title')
assert(wizard.includes('Opik and Resend are not prerequisites for Cognee'), 'Partner selection must state that integrations are independent')
assert(wizard.includes('Selecting a partner adds its setup page; it does not install software.'), 'Partner selection must distinguish setup from installation')
assert(wizard.includes('Configure {partner.name}'), 'Every partner card must provide direct setup navigation')
assert(wizard.includes('Install OpenClaw Plugin'), 'Curated runtime installation must name the OpenClaw plugin boundary')
assert(skills.includes('Partner Capabilities'), 'Skills must separate the mixed partner capability surface from ordinary agent skills')
assert(skills.includes('Agent skills are assigned to agents. Curated OpenClaw plugins extend the runtime'), 'Skills must explain agent-skill and runtime-plugin ownership')
assert(!skills.includes("{running ? 'Running...' : 'Install'}"), 'Partner plugin controls must not use an ambiguous Install label')
assert(skills.includes('This setup does not block creating or saving an agent.'), 'Optional skill setup must not look like an agent-creation prerequisite')
assert(skills.includes("new CustomEvent('open-partners-wizard')"), 'Skills partner capabilities must link back to partner configuration')
assert(wizard.includes('Plugin status was refreshed automatically.'), 'Partner install completion must report automatic status refresh instead of vague restart advice')
assert(!wizard.includes('Restart the dashboard/runtime if OpenClaw reports'), 'Partner install completion must not leave an unactionable conditional restart')

console.log('PartnerSetupClarity.test.ts: ok (12 tests)')
