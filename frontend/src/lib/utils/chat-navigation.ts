export function chatMessageDomId(messageId: string): string {
  return `chat-message-${encodeURIComponent(messageId)}`
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
