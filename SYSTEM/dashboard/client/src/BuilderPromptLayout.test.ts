import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, 'pages/Builder.tsx'), 'utf8')

assert.match(source, /const \[showRightPane, setShowRightPane\] = useState\(false\)/,
  'The Builder should start with the prompt occupying the available width')
assert.match(source, /setShowRightPane\(Boolean\(recommendation\)\)/,
  'A recommendation should open the result pane')
assert.match(source, /const \[promptExpanded, setPromptExpanded\] = useState\(true\)/,
  'The Builder prompt should start large')
assert.match(source, /rows=\{promptExpanded \? 7 : 3\}/,
  'The prompt must keep at least three lines when reduced')
assert.match(source, /aria-label=\{promptExpanded \? 'Shrink builder prompt' : 'Expand builder prompt'\}/,
  'The prompt size toggle needs an accessible name')
assert.match(source, /textareaRef\.current\.style\.height = ''/,
  'The size toggle must reset a manual drag height')
assert.match(source, /!showRightPane && recommendation && \(/,
  'The result pane reopen control should appear only when a result exists')
assert.match(source, /className="absolute right-3 top-3 z-10 inline-flex/,
  'The result pane close button must work on mobile')

console.log('Builder prompt layout tests passed')
