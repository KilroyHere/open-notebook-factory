import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KnowledgeRail } from './KnowledgeRail'

const toggleKnowledge = vi.fn()

vi.mock('@/lib/stores/notebook-columns-store', () => ({
  useNotebookColumnsStore: () => ({
    knowledgeCollapsed: false,
    toggleKnowledge,
  }),
}))

vi.mock('./SourcesColumn', () => ({
  SourcesColumn: () => <div>Sources column</div>,
}))

vi.mock('./NotesColumn', () => ({
  NotesColumn: () => <div>Notes column</div>,
}))

const sources = {
  sources: [],
  isLoading: false,
  notebookId: 'notebook:1',
}

const notes = {
  notes: [],
  isLoading: false,
  notebookId: 'notebook:1',
}

describe('KnowledgeRail', () => {
  it('keeps sources and notes in one rail and can collapse it', () => {
    render(<KnowledgeRail sources={sources} notes={notes} />)

    expect(screen.getByText('Sources column')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'common.notes' }))
    expect(screen.getByText('Notes column')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse notebooks.knowledge' })
    )
    expect(toggleKnowledge).toHaveBeenCalled()
  })
})
