interface ClipboardEnvironment {
  clipboard?: { writeText(text: string): Promise<void> }
  document?: Pick<Document, 'createElement' | 'execCommand' | 'body'>
}

/**
 * Copy text, or reject so the caller can say it failed. The async Clipboard API exists only in a
 * secure context, and a dashboard opened over plain HTTP on another host has none; the older
 * selection-based copy still works there.
 */
export async function copyText(
  text: string,
  env: ClipboardEnvironment = { clipboard: globalThis.navigator?.clipboard, document: globalThis.document },
): Promise<void> {
  if (env.clipboard) {
    try {
      await env.clipboard.writeText(text)
      return
    } catch {
      // Permission denied or no focus: try the selection-based copy below.
    }
  }
  const doc = env.document
  if (!doc?.body) throw new Error('Clipboard access is not available')
  const textarea = doc.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  doc.body.appendChild(textarea)
  try {
    textarea.select()
    if (!doc.execCommand('copy')) throw new Error('Clipboard access was denied')
  } finally {
    textarea.remove()
  }
}
