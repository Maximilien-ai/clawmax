const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

const AUTOMATION_FILES = new Set([
  '.github/workflows/ci.yml',
  '.github/workflows/container-image.yml',
  '.github/workflows/test-container-image.yml',
  '.github/workflows/mirror-gcp-image.yml',
  '.github/workflows/image-action-contracts.yml',
  '.github/scripts/dashboard-test-scope.cjs',
  '.github/scripts/dashboard-test-scope.test.cjs',
  'README.md',
  'CHANGELOG.md',
])

function classifyPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return { dashboard: true, reason: 'No trustworthy changed-file inventory' }
  }
  const automationOnly = paths.every(file => {
    if (typeof file !== 'string' || !file || /[\\\x00-\x1f\x7f]/.test(file)
      || file.startsWith('/') || file.includes('//') || file.split('/').includes('..')) return false
    return AUTOMATION_FILES.has(file) || /^SYSTEM\/docs\/.+\.md$/.test(file)
  })
  return {
    dashboard: !automationOnly,
    reason: automationOnly ? 'Only reviewed automation/documentation paths changed' : 'Application, dependency, runtime, shared or unknown paths changed',
  }
}

function scopeForEvent(eventName, event, cwd = process.cwd(), git = execFileSync) {
  try {
    let base, head, separator
    if (eventName === 'pull_request') {
      base = event?.pull_request?.base?.sha
      head = event?.pull_request?.head?.sha
      separator = '...'
    } else if (eventName === 'push' && event?.ref === 'refs/heads/main') {
      base = event.before
      head = event.after
      separator = '..'
    } else {
      return { dashboard: true, reason: 'Release, tag or unsupported event requires full validation' }
    }
    if (![base, head].every(sha => typeof sha === 'string' && sha.length === 40 && /^[a-f0-9]{40}$/i.test(sha) && !/^0+$/.test(sha))) {
      return { dashboard: true, reason: 'Missing or invalid comparison commits' }
    }
    // Treat renames as removal + addition so moving application code into docs
    // cannot hide the application deletion. NUL delimiters preserve file names.
    const output = git('git', ['diff', '--no-renames', '--name-only', '-z', `${base}${separator}${head}`, '--'], {
      cwd, encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024,
    })
    if (typeof output !== 'string' || (output && !output.endsWith('\0'))) {
      return { dashboard: true, reason: 'Malformed changed-file inventory' }
    }
    return classifyPaths(output ? output.slice(0, -1).split('\0') : [])
  } catch {
    return { dashboard: true, reason: 'Comparison unavailable; full validation required' }
  }
}

function main() {
  let result
  try {
    result = scopeForEvent(process.env.GITHUB_EVENT_NAME, JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')))
  } catch {
    result = { dashboard: true, reason: 'Unreadable event; full validation required' }
  }
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required')
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `dashboard=${result.dashboard}\n`)
  console.log(`Dashboard validation: ${result.dashboard ? 'full' : 'focused automation'} — ${result.reason}`)
}

if (require.main === module) main()
module.exports = { classifyPaths, scopeForEvent }
