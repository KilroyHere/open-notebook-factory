import type { ComponentProps } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AsideTranscript } from './AsideTranscript'
import type { LearningAside } from '@/lib/types/api'

const created = '2026-10-29T00:00:00Z'

const earlier: LearningAside['messages'] = [
  { id: 'human:1', type: 'human', content: 'Why does Jensen apply?' },
  { id: 'ai:1', type: 'ai', content: 'The logarithm is concave.' },
]
const question = { id: 'human:2', type: 'human' as const, content: 'Why concave?' }
const reply = { id: 'ai:2', type: 'ai' as const, content: 'Its second derivative is negative.' }

const dive: LearningAside = {
  id: 'learning_aside:one',
  journey_id: 'learning_journey:one',
  parent_session_id: 'chat_session:main',
  chat_session_id: 'chat_session:one',
  title: 'Why Jensen applies',
  status: 'active',
  anchor: { type: 'message', message_id: 'ai:origin', content: 'Origin answer' },
  messages: earlier,
  updates: [],
  created,
  updated: created,
}

interface Box {
  top: number
  bottom: number
}

/**
 * Where things are on screen, in viewport pixels: the chat's scroller, the
 * transcript and its entries (found by their text).
 */
let layout: { view: Box; transcript: Box; entries: Record<string, Box> }

function rect({ top, bottom }: Box): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 400,
    width: 400,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }
}

type Props = Partial<ComponentProps<typeof AsideTranscript>>

function Transcript(props: Props) {
  return (
    <div data-slot="scroll-area-viewport">
      <AsideTranscript
        aside={dive}
        isAsideLoading={false}
        isSending={false}
        onSendMessage={vi.fn()}
        {...props}
      />
    </div>
  )
}

function renderTranscript() {
  const view = render(<Transcript />)
  const scroller = view.container.querySelector<HTMLElement>(
    '[data-slot="scroll-area-viewport"]'
  )!
  scroller.scrollTo = vi.fn()
  // Deep in a long chat.
  Object.defineProperty(scroller, 'scrollTop', { value: 1000, writable: true })
  return { ...view, scroller }
}

const sending: Props = { isSending: true, pendingMessage: question.content }
const answered: Props = { aside: { ...dive, messages: [...earlier, question, reply] } }

describe('AsideTranscript following a new reply', () => {
  beforeEach(() => {
    // The learner sent from the bottom of the chat: the question just
    // above the fold, "Processing…" right at it.
    layout = {
      view: { top: 0, bottom: 600 },
      transcript: { top: 100, bottom: 610 },
      entries: {
        [question.content]: { top: 480, bottom: 540 },
        'common.processing': { top: 556, bottom: 610 },
        [reply.content]: { top: 556, bottom: 900 },
      },
    }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.matches('[data-slot="scroll-area-viewport"]')) return rect(layout.view)
        if (this.hasAttribute('data-dive-transcript')) return rect(layout.transcript)
        const box = layout.entries[this.textContent?.trim() ?? '']
        return rect(box ?? { top: 0, bottom: 0 })
      }
    )
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the question on its way, then the reply', () => {
    const { rerender, scroller } = renderTranscript()

    rerender(<Transcript {...sending} />)
    // "Processing…" sat 10px past the fold: just enough to show it.
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({
      top: 1034,
      behavior: 'smooth',
    })

    rerender(<Transcript {...answered} />)
    // The reply runs 300px past the fold: scroll just far enough to show
    // all of it (a taller one stops with its start near the top).
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({
      top: 1324,
      behavior: 'smooth',
    })
    expect(scroller.scrollTo).toHaveBeenCalledTimes(2)
  })

  it('also finds the reply when it lands before the question box clears', () => {
    const { rerender, scroller } = renderTranscript()
    rerender(<Transcript {...sending} />)

    // The reply's transcript can render while the question is still shown.
    rerender(<Transcript {...sending} {...answered} />)

    expect(scroller.scrollTo).toHaveBeenLastCalledWith({
      top: 1324,
      behavior: 'smooth',
    })
  })

  it('leaves a learner who scrolled away to read where they are', () => {
    const { rerender, scroller } = renderTranscript()
    rerender(<Transcript {...sending} />)
    vi.mocked(scroller.scrollTo).mockClear()

    // They scrolled up to an earlier part of the chat while it was answered.
    layout.entries[question.content] = { top: 1480, bottom: 1540 }
    layout.transcript = { top: 1100, bottom: 1610 }
    fireEvent.scroll(scroller)
    layout.entries[reply.content] = { top: 1556, bottom: 1900 }
    rerender(<Transcript {...answered} />)

    expect(scroller.scrollTo).not.toHaveBeenCalled()
  })

  it('does not move a view that was elsewhere when the question went out', () => {
    // A question asked for the learner (Dive in) while they read above.
    layout.entries[question.content] = { top: 1480, bottom: 1540 }
    layout.transcript = { top: 1100, bottom: 1610 }
    const { rerender, scroller } = renderTranscript()

    rerender(<Transcript {...sending} />)
    rerender(<Transcript {...answered} />)

    expect(scroller.scrollTo).not.toHaveBeenCalled()
  })

  it('follows a learner who scrolls back to the end before the reply comes', () => {
    layout.entries[question.content] = { top: 1480, bottom: 1540 }
    layout.transcript = { top: 1100, bottom: 1610 }
    const { rerender, scroller } = renderTranscript()
    rerender(<Transcript {...sending} />)

    layout.entries[question.content] = { top: 480, bottom: 540 }
    layout.transcript = { top: 100, bottom: 610 }
    fireEvent.scroll(scroller)
    rerender(<Transcript {...answered} />)

    expect(scroller.scrollTo).toHaveBeenLastCalledWith({
      top: 1324,
      behavior: 'smooth',
    })
  })

  it('counts having scrolled just past the end, to the question box, as following', () => {
    // The transcript ends 100px above the view: the box under it still shows.
    layout.view = { top: 0, bottom: 600 }
    layout.transcript = { top: -500, bottom: -100 }
    layout.entries[question.content] = { top: -180, bottom: -150 }
    layout.entries['common.processing'] = { top: -134, bottom: -110 }
    layout.entries[reply.content] = { top: -134, bottom: 200 }
    const { rerender, scroller } = renderTranscript()

    rerender(<Transcript {...sending} />)
    rerender(<Transcript {...answered} />)

    // Back up to the reply's start, with the usual margin.
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({
      top: 842,
      behavior: 'smooth',
    })
  })

  it('stays put when something else moved the dive out of view meanwhile', () => {
    const { rerender, scroller } = renderTranscript()
    rerender(<Transcript {...sending} />)
    vi.mocked(scroller.scrollTo).mockClear()

    // The learner unfolded something above it: no scroll, but the dive's
    // end now sits far below what they are reading.
    layout.entries[question.content] = { top: 1480, bottom: 1540 }
    layout.entries[reply.content] = { top: 1556, bottom: 1900 }
    rerender(<Transcript {...answered} />)

    expect(scroller.scrollTo).not.toHaveBeenCalled()
  })

  it('treats a transcript that is still loading as history, not a reply', () => {
    const { rerender, scroller } = renderTranscript()
    rerender(<Transcript isAsideLoading aside={{ ...dive, messages: [] }} {...sending} />)
    rerender(<Transcript {...answered} />)

    expect(scroller.scrollTo).not.toHaveBeenCalled()
  })
})
