const CHAT_MESSAGE_HASH_PREFIX = 'chat-message-'

export function chatMessageDomId(messageId: string): string {
  return `${CHAT_MESSAGE_HASH_PREFIX}${encodeURIComponent(messageId)}`
}

export function messageIdFromChatHash(hash: string): string | null {
  const value = hash.startsWith('#') ? hash.slice(1) : hash
  if (!value.startsWith(CHAT_MESSAGE_HASH_PREFIX)) return null
  const encodedId = value.slice(CHAT_MESSAGE_HASH_PREFIX.length)
  if (!encodedId) return null
  try {
    return decodeURIComponent(encodedId)
  } catch {
    return null
  }
}

export function focusChatMessage(messageId: string): boolean {
  if (typeof document === 'undefined') return false
  const domId = chatMessageDomId(messageId)
  const element = document.getElementById(domId)
  if (!element) return false

  window.history.replaceState(null, '', `#${domId}`)
  element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  element.focus({ preventScroll: true })
  element.classList.add('ring-2', 'ring-teal', 'ring-offset-2')
  window.setTimeout(() => {
    element.classList.remove('ring-2', 'ring-teal', 'ring-offset-2')
  }, 1800)
  return true
}
