import assert from 'assert'
import { CHAT_FOLLOW_THRESHOLD_PX, nextChatFollowState } from './agentChatScroll'

// A 1000px conversation in a 400px viewport: the end is at scrollTop 600.
const at = (scrollTop: number) => ({ scrollTop, scrollHeight: 1000, clientHeight: 400 })
const cases: Array<[string, boolean, number, ReturnType<typeof at>, boolean]> = [
  ['scrolling up while following stops following', true, 600, at(400), false],
  // While a reply streams, deltas land every ~80 ms; a reader who starts scrolling up near the end
  // must not be snapped back by the next one, however small the first step.
  ['scrolling up even a little stops following', true, 600, at(560), false],
  ['scrolling down to near the end resumes following', false, 400, at(600 - CHAT_FOLLOW_THRESHOLD_PX + 1), true],
  ['reaching the end resumes following', false, 300, at(600), true],
  ['ending within the threshold resumes following', false, 300, at(600 - CHAT_FOLLOW_THRESHOLD_PX), true],
  ['scrolling down but not to the end keeps reading', false, 200, at(300), false],
  ['a programmatic scroll toward the end never stops following', true, 100, at(300), true],
  ['scrolling up while reading keeps reading', false, 300, at(200), false],
]
for (const [name, following, previousScrollTop, metrics, expected] of cases) {
  assert.strictEqual(nextChatFollowState(following, previousScrollTop, metrics), expected, name)
}

// Content shrinking under the reader (a streamed bubble replaced by its shorter final text) makes the
// browser clamp scrollTop downwards. That is not the reader scrolling up.
assert.strictEqual(nextChatFollowState(true, 600, { scrollTop: 450, scrollHeight: 850, clientHeight: 400 }), true, 'A clamp at the end keeps following')
// A conversation shorter than its viewport is always at its end.
assert.strictEqual(nextChatFollowState(false, 0, { scrollTop: 0, scrollHeight: 300, clientHeight: 400 }), true, 'Nothing to scroll is at the end')

console.log(`agentChatScroll.test.ts: ${cases.length + 2} tests passed`)
