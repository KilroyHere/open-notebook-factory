import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReferencedMarkdown } from './ReferencedMarkdown'

describe('ReferencedMarkdown', () => {
  const content =
    'Scaled attention [source:paper] keeps gradients stable [note:n1] [source_insight:i1].'

  it('lists sources and notes by title and keeps the references clickable', () => {
    const onReferenceClick = vi.fn()
    const { container } = render(
      <ReferencedMarkdown
        content={content}
        onReferenceClick={onReferenceClick}
        referenceTitles={{
          'source:paper': 'Attention Is All You Need',
          'note:n1': 'Costs in $ and $',
        }}
      />
    )

    expect(screen.queryByText(/source:paper|note:n1|source_insight:i1/)).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Attention Is All You Need' })
    )
    expect(onReferenceClick).toHaveBeenLastCalledWith('source', 'paper')
    // A title is text, never math.
    expect(
      screen.getByRole('button', { name: 'Costs in $ and $' })
    ).toBeInTheDocument()
    expect(container.querySelector('.katex')).toBeNull()
    // Insights have no title here, so they get a numbered generic name.
    fireEvent.click(screen.getByRole('button', { name: 'common.insight 1' }))
    expect(onReferenceClick).toHaveBeenLastCalledWith('source_insight', 'i1')
    // The numbered citation in the text still opens its item.
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(onReferenceClick).toHaveBeenLastCalledWith('note', 'n1')
  })

  it('keeps its DOM when it renders again, so a selection in it survives', () => {
    const titles = { 'source:paper': 'Attention Is All You Need' }
    const { rerender } = render(
      <ReferencedMarkdown
        content={content}
        onReferenceClick={vi.fn()}
        referenceTitles={titles}
      />
    )
    const paragraph = screen.getByText(/Scaled attention/)
    const citation = screen.getByRole('button', { name: '1' })

    // A parent's re-render: a new handler and an equal titles object.
    const onReferenceClick = vi.fn()
    rerender(
      <ReferencedMarkdown
        content={content}
        onReferenceClick={onReferenceClick}
        referenceTitles={{ ...titles }}
      />
    )

    expect(screen.getByText(/Scaled attention/)).toBe(paragraph)
    expect(screen.getByRole('button', { name: '1' })).toBe(citation)
    // The kept citation calls the newest handler.
    fireEvent.click(citation)
    expect(onReferenceClick).toHaveBeenCalledWith('source', 'paper')
  })

  it('keeps the raw reference when no titles are given', () => {
    render(<ReferencedMarkdown content="See [source:paper]." />)

    expect(screen.getByRole('button', { name: 'source:paper' })).toBeInTheDocument()
  })
})
