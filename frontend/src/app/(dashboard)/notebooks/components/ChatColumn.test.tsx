import { render, screen } from '@testing-library/react'
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
function createChatMock() {
  return {
    messages: [],
    isSending: false,
    tokenCount: 0,
    charCount: 0,
    sessions: [],
    currentSessionId: null,
    buildContext: vi.fn(),
  } as unknown as ReturnType<typeof useNotebookChat>
}

function createLearningMock() {
  return {
    asides: [],
    panelOpen: false,
    isLoading: false,
    isSending: false,
    isResolving: false,
    setPanelOpen: vi.fn(),
    openAside: vi.fn(),
    openList: vi.fn(),
    createAside: vi.fn(),
    sendMessage: vi.fn(),
    resolveAside: vi.fn(),
    updateStatus: vi.fn(),
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
})
