// Read the actual rendered foreground and composited ancestor backgrounds.
export async function textContrast(locator) {
  return locator.evaluate(element => {
    const rgba = value => value.match(/[\d.]+/g).map(Number)
    const over = (foreground, background) => {
      const alpha = foreground[3] ?? 1
      return foreground.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha))
    }
    const ancestors = []
    for (let node = element; node; node = node.parentElement) ancestors.push(node)
    let background = [255, 255, 255]
    for (const node of ancestors.reverse()) background = over(rgba(getComputedStyle(node).backgroundColor), background)
    const foreground = over(rgba(getComputedStyle(element).color), background)
    const luminance = color => color.map(channel => {
      const c = channel / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
    const fg = luminance(foreground), bg = luminance(background)
    return { ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05), foreground, background }
  })
}
