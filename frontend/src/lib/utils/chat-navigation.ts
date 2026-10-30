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

/** The chat's message list scroller (a Radix ScrollArea viewport). */
export const CHAT_SCROLLER_SELECTOR = '[data-slot="scroll-area-viewport"]'

// Scroll only the chat's own scroller. element.scrollIntoView() also scrolls
// every ancestor, including the ScrollArea root that merely clips, which
// shifts the whole list and leaves an empty band under it.
function scrollChatTo(scroller: HTMLElement, top: number): void {
  if (typeof scroller.scrollTo === 'function') {
    scroller.scrollTo({ top, behavior: 'smooth' })
  } else {
    scroller.scrollTop = top
  }
}

/** Scroll the chat to `end` (the sentinel after the last message). */
export function scrollChatToEnd(end: HTMLElement): void {
  const scroller = end.closest<HTMLElement>(CHAT_SCROLLER_SELECTOR)
  if (!scroller) {
    end.scrollIntoView?.({ behavior: 'smooth' })
    return
  }
  scrollChatTo(scroller, scroller.scrollHeight)
}

export function focusChatMessage(messageId: string): boolean {
  if (typeof document === 'undefined') return false
  const domId = chatMessageDomId(messageId)
  const element = document.getElementById(domId)
  if (!element) return false

  window.history.replaceState(null, '', `#${domId}`)
  const scroller = element.closest<HTMLElement>(CHAT_SCROLLER_SELECTOR)
  if (scroller) {
    const view = scroller.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    scrollChatTo(
      scroller,
      scroller.scrollTop + box.top - view.top - (view.height - box.height) / 2
    )
  } else {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  element.focus({ preventScroll: true })
  element.classList.add('ring-2', 'ring-teal', 'ring-offset-2')
  window.setTimeout(() => {
    element.classList.remove('ring-2', 'ring-teal', 'ring-offset-2')
  }, 1800)
  return true
}

const INLINE_DIVE_PREFIX = 'inline-dive-'

/** DOM id of a dive's thread inside the main chat. */
export function inlineDiveDomId(asideId: string): string {
  return `${INLINE_DIVE_PREFIX}${encodeURIComponent(asideId)}`
}

const REVEAL_MARGIN_PX = 24

/**
 * Scroll the chat's own scroller so `element` shows: its top near the top
 * of the list (`start`), or only as far as needed to bring it into view
 * (`nearest`), never pushing its top out of view. Other scrollable
 * ancestors stay where they are.
 */
export function revealInChat(
  element: HTMLElement,
  block: 'start' | 'nearest' = 'nearest'
): void {
  const scroller = element.closest<HTMLElement>(CHAT_SCROLLER_SELECTOR)
  if (!scroller) {
    element.scrollIntoView?.({ behavior: 'smooth', block })
    return
  }
  const view = scroller.getBoundingClientRect()
  const box = element.getBoundingClientRect()
  const aboveBy = box.top - view.top - REVEAL_MARGIN_PX
  const belowBy = box.bottom - view.bottom + REVEAL_MARGIN_PX
  let delta = 0
  if (block === 'start' || aboveBy < 0) delta = aboveBy
  else if (belowBy > 0) delta = Math.min(belowBy, aboveBy)
  if (Math.abs(delta) < 1) return
  scrollChatTo(scroller, scroller.scrollTop + delta)
}
