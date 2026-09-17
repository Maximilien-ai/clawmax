import { lexer, type Token, type Tokens } from 'marked'

type PdfNode = Record<string, unknown>
export type ImageLoader = (path: string) => Promise<string | null>

export function pdfFileName(path: string): string {
  return (path.split('/').pop() || 'document.md').replace(/\.md$/i, '') + '.pdf'
}

export function markdownBody(source: string): string {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim()
}

// Never fetch arbitrary URLs, including same-origin API URLs embedded in a document.
export function workspaceImagePath(documentPath: string, href: string): string | null {
  if (!href || /^(?:[a-z][\w+.-]*:|\/|\\)/i.test(href) || /[?#\\]/.test(href)) return null
  const parts = documentPath.split('/').slice(0, -1)
  for (const part of href.split('/')) {
    if (part === '..') { if (parts.length <= 1) return null; parts.pop() }
    else if (part && part !== '.') parts.push(part)
  }
  const path = parts.join('/')
  return /\.(png|jpe?g)$/i.test(path) ? path : null
}

const embeddedImage = (value: string) => value.length <= 7_000_000 && /^data:image\/(?:png|jpeg);base64,[a-z0-9+/=\s]+$/i.test(value)
const safeLink = (value: string) => /^(?:https?:|mailto:)/i.test(value) ? value : undefined

export async function buildMarkdownPdf(source: string, path: string, loadImage?: ImageLoader) {
  if (source.length > 2_000_000) throw new Error('This document is too large for PDF preview. Download Markdown instead.')
  const warnings = new Set<string>()
  const tokens = lexer(markdownBody(source), { gfm: true })
  let imageCount = 0
  function inline(items: Token[]): PdfNode[] {
    return items.flatMap((token): PdfNode[] => {
      switch (token.type) {
        case 'strong': return [{ text: inline(token.tokens || []), bold: true }]
        case 'em': return [{ text: inline(token.tokens || []), italics: true }]
        case 'del': return [{ text: inline(token.tokens || []), decoration: 'lineThrough' }]
        case 'link': return [{ text: inline(token.tokens || []), link: safeLink(token.href), color: '#0369a1' }]
        case 'codespan': return [{ text: token.text, background: '#f1f5f9' }]
        case 'br': return [{ text: '\n' }]
        case 'html': warnings.add('Raw HTML is omitted from PDF output.'); return []
        case 'image': warnings.add('Inline images are represented by their description.'); return [{ text: `[Image: ${token.text || 'image'}]` }]
        default: return [{ text: ('text' in token && token.text) || token.raw || '' }]
      }
    })
  }
  async function image(token: Tokens.Image): Promise<PdfNode> {
    let data: string | null = null
    if (++imageCount <= 20) {
      if (embeddedImage(token.href)) data = token.href
      else {
        const target = workspaceImagePath(path, token.href)
        if (target && loadImage) { try { data = await loadImage(target) } catch { /* readable fallback below */ } }
      }
    }
    if (data && embeddedImage(data)) return { image: data, fit: [499, 600], margin: [0, 8, 0, 8] }
    warnings.add('Some images were omitted. PDF supports embedded or workspace-relative PNG/JPEG images (up to 20, 5 MB each); external images are not fetched.')
    return { text: `[Image unavailable: ${token.text || 'image'}]`, italics: true, color: '#475569', margin: [0, 6, 0, 6] }
  }
  async function blocks(items: Token[]): Promise<PdfNode[]> {
    const result: PdfNode[] = []
    for (const token of items) {
      switch (token.type) {
        case 'space': case 'def': break
        case 'html': warnings.add('Raw HTML is omitted from PDF output.'); break
        case 'heading': result.push({ text: inline(token.tokens || []), fontSize: [24, 20, 16, 14, 12, 11][token.depth - 1], bold: true, margin: [0, 12, 0, 6], headlineLevel: token.depth }); break
        case 'code': result.push({ text: token.text || ' ', fontSize: 9, background: '#f1f5f9', preserveLeadingSpaces: true, margin: [0, 6, 0, 10] }); break
        case 'blockquote': result.push({ stack: await blocks(token.tokens || []), margin: [14, 4, 0, 8], color: '#475569', italics: true }); break
        case 'hr': result.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 499, y2: 0, lineWidth: 0.5, lineColor: '#cbd5e1' }], margin: [0, 10, 0, 10] }); break
        case 'list': {
          const list = token as Tokens.List
          const children = await Promise.all(list.items.map(async item => ({ stack: [
            ...(item.task ? [{ text: item.checked ? '[x]' : '[ ]' }] : []),
            ...await blocks(item.tokens),
          ] })))
          result.push({ [list.ordered ? 'ol' : 'ul']: children, ...(list.ordered ? { start: list.start || 1 } : {}), margin: [0, 4, 0, 8] }); break
        }
        case 'table': {
          const table = token as Tokens.Table
          const cell = (entry: Tokens.TableCell, i: number, header = false) => ({ text: inline(entry.tokens), bold: header, alignment: table.align[i] || 'left', fillColor: header ? '#e2e8f0' : undefined })
          result.push({ table: { headerRows: 1, widths: table.header.map(() => '*'), body: [table.header.map((c, i) => cell(c, i, true)), ...table.rows.map(row => row.map((c, i) => cell(c, i)))] }, layout: 'lightHorizontalLines', margin: [0, 6, 0, 10], fontSize: 9 }); break
        }
        default: {
          const children = ('tokens' in token && token.tokens) || [token]
          // Block images retain pagination and aspect ratio. Mixed inline images use alt text.
          if (children.length === 1 && children[0].type === 'image') result.push(await image(children[0] as Tokens.Image))
          else result.push({ text: inline(children), margin: [0, 0, 0, 8] })
        }
      }
    }
    return result
  }
  const content = await blocks(tokens)
  return {
    warnings: [...warnings],
    definition: {
      info: { title: path.split('/').pop() || 'Document' },
      pageSize: 'A4', pageMargins: [48, 48, 48, 48],
      defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.25, color: '#0f172a' },
      pageBreakBefore: (node: { headlineLevel?: number }, container: { getFollowingNodesOnPage(): unknown[]; getNodesOnNextPage(): unknown[] }) =>
        !!node.headlineLevel && container.getFollowingNodesOnPage().length === 0 && container.getNodesOnNextPage().length > 0,
      content: content.length ? content : [{ text: '(Empty document)', italics: true }],
      footer: (page: number, pages: number) => ({ text: `${page} / ${pages}`, alignment: 'center', fontSize: 9, color: '#64748b', margin: [0, 16, 0, 0] }),
    },
  }
}

export async function renderMarkdownPdf(source: string, path: string): Promise<{ blob: Blob; warnings: string[] }> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
  pdfMake.addVirtualFileSystem(fonts)
  pdfMake.setUrlAccessPolicy(() => false)
  const { definition, warnings } = await buildMarkdownPdf(source, path, async target => {
    const response = await fetch(`/api/docs/content?path=${encodeURIComponent(target)}`, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return null
    const body = await response.json()
    return body.kind === 'image' && typeof body.dataUrl === 'string' ? body.dataUrl : null
  })
  return { blob: await pdfMake.createPdf(definition).getBlob(), warnings }
}
