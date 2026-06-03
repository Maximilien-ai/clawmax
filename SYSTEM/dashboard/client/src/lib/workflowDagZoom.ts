export function getWorkflowDagScaledCanvasStyle(zoom: number, contentWidth?: number, contentHeight?: number) {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const width = typeof contentWidth === 'number' && contentWidth > 0
    ? `${Math.ceil(contentWidth * safeZoom)}px`
    : (safeZoom < 1 ? `${100 / safeZoom}%` : undefined)
  const height = typeof contentHeight === 'number' && contentHeight > 0
    ? `${Math.ceil(contentHeight * safeZoom)}px`
    : undefined

  return {
    outer: {
      width,
      height,
      minWidth: safeZoom < 1 ? `${100 / safeZoom}%` : 'max-content',
      minHeight: height,
    },
    inner: {
      transform: `scale(${safeZoom})`,
      transformOrigin: 'top left',
      width: typeof contentWidth === 'number' && contentWidth > 0 ? `${Math.ceil(contentWidth)}px` : undefined,
      height: typeof contentHeight === 'number' && contentHeight > 0 ? `${Math.ceil(contentHeight)}px` : undefined,
    },
  }
}
