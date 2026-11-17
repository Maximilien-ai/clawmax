// Presentation only: opaque provider references cannot become links without a source map.
export function presentCitationMarkers(value: string): string {
  return value.replace(/\uE200cite\uE202[^\uE200\uE201\r\n]+\uE201/g, '[Source reference unavailable]')
}
type Tree = { type: string; value?: string; children?: Tree[] }
export function remarkCitationPresentation() {
  return (tree: Tree) => {
    const visit = (node: Tree) => {
      if (node.type === 'code' || node.type === 'inlineCode') return
      if (node.type === 'text' && node.value) node.value = presentCitationMarkers(node.value)
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}
