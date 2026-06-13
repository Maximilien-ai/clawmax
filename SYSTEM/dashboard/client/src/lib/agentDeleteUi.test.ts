import {
  AGENT_DELETE_MODAL_LAYER,
  BULK_OPERATIONS_MODAL_LAYER,
  shouldEnableBulkDelete,
  shouldShowAgentDetailDeleteAction,
} from './agentDeleteUi'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

test('detail delete action is shown when delete handler is provided', () => {
  assert(shouldShowAgentDetailDeleteAction(() => {}) === true, 'expected detail delete action to be enabled')
})

test('detail delete action is hidden when delete handler is missing', () => {
  assert(shouldShowAgentDetailDeleteAction(undefined) === false, 'expected detail delete action to be hidden')
})

test('bulk delete is enabled when delete handler is provided', () => {
  assert(shouldEnableBulkDelete(async () => {}) === true, 'expected bulk delete to be enabled')
})

test('delete overlays stay above the agent detail panel layer', () => {
  assert(AGENT_DELETE_MODAL_LAYER === 'z-[70]', 'expected delete modal layer to remain above detail panel')
  assert(BULK_OPERATIONS_MODAL_LAYER === 'z-[60]', 'expected bulk operations layer to remain above page overlays')
})
