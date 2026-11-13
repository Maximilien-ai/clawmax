import { useRef, type RefObject } from 'react'

export default function VerticalResizeHandle({ targetRef, controls, label, minHeight = 88 }: {
  targetRef: RefObject<HTMLElement | null>
  controls: string
  label: string
  minHeight?: number
}) {
  const dragRef = useRef<{ pointerId: number; startY: number; height: number } | null>(null)
  function resize(height: number) {
    const target = targetRef.current
    if (!target) return
    target.style.height = `${Math.max(minHeight, Math.min(Math.max(minHeight, window.innerHeight * 0.6), height))}px`
    target.style.flex = '0 0 auto'
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-controls={controls}
      aria-describedby={`${controls}-resize-hint`}
      title="Drag up or down. Arrow keys resize; Home resets."
      onPointerDown={(event) => {
        if (event.button !== 0 || !targetRef.current) return
        event.preventDefault()
        dragRef.current = { pointerId: event.pointerId, startY: event.clientY, height: targetRef.current.getBoundingClientRect().height }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (drag?.pointerId === event.pointerId) resize(drag.height + event.clientY - drag.startY)
      }}
      onPointerUp={() => { dragRef.current = null }}
      onPointerCancel={() => { dragRef.current = null }}
      onLostPointerCapture={() => { dragRef.current = null }}
      onKeyDown={(event) => {
        const target = targetRef.current
        if (!target) return
        if (event.key === 'Home') {
          event.preventDefault()
          target.style.height = ''
          target.style.flex = ''
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          resize(target.getBoundingClientRect().height + (event.key === 'ArrowDown' ? 24 : -24))
        }
      }}
      className="group relative flex h-3 w-full shrink-0 touch-none select-none cursor-ns-resize items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 before:absolute before:inset-x-0 before:-inset-y-1.5"
    >
      <span className="absolute inset-x-0 h-px bg-sky-200 dark:bg-sky-900" aria-hidden="true" />
      <span className="relative h-1 w-10 rounded-full bg-sky-500 group-hover:bg-sky-600 dark:bg-sky-400 dark:group-hover:bg-sky-300" aria-hidden="true" />
      <span id={`${controls}-resize-hint`} className="sr-only">Drag up or down. Arrow keys resize; Home resets.</span>
    </button>
  )
}
