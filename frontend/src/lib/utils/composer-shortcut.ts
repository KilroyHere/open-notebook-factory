// Shared send shortcut for chat composers: Cmd+Enter on macOS, Ctrl+Enter
// elsewhere. Plain Enter keeps inserting a newline in multi-line answers.

function isMacPlatform(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
  )
}

export function isSendShortcut(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  nativeEvent?: { isComposing?: boolean }
}): boolean {
  if (event.key !== 'Enter' || event.nativeEvent?.isComposing) return false
  return isMacPlatform() ? event.metaKey : event.ctrlKey
}

export function sendShortcutHint(): string {
  return isMacPlatform() ? '⌘+Enter' : 'Ctrl+Enter'
}
