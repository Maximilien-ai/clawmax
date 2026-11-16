import assert from 'assert'
import fs from 'fs'
import path from 'path'

function tsxFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? tsxFiles(file) : entry.name.endsWith('.tsx') ? [file] : []
  })
}

const sourceRoot = path.join(__dirname)
let auditedButtons = 0
for (const file of tsxFiles(sourceRoot)) {
  for (const [index, line] of fs.readFileSync(file, 'utf8').split('\n').entries()) {
    const location = `${path.relative(sourceRoot, file)}:${index + 1}`
    assert(!/disabled:bg-gray-(300|400)\b/.test(line), `${location}: pale disabled button background needs theme-specific text and background`)
    if (!line.includes('disabled:bg-gray-200')) continue
    auditedButtons++
    assert(line.includes('disabled:text-gray-600'), `${location}: light disabled button text must remain legible`)
    assert(line.includes('dark:disabled:bg-gray-700'), `${location}: dark disabled button needs a dark surface`)
    assert(line.includes('dark:disabled:text-gray-300'), `${location}: dark disabled button text must remain legible`)
  }
}
assert(auditedButtons > 0, 'the disabled button audit must cover actual buttons')

const applyModal = fs.readFileSync(path.join(sourceRoot, 'components/ApplyOrgTemplateModal.tsx'), 'utf8')
assert(applyModal.includes('dark:disabled:bg-gray-700 dark:disabled:text-gray-300'), 'Apply Template must have a dark disabled state')
assert(!applyModal.includes('dark:bg-gray-900 dark:bg-gray-800'), 'template controls must not declare conflicting dark surfaces')

console.log(`Button theme audit passed (${auditedButtons} disabled buttons)`)
