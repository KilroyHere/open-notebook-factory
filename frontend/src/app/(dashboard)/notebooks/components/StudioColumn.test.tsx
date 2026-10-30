import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudioColumn } from './StudioColumn'
import { useNotebookColumnsStore } from '@/lib/stores/notebook-columns-store'
import type { NotebookWorkspace } from '@/lib/hooks/use-notebook-workspace'
import type { LearningAside } from '@/lib/types/api'

vi.mock('./NotesColumn', () => ({
  NotesColumn: () => <div>Notes column</div>,
}))

function openTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), {
    button: 0,
    ctrlKey: false,
  })
}

const aside: LearningAside = {
  id: 'learning_aside:b',
  journey_id: 'learning_journey:one',
  parent_session_id: 'chat_session:main',
  chat_session_id: 'chat_session:b',
  title: 'Current active aside',
  status: 'active',
  anchor: { type: 'message', content: 'Current anchor' },
  messages: [],
  updates: [],
  created: '2026-10-28T00:01:00Z',
  updated: '2026-10-28T00:01:00Z',
}

function createWorkspace(
  asides: LearningAside[] = [],
  shownAsideId: string | null = null
) {
  return {
    notebookId: 'notebook:1',
    chat: { messages: [] },
    learning: {
      asides,
      sections: [],
      activeAsideId: shownAsideId,
      openAside: vi.fn(),
    },
    shownAsideId,
    openAside: vi.fn(),
    showMainThread: vi.fn(),
    navigateToMainMessage: vi.fn(),
    diveIntoQuestion: vi.fn(),
    parkQuestion: vi.fn(),
    renameSection: vi.fn(),
    togglePinSection: vi.fn(),
  } as unknown as NotebookWorkspace
}

const notes = { notes: [], isLoading: false, notebookId: 'notebook:1' }

describe('StudioColumn', () => {
  beforeEach(() => {
    useNotebookColumnsStore.setState({ studioCollapsed: false })
  })

  it('opens on Notes while the journey has no deep dive', () => {
    render(<StudioColumn workspace={createWorkspace()} notes={notes} />)

    expect(screen.getByRole('tab', { name: 'common.notes' })).toHaveAttribute(
      'data-state',
      'active'
    )
    expect(screen.getByText('Notes column')).toBeInTheDocument()
    expect(screen.queryByLabelText('learningAsides.statsSummary')).toBeNull()
  })

  it('opens on Journey with its summary once there is an aside', () => {
    render(<StudioColumn workspace={createWorkspace([aside])} notes={notes} />)

    expect(
      screen.getByRole('tab', { name: 'learningAsides.journey' })
    ).toHaveAttribute('data-state', 'active')
    expect(
      screen.getByLabelText('learningAsides.statsSummary')
    ).toBeInTheDocument()
    expect(screen.getByText('Current active aside')).toBeInTheDocument()
  })

  it('keeps the tab the learner picked', () => {
    const { rerender } = render(
      <StudioColumn workspace={createWorkspace()} notes={notes} />
    )
    openTab('learningAsides.journey')
    rerender(<StudioColumn workspace={createWorkspace([aside])} notes={notes} />)
    openTab('common.notes')
    rerender(<StudioColumn workspace={createWorkspace([aside])} notes={notes} />)

    expect(screen.getByRole('tab', { name: 'common.notes' })).toHaveAttribute(
      'data-state',
      'active'
    )
  })

  it('collapses to a labelled rail and expands again', () => {
    render(<StudioColumn workspace={createWorkspace([aside])} notes={notes} />)

    const collapse = screen.getByRole('button', {
      name: 'Collapse notebooks.studio',
    })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(collapse)

    const expand = screen.getByRole('button', {
      name: 'Expand notebooks.studio',
    })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('tab')).toBeNull()
    fireEvent.click(expand)
    expect(
      screen.getByRole('tab', { name: 'learningAsides.journey' })
    ).toBeInTheDocument()
  })

  it('returns to the conversation when a journey branch is opened on mobile', () => {
    const workspace = createWorkspace([aside])
    const onShowConversation = vi.fn()
    render(
      <StudioColumn
        workspace={workspace}
        notes={notes}
        presentation="sheet"
        onShowConversation={onShowConversation}
      />
    )

    // The sheet has no desktop collapse control.
    expect(screen.queryByRole('button', { name: /^Collapse / })).toBeNull()
    fireEvent.click(screen.getByText('Current active aside'))
    expect(onShowConversation).toHaveBeenCalledTimes(1)
    // Opened where it lives (inline under its message when it can be),
    // not straight into the full-height view.
    expect(workspace.openAside).toHaveBeenCalledWith(aside.id)
    expect(workspace.learning.openAside).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.mainThread' })
    )
    expect(onShowConversation).toHaveBeenCalledTimes(2)
    expect(workspace.showMainThread).toHaveBeenCalled()
  })

  it('marks the dive on screen in the outline', () => {
    const { rerender } = render(
      <StudioColumn workspace={createWorkspace([aside])} notes={notes} />
    )
    const item = () => screen.getByText('Current active aside').closest('button')!
    expect(item()).not.toHaveClass('border-teal')

    rerender(
      <StudioColumn workspace={createWorkspace([aside], aside.id)} notes={notes} />
    )
    expect(item()).toHaveClass('border-teal')
  })
})
