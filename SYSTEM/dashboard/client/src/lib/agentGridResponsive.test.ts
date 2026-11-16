import assert from 'assert'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.join(__dirname, '../pages/Agents.tsx'), 'utf8')
const gridClasses = source.match(/grid gap-2\.5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6/g) || []
assert.equal(gridClasses.length, 4, 'Every Agent grid section should use one column on phone widths')
assert(!source.includes('grid gap-2.5 grid-cols-2 sm:grid-cols-3'), 'No Agent grid should clip into two columns on a phone')
console.log('agentGridResponsive.test.ts: passed')
