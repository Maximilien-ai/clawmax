const CHAT_COMPOSER_EXPANDED_KEY = 'clawmax.chat.composerExpanded'

type ComposerStorage = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): ComposerStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readChatComposerExpanded(storage: ComposerStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(CHAT_COMPOSER_EXPANDED_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveChatComposerExpanded(expanded: boolean, storage: ComposerStorage | null = browserStorage()): void {
  try {
    storage?.setItem(CHAT_COMPOSER_EXPANDED_KEY, String(expanded))
  } catch {
    // Browser storage can be disabled; the current panel still responds to the click.
  }
}
