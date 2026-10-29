import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageActions } from './MessageActions'

vi.mock('@/lib/hooks/use-notes', () => ({
  useCreateNote: () => ({ mutate: vi.fn(), isPending: false }),
}))

describe('MessageActions', () => {
  it('labels the aside action visibly and keeps its accessible name', () => {
    const onOpenAside = vi.fn()
    render(<MessageActions content="Answer" onOpenAside={onOpenAside} />)

    const button = screen.getByRole('button', { name: 'learningAsides.open' })
    expect(button).toHaveTextContent('learningAsides.goDeeper')
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
