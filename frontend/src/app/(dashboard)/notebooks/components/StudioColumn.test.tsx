import { fireEvent, render, screen, within } from '@testing-library/react'
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
  shownAsideId: string | null = null,
  chat: Record<string, unknown> = {}
) {
  return {
    notebookId: 'notebook:1',
    chat: { messages: [], ...chat },
    learning: {
      asides,
      sections: [],
      activeAsideId: shownAsideId,
      openAside: vi.fn(),
      setIncludeInMain: vi.fn(),
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

    // Translated labels; CollapsibleColumn's own test checks the column name.
    const collapse = screen.getByRole('button', {
      name: 'notebooks.collapseColumn',
    })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(collapse)

    const expand = screen.getByRole('button', {
      name: 'notebooks.expandColumn',
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
    expect(
      screen.queryByRole('button', { name: 'notebooks.collapseColumn' })
    ).toBeNull()
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

  it('lists what was learned with a switch for main chat that keeps the count', () => {
    const conclusion = {
      id: 'learning_update:one',
      aside_id: 'learning_aside:resolved',
      conclusion: 'Concavity produces the lower bound.',
      open_questions: [],
      citations: [],
      include_in_main: true,
      version: 1,
      created: aside.created,
      updated: aside.updated,
    }
    const resolved: LearningAside = {
      ...aside,
      id: 'learning_aside:resolved',
      title: 'Why Jensen applies',
      status: 'resolved',
      updates: [conclusion],
    }
    const workspace = createWorkspace([resolved])
    const onShowConversation = vi.fn()
    const { rerender } = render(
      <StudioColumn
        workspace={workspace}
        notes={notes}
        presentation="sheet"
        onShowConversation={onShowConversation}
      />
    )
    const learnedCount = () =>
      screen.getByText('learningAsides.statsLearned').closest('div')!
    expect(learnedCount()).toHaveTextContent('1')

    const learned = screen.getByRole('region', {
      name: 'learningAsides.whatYouLearned',
    })
    fireEvent.click(within(learned).getByRole('checkbox'))
    // Switching stays in Studio; opening the conclusion goes to the chat.
    expect(workspace.learning.setIncludeInMain).toHaveBeenCalledWith(
      conclusion,
      false
    )
    expect(onShowConversation).not.toHaveBeenCalled()
    fireEvent.click(
      within(learned).getByRole('button', {
        name: 'Concavity produces the lower bound.',
      })
    )
    expect(onShowConversation).toHaveBeenCalledTimes(1)
    expect(workspace.openAside).toHaveBeenCalledWith(resolved.id)

    // Left out of main chat, it is still listed but no longer counted.
    rerender(
      <StudioColumn
        workspace={createWorkspace([
          { ...resolved, updates: [{ ...conclusion, include_in_main: false }] },
        ])}
        notes={notes}
        presentation="sheet"
      />
    )
    expect(learnedCount()).toHaveTextContent('0')
    expect(
      within(
        screen.getByRole('region', { name: 'learningAsides.whatYouLearned' })
      ).getByRole('checkbox')
    ).not.toBeChecked()
  })

  it('marks the conclusions the context limit leaves out of main chat', () => {
    const conclusion = (id: string) => ({
      id: `learning_update:${id}`,
      aside_id: `learning_aside:${id}`,
      conclusion: `Conclusion ${id}.`,
      open_questions: [],
      citations: [],
      include_in_main: true,
      version: 1,
      created: aside.created,
      updated: aside.updated,
    })
    const resolved = (id: string): LearningAside => ({
      ...aside,
      id: `learning_aside:${id}`,
      title: `Dive ${id}`,
      status: 'resolved',
      updates: [conclusion(id)],
    })
    render(
      <StudioColumn
        workspace={createWorkspace([resolved('kept'), resolved('dropped')], null, {
          learningUpdatesOmitted: 1,
          keptLearningUpdateIds: new Set(['learning_update:kept']),
        })}
        notes={notes}
      />
    )

    const learned = screen.getByRole('region', {
      name: 'learningAsides.whatYouLearned',
    })
    const [kept, dropped] = within(learned).getAllByRole('listitem')
    expect(within(dropped).getByText('learningAsides.leftOutOfMainChat')).toBeInTheDocument()
    expect(within(kept).queryByText('learningAsides.leftOutOfMainChat')).toBeNull()
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
