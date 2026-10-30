import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ScrollArea } from './scroll-area'

describe('ScrollArea', () => {
  it('undoes a scroll of its clipping root so the viewport cannot shift', () => {
    const onScroll = vi.fn()
    const { container } = render(
      <ScrollArea className="h-40 overflow-hidden" onScroll={onScroll}>
        <p>content</p>
      </ScrollArea>
    )
    const root = container.querySelector<HTMLElement>('[data-slot="scroll-area"]')!
    root.scrollTop = 267
    root.scrollLeft = 12

    fireEvent.scroll(root)

    expect(root.scrollTop).toBe(0)
    expect(root.scrollLeft).toBe(0)
    expect(onScroll).toHaveBeenCalledTimes(1)
  })

  it('leaves the viewport scroll alone', () => {
    const { container } = render(
      <ScrollArea className="h-40 overflow-hidden">
        <p>content</p>
      </ScrollArea>
    )
    const viewport = container.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    )!
    viewport.scrollTop = 300

    fireEvent.scroll(viewport)

    expect(viewport.scrollTop).toBe(300)
  })
})
