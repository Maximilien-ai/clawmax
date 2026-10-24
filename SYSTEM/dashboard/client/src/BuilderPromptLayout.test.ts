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
assert.match(source, /\{\(showRightPane \|\| recommendation\) && \(/,
  'The result pane toggle should appear only when a result exists or the pane is open')
assert.match(source, /aria-expanded=\{showRightPane\}\s+aria-controls="builder-side-panel"/,
  'The result pane toggle must report its state and name the pane it controls')
assert.doesNotMatch(source, /absolute -left-3|lg:-left-3/,
  'The result pane toggle must stay in the page flow so it works on mobile and is never clipped by the pane')
assert.match(source, /min-w-\[min\(100%,16rem\)\] flex-1/,
  'The title column needs a minimum width so the recommendation badges wrap instead of covering the pane toggle')

console.log('Builder prompt layout tests passed')
