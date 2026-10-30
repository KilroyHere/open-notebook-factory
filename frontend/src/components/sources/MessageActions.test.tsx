import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageActions } from './MessageActions'

vi.mock('@/lib/hooks/use-notes', () => ({
  useCreateNote: () => ({ mutate: vi.fn(), isPending: false }),
}))

describe('MessageActions', () => {
  it('names the aside action by its visible label', () => {
    const onOpenAside = vi.fn()
    render(<MessageActions content="Answer" onOpenAside={onOpenAside} />)

    // WCAG 2.5.3 label in name: the accessible name is the visible text.
    const button = screen.getByRole('button', {
      name: 'learningAsides.goDeeper',
    })
    expect(button).not.toHaveAttribute('aria-label')
    fireEvent.click(button)
    expect(onOpenAside).toHaveBeenCalledOnce()
  })

  it('omits the aside action when asides are unavailable', () => {
    render(<MessageActions content="Answer" />)
    expect(
      screen.queryByText('learningAsides.goDeeper')
    ).not.toBeInTheDocument()
  })
})
