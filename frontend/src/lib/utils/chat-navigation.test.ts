import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatMessageDomId, focusChatMessage } from './chat-navigation'

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
})
