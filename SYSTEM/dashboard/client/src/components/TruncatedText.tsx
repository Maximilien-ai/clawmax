import React, { useEffect, useRef, useState } from 'react'

export default function TruncatedText({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const update = () => {
      if (!element) return
      setIsTruncated(element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight)
    }

    update()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text])

  return (
    <span
      ref={ref}
      className={className}
      title={isTruncated ? text : undefined}
    >
      {text}
    </span>
  )
}
