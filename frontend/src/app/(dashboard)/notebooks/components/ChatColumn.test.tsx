import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { ChatColumn } from './ChatColumn'
import { useNotes } from '@/lib/hooks/use-notes'
import { useNotebookChat } from '@/lib/hooks/use-notebook-chat'
import { useLearningAsides } from '@/lib/hooks/use-learning-asides'

// Mock the hooks
vi.mock('@/lib/hooks/use-notes')
vi.mock('@/lib/hooks/use-notebook-chat')
vi.mock('@/lib/hooks/use-learning-asides')
vi.mock('@/components/sources/ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel" />
}))

// Type-safe mock factory for useNotes hook
function createNotesMock(overrides: { isLoading?: boolean } = {}) {
  return {
    data: [],
    isLoading: overrides.isLoading ?? false,
  } as unknown as ReturnType<typeof useNotes>
}

// Type-safe mock factory for useNotebookChat hook
function createChatMock(overrides: Record<string, unknown> = {}) {
  return {
    messages: [],
    isSending: false,
    tokenCount: 0,
    charCount: 0,
    sessions: [],
    currentSessionId: null,
    buildContext: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useNotebookChat>
}

function createLearningMock(overrides: Record<string, unknown> = {}) {
  return {
    asides: [],
    panelOpen: false,
    isLoading: false,
    isSending: false,
    isResolving: false,
    isAsideLoading: false,
    isCreating: false,
    setPanelOpen: vi.fn(),
    openAside: vi.fn(),
    openList: vi.fn(),
    createAside: vi.fn(),
    sendMessage: vi.fn(),
    resolveAside: vi.fn(),
    updateStatus: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useLearningAsides>
}

describe('ChatColumn', () => {
  const baseProps = {
    notebookId: 'test-notebook',
    contextSelections: {
      sources: {},
      notes: {}
    },
    sources: [],
  }

  beforeEach(() => {
    vi.mocked(useLearningAsides).mockReturnValue(createLearningMock())
  })

  it('shows loading spinner when fetching data', () => {
    vi.mocked(useNotes).mockReturnValue(createNotesMock({ isLoading: true }))
    vi.mocked(useNotebookChat).mockReturnValue(createChatMock())

    render(<ChatColumn {...baseProps} sourcesLoading={true} />)

    // Should show loading spinner
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })

  it('renders chat panel when data is loaded', () => {
    vi.mocked(useNotes).mockReturnValue(createNotesMock({ isLoading: false }))
    vi.mocked(useNotebookChat).mockReturnValue(createChatMock())

    render(<ChatColumn {...baseProps} sourcesLoading={false} />)

    // Should show chat panel
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument()
  })

  it('resumes the backend-recommended aside when several are open', () => {
    const openAside = vi.fn()
    const asideA = {
      id: 'learning_aside:a',
      journey_id: 'learning_journey:one',
      parent_session_id: 'chat_session:main',
      chat_session_id: 'chat_session:a',
      title: 'Older parked aside',
      status: 'parked',
      anchor: { type: 'message', content: 'Older anchor' },
      messages: [],
      updates: [],
      created: '2026-10-28T00:00:00Z',
      updated: '2026-10-28T00:00:00Z',
    }
    const asideB = {
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
    vi.mocked(useNotes).mockReturnValue(createNotesMock())
    vi.mocked(useNotebookChat).mockReturnValue(
      createChatMock({ currentSessionId: 'chat_session:main' })
    )
    vi.mocked(useLearningAsides).mockReturnValue(
      createLearningMock({
        asides: [asideA, asideB],
        resume: {
          open_aside_ids: [asideA.id, asideB.id],
          recommended_aside_id: asideB.id,
        },
        openAside,
      })
    )

    render(<ChatColumn {...baseProps} sourcesLoading={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.resume' }))

    expect(screen.getByText('learningAsides.resumePrompt')).toBeInTheDocument()
    expect(openAside).toHaveBeenCalledWith(asideB.id)
  })
})
