import { getWorkflowDagScaledCanvasStyle } from './workflowDagZoom'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('workflow dag scaled canvas grows layout dimensions when zooming in', () => {
  const styles = getWorkflowDagScaledCanvasStyle(1.3, 1200, 800)
  assert(styles.outer.width === '1560px', `Expected outer width to scale with zoom, got ${styles.outer.width}`)
  assert(styles.outer.height === '1040px', `Expected outer height to scale with zoom, got ${styles.outer.height}`)
  assert(styles.inner.transform === 'scale(1.3)', `Expected scaled transform, got ${styles.inner.transform}`)
})

test('workflow dag scaled canvas preserves zoom-out min width fallback', () => {
  const styles = getWorkflowDagScaledCanvasStyle(0.5)
  assert(styles.outer.minWidth === '200%', `Expected zoom-out min width fallback, got ${styles.outer.minWidth}`)
})

console.log('workflowDagZoom.test.ts: ok')
