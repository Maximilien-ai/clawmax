import assert from 'assert'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.join(__dirname, '../pages/Agents.tsx'), 'utf8')
const gridClasses = source.match(/grid gap-2\.5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6/g) || []
assert.equal(gridClasses.length, 4, 'Every Agent grid section should use one column on phone widths')
assert(!source.includes('grid gap-2.5 grid-cols-2 sm:grid-cols-3'), 'No Agent grid should clip into two columns on a phone')
const nameClasses = source.match(/text=\{agent.name\}\s+className="([^"]+)"/)
assert(nameClasses, 'Agent card name must retain the overflow-aware tooltip')
assert(nameClasses![1].includes('line-clamp-2'), 'Names wrap to two lines before ellipsis')
assert(nameClasses![1].includes('min-w-0') && nameClasses![1].includes('break-words'), 'Long names stay inside narrow cards')
assert(!nameClasses![1].includes('truncate'), 'Single-line truncation must not override wrapping')
console.log('agentGridResponsive.test.ts: passed')
