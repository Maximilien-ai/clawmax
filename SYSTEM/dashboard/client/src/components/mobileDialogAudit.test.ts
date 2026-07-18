import assert from 'assert'
import fs from 'fs'
import path from 'path'

const sourceRoot = path.resolve(process.cwd(), 'client/src')

const legacyWholePanelScroll = new Set([
  'components/AgentTemplateWizard.tsx::bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto',
  'components/ApplyAgentTemplateModal.tsx::bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-4 sm:p-6 max-h-[92dvh] overflow-y-auto',
  'components/ApplyOrgTemplateModal.tsx::w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-gray-800 sm:max-h-[90vh] sm:p-6',
  'components/ByokWizard.tsx::w-full max-w-3xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-4 sm:p-5 max-h-[96dvh] overflow-y-auto',
  'components/OnboardingWizard.tsx::w-full max-w-5xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-6 max-h-[90vh] overflow-y-auto',
  'components/TemplateWizard.tsx::bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto',
  'components/WorkflowEditorDialog.tsx::bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-auto',
  'pages/PluginWorkspacePage.tsx::max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900',
  'pages/Templates.tsx::w-full max-w-2xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-5 max-h-[90vh] overflow-y-auto',
  'pages/Templates.tsx::w-full max-w-6xl rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-5 max-h-[92vh] overflow-y-auto',
  'pages/Templates.tsx::bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto',
  'pages/Templates.tsx::w-full max-w-xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-5 max-h-[90vh] overflow-y-auto',
])

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return walk(entryPath)
    return entry.name.endsWith('.tsx') ? [entryPath] : []
  })
}

const dialogFiles: string[] = []
const wholePanelScroll: string[] = []
const classPattern = /className="([^"]*(?:max-h-\[[^\]]*(?:80|90|92|94|96|100)(?:d)?vh[^\]]*\][^"]*overflow-(?:y-)?auto|overflow-(?:y-)?auto[^"]*max-h-\[[^\]]*(?:80|90|92|94|96|100)(?:d)?vh[^\]]*\])[^"]*)"/g

for (const file of walk(sourceRoot)) {
  const source = fs.readFileSync(file, 'utf8')
  if (!source.includes('fixed inset-0')) continue
  const relativeFile = path.relative(sourceRoot, file)
  dialogFiles.push(relativeFile)

  let match: RegExpExecArray | null
  while ((match = classPattern.exec(source))) {
    const nearbyPrefix = source.slice(Math.max(0, match.index - 1600), match.index)
    if (nearbyPrefix.includes('fixed inset-0')) {
      wholePanelScroll.push(`${relativeFile}::${match[1]}`)
    }
  }
}

const unexpected = wholePanelScroll.filter((entry) => !legacyWholePanelScroll.has(entry))
assert(dialogFiles.length >= 40, `expected to audit at least 40 dialog/pop-up source files, found ${dialogFiles.length}`)
assert(unexpected.length === 0, `new full-panel viewport scrolling dialogs must use MobileSafeDialog or a fixed header/body/footer layout:\n${unexpected.join('\n')}`)
assert(!wholePanelScroll.some((entry) => entry.startsWith('pages/Workflows.tsx::')), 'workflow dialogs must keep actions outside the scroll region')
assert(wholePanelScroll.length <= 13, `legacy mobile dialog debt increased from 13 to ${wholePanelScroll.length}`)

console.log(`mobileDialogAudit.test.ts: 4 assertions passed (${dialogFiles.length} dialog/pop-up files audited, ${wholePanelScroll.length} legacy exceptions)`)
