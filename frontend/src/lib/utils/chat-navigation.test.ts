import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chatMessageDomId,
  focusChatMessage,
  inlineDiveDomId,
  messageIdFromChatHash,
  revealInChat,
  scrollChatToEnd,
} from './chat-navigation'

describe('chat navigation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    window.history.replaceState(null, '', '/notebooks/notebook%3Aone')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('scrolls to and highlights a stable message anchor', () => {
    const message = document.createElement('div')
    message.id = chatMessageDomId('ai:answer/one')
    message.tabIndex = -1
    document.body.appendChild(message)

    expect(focusChatMessage('ai:answer/one')).toBe(true)
    expect(message.scrollIntoView).toHaveBeenCalled()
    expect(message.className).toContain('ring-teal')
    expect(window.location.hash).toBe('#chat-message-ai%3Aanswer%2Fone')

    vi.advanceTimersByTime(1800)
    expect(message.className).not.toContain('ring-teal')
    message.remove()
  })

  it('returns false when the message is unavailable', () => {
    expect(focusChatMessage('missing')).toBe(false)
  })

  it('reads a message id back from its anchor hash', () => {
    const messageId = 'ai:answer/one'
    expect(messageIdFromChatHash(`#${chatMessageDomId(messageId)}`)).toBe(
      messageId
    )
    expect(messageIdFromChatHash(chatMessageDomId(messageId))).toBe(messageId)
    expect(messageIdFromChatHash('#session')).toBeNull()
    expect(messageIdFromChatHash('#chat-message-')).toBeNull()
    expect(messageIdFromChatHash('#chat-message-%')).toBeNull()
  })
})

describe('revealInChat', () => {
  function chatWith(box: { top: number; bottom: number }) {
    const scroller = document.createElement('div')
    scroller.dataset.slot = 'scroll-area-viewport'
    scroller.getBoundingClientRect = () => ({ top: 100, bottom: 700 }) as DOMRect
    scroller.scrollTo = vi.fn()
    Object.defineProperty(scroller, 'scrollTop', { value: 1000, writable: true })
    const element = document.createElement('div')
    element.id = inlineDiveDomId('learning_aside:one')
    element.getBoundingClientRect = () => box as DOMRect
    scroller.appendChild(element)
    document.body.appendChild(scroller)
    return { scroller, element }
  }

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('brings a thread near the top of the chat without scrolling the page', () => {
    const { scroller, element } = chatWith({ top: 400, bottom: 500 })
    window.HTMLElement.prototype.scrollIntoView = vi.fn()

    revealInChat(element, 'start')

    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 1000 + 400 - 100 - 24,
      behavior: 'smooth',
    })
    expect(element.scrollIntoView).not.toHaveBeenCalled()
  })

  it('scrolls only as far as needed, keeping a tall thread\'s top in view', () => {
    const visible = chatWith({ top: 300, bottom: 400 })
    revealInChat(visible.element, 'nearest')
    expect(visible.scroller.scrollTo).not.toHaveBeenCalled()

    document.body.innerHTML = ''
    const below = chatWith({ top: 650, bottom: 760 })
    revealInChat(below.element, 'nearest')
    expect(below.scroller.scrollTo).toHaveBeenCalledWith({
      top: 1000 + 760 - 700 + 24,
      behavior: 'smooth',
    })

    document.body.innerHTML = ''
    const tall = chatWith({ top: 650, bottom: 2000 })
    revealInChat(tall.element, 'nearest')
    expect(tall.scroller.scrollTo).toHaveBeenCalledWith({
      top: 1000 + 650 - 100 - 24,
      behavior: 'smooth',
    })
  })

  it('names inline threads by their encoded aside id', () => {
    expect(inlineDiveDomId('learning_aside:a b')).toBe(
      'inline-dive-learning_aside%3Aa%20b'
    )
  })
})


describe('scrolling inside the chat only', () => {
  function scrollerWith(child: HTMLElement) {
    const scroller = document.createElement('div')
    scroller.dataset.slot = 'scroll-area-viewport'
    scroller.getBoundingClientRect = () => ({ top: 100, height: 600 }) as DOMRect
    scroller.scrollTo = vi.fn()
    Object.defineProperty(scroller, 'scrollTop', { value: 1000, writable: true })
    Object.defineProperty(scroller, 'scrollHeight', { value: 5000 })
    scroller.appendChild(child)
    document.body.appendChild(scroller)
    return scroller
  }

  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('centres a focused message by scrolling the chat, not its ancestors', () => {
    const message = document.createElement('div')
    message.id = chatMessageDomId('ai:centre')
    message.getBoundingClientRect = () => ({ top: 500, height: 100 }) as DOMRect
    const scroller = scrollerWith(message)

    expect(focusChatMessage('ai:centre')).toBe(true)

    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 1000 + 500 - 100 - (600 - 100) / 2,
      behavior: 'smooth',
    })
    expect(message.scrollIntoView).not.toHaveBeenCalled()
  })

  it('scrolls the chat to its end without scrollIntoView', () => {
    const end = document.createElement('div')
    const scroller = scrollerWith(end)

    scrollChatToEnd(end)

    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 5000, behavior: 'smooth' })
    expect(end.scrollIntoView).not.toHaveBeenCalled()
  })

  it('falls back to scrollIntoView outside a chat scroller', () => {
    const end = document.createElement('div')
    document.body.appendChild(end)

    scrollChatToEnd(end)

    expect(end.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' })
  })
})
