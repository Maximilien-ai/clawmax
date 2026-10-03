import assert from 'assert'
import { isMemoryIndexPausedNotice, splitTrailingSystemNotice } from './AgentChatPanel'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'

// The exact wording a real reply carried (see issue #197): OpenClaw's memory-core tool tells the
// model "Tell the user: memory search is paused..." as a tool result, and the model relays it
// verbatim as a trailing paragraph of otherwise-unrelated prose.
const REAL_ANSWER = `**Bottom line:** the best realistically available price today is roughly $4,000 — either an ASUS/PNY GB10 at $3,999, or waiting for the Spark itself to dip back toward ~$3,950 on Amazon.

Want me to set up a recurring price watch and ping you when the Spark drops below a threshold (e.g., $4,000)?`

const NOTICE = 'One housekeeping note: my memory search is currently paused (index built with a different embedding model) — worth running `openclaw memory index --force` when convenient so I can recall prior research threads properly.'

const leaked = `${REAL_ANSWER}\n\n${NOTICE}`
const { text, notice } = splitTrailingSystemNotice(leaked)
assert.strictEqual(text, REAL_ANSWER, 'the real answer should be left exactly as the model wrote it')
assert.strictEqual(notice, NOTICE, 'the notice should be extracted verbatim, not summarized or altered')
assert(!text.includes('housekeeping'), 'the notice must not remain inside the conversational text')

// A different, plausible paraphrase of OpenClaw's own action string — detection must not depend on
// this exact wording matching the one example above.
const paraphrased = `Sure, here's what I found.\n\nBy the way, memory search is paused right now — the index needs a rebuild. Run openclaw memory status to check, or openclaw memory index --force to fix it.`
const { text: paraphrasedText, notice: paraphrasedNotice } = splitTrailingSystemNotice(paraphrased)
assert(paraphrasedNotice, 'a differently-worded paused-index notice should still be detected')
assert(!paraphrasedText.includes('index needs a rebuild'), 'the paraphrased notice should be removed from the visible text too')

// A message with no notice at all must come back completely unchanged.
const plain = 'The ball costs 5 cents.'
const { text: plainText, notice: plainNotice } = splitTrailingSystemNotice(plain)
assert.strictEqual(plainText, plain, 'ordinary replies must pass through untouched')
assert.strictEqual(plainNotice, undefined, 'ordinary replies must never report a notice')

// A real reply that happens to be *about* memory or indexes, with no OpenClaw operator command in
// it, must not be mistaken for the leak — over-matching would silently eat real answers.
const aboutMemory = 'Your laptop has 32GB of memory and a 1TB SSD index of installed packages.'
assert(!isMemoryIndexPausedNotice(aboutMemory), 'a normal sentence mentioning memory/index must not be flagged')

// Empty and undefined-ish input must not throw.
assert.deepStrictEqual(splitTrailingSystemNotice(''), { text: '' }, 'empty content should pass through untouched')


function AssistantBubble({ content }: { content: string }) {
  const { text: bubbleText, notice: systemNotice } = splitTrailingSystemNotice(content)
  return (
    <div>
      <div className="answer"><ReactMarkdown>{bubbleText}</ReactMarkdown></div>
      {systemNotice && (
        <div className="system-notice" title="A note from the agent's tooling, not part of its answer">
          <span>{systemNotice}</span>
        </div>
      )}
    </div>
  )
}

const rendered = renderToStaticMarkup(<AssistantBubble content={leaked} />)
assert(rendered.includes('class="system-notice"'), 'the notice must render in its own labeled element')
assert(rendered.includes('housekeeping'), 'the notice text itself must still reach the DOM somewhere')
const answerHtml = rendered.slice(0, rendered.indexOf('class="system-notice"'))
assert(!answerHtml.includes('housekeeping'), 'the notice must not appear inside the answer element')
assert(answerHtml.includes('$4,000') && answerHtml.includes('$3,999'), 'the real answer content must still render normally')

const plainRendered = renderToStaticMarkup(<AssistantBubble content={plain} />)
assert(!plainRendered.includes('system-notice'), 'an ordinary reply must never grow a notice element')

console.log('AgentChatPanel.test.tsx: 14 assertions passed')
