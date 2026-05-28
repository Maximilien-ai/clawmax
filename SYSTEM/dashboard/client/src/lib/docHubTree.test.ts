import { buildDocHubTree, getDocHubChildDirectories } from './docHubTree'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error: any) {
    console.error(`✗ ${name}`)
    console.error(error?.message || error)
    process.exitCode = 1
  }
}

test('buildDocHubTree preserves intermediate workflow output directories', () => {
  const tree = buildDocHubTree([
    'kickoff.md',
    'outputs/kickoff/brief.md',
    'outputs/event-discovery/event-discovery-output.md',
  ])

  const rootDirs = getDocHubChildDirectories(tree, '')
  assert(rootDirs.includes('outputs'), `Expected outputs root dir, got ${JSON.stringify(rootDirs)}`)

  const outputChildren = getDocHubChildDirectories(tree, 'outputs')
  assert(outputChildren.includes('outputs/kickoff'), `Expected outputs/kickoff child dir, got ${JSON.stringify(outputChildren)}`)
  assert(outputChildren.includes('outputs/event-discovery'), `Expected outputs/event-discovery child dir, got ${JSON.stringify(outputChildren)}`)
})

test('buildDocHubTree keeps top-level files at root', () => {
  const tree = buildDocHubTree([
    'WORKFLOW.md',
    'outputs/kickoff/brief.md',
  ])

  assert(tree[''].includes('WORKFLOW.md'), `Expected top-level workflow file at root, got ${JSON.stringify(tree[''])}`)
})

if (!process.exitCode) {
  console.log('All tests passed')
}
