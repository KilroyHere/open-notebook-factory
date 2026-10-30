import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { ChatColumn } from './ChatColumn'
import { useNotebookChat } from '@/lib/hooks/use-notebook-chat'
import { useLearningAsides } from '@/lib/hooks/use-learning-asides'
import { useNotebookWorkspace } from '@/lib/hooks/use-notebook-workspace'
import type { NoteResponse, SourceListResponse } from '@/lib/types/api'

const { openModal, chatPanel } = vi.hoisted(() => ({
  openModal: vi.fn(),
  chatPanel: vi.fn(),
}))

// Mock the hooks
vi.mock('@/lib/hooks/use-notebook-chat')
vi.mock('@/lib/hooks/use-learning-asides')
vi.mock('@/lib/hooks/use-modal-manager', () => ({
  useModalManager: () => ({ openModal }),
}))
vi.mock('@/components/sources/ChatPanel', () => ({
  ChatPanel: (props: Record<string, unknown>) => {
    chatPanel(props)
    return <div data-testid="chat-panel" />
  },
}))
vi.mock('@/lib/hooks/use-notes', () => ({
  useCreateNote: () => ({ mutate: vi.fn(), isPending: false }),
}))

type ChatPanelProps = {
  onOpenAside: (message: { id: string; type: string; content: string }) => void
}
const lastChatPanelProps = () =>
  chatPanel.mock.calls.at(-1)![0] as ChatPanelProps

const NO_SOURCES: SourceListResponse[] = []
const NO_NOTES: NoteResponse[] = []
const CONTEXT = { sources: {}, notes: {} }

// The page owns the workspace; this harness does the same for one column.
function renderColumn({
  sources = NO_SOURCES,
  isLoading = false,
}: { sources?: SourceListResponse[]; isLoading?: boolean } = {}) {
  function Harness() {
    const workspace = useNotebookWorkspace({
      notebookId: 'test-notebook',
      sources,
      notes: NO_NOTES,
      contextSelections: CONTEXT,
    })
    return <ChatColumn workspace={workspace} isLoading={isLoading} />
  }
  return render(<Harness />)
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
    expandAside: vi.fn(),
    collapseAside: vi.fn(),
    closeAside: vi.fn(),
    openList: vi.fn(),
    activeAsideId: null,
    creating: null,
    sendingAsideId: null,
    pendingMessage: null,
    resolvingAsideId: null,
    refreshJourney: vi.fn(),
    createAside: vi.fn(),
    sendMessage: vi.fn(),
    resolveAside: vi.fn(),
    updateStatus: vi.fn(),
    sections: [],
    syncSections: vi.fn(),
    updateSection: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useLearningAsides>
}

describe('ChatColumn', () => {
  beforeEach(() => {
    vi.mocked(useLearningAsides).mockReturnValue(createLearningMock())
  })

  it('shows loading spinner when fetching data', () => {
    vi.mocked(useNotebookChat).mockReturnValue(createChatMock())

    renderColumn({ isLoading: true })

    // Should show loading spinner
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })

  it('renders chat panel when data is loaded', () => {
    vi.mocked(useNotebookChat).mockReturnValue(createChatMock())

    renderColumn()

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

    renderColumn()
    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.resume' }))

    expect(screen.getByText('learningAsides.resumePrompt')).toBeInTheDocument()
    expect(openAside).toHaveBeenCalledWith(asideB.id)
  })

  it('opens cited evidence from a resolved aside in the existing modal', () => {
    openModal.mockClear()
    vi.mocked(useNotebookChat).mockReturnValue(createChatMock())
    vi.mocked(useLearningAsides).mockReturnValue(
      createLearningMock({
        panelOpen: true,
        activeAside: {
          id: 'learning_aside:one',
          journey_id: 'learning_journey:one',
          parent_session_id: 'chat_session:main',
          chat_session_id: 'chat_session:aside',
          title: 'Why Jensen applies',
          status: 'resolved',
          anchor: {
            type: 'message',
            message_id: 'ai:origin',
            content: 'Origin answer',
          },
          messages: [],
          updates: [
            {
              id: 'learning_update:one',
              aside_id: 'learning_aside:one',
              conclusion: 'The logarithm is concave.',
              open_questions: [],
              citations: ['source:paper'],
              include_in_main: true,
              applied_message_id: 'ai:merged',
              version: 1,
              created: '2026-10-29T00:00:00Z',
              updated: '2026-10-29T00:00:00Z',
            },
          ],
          created: '2026-10-29T00:00:00Z',
          updated: '2026-10-29T00:00:00Z',
        },
      })
    )

    renderColumn({
      sources: [
        {
          id: 'source:paper',
          title: 'Attention Is All You Need',
        } as SourceListResponse,
      ],
    })
    // The button names the notebook's source, not its record ID.
    expect(
      screen.queryByRole('button', { name: /paper/ })
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Attention Is All You Need' })
    )

    expect(openModal).toHaveBeenCalledWith('source', 'paper')
  })

  describe('Dive in', () => {
    const parent = {
      id: 'learning_aside:parent',
      journey_id: 'learning_journey:one',
      parent_session_id: 'chat_session:main',
      chat_session_id: 'chat_session:parent',
      title: 'Why Jensen applies',
      status: 'resolved',
      anchor: { type: 'message', message_id: 'ai:origin', content: 'Origin' },
      messages: [],
      updates: [
        {
          id: 'learning_update:one',
          aside_id: 'learning_aside:parent',
          conclusion: 'The logarithm is concave.',
          open_questions: ['Why a Gaussian prior?'],
          citations: [],
          include_in_main: true,
          version: 1,
          created: '2026-10-29T00:00:00Z',
          updated: '2026-10-29T00:00:00Z',
        },
      ],
      created: '2026-10-29T00:00:00Z',
      updated: '2026-10-29T00:00:00Z',
    }

    it('creates the child dive and asks its question straight away', async () => {
      const createAside = vi.fn().mockResolvedValue({
        ...parent,
        id: 'learning_aside:child',
        status: 'active',
        updates: [],
      })
      const sendMessage = vi.fn().mockResolvedValue(undefined)
        vi.mocked(useNotebookChat).mockReturnValue(createChatMock())
      vi.mocked(useLearningAsides).mockReturnValue(
        createLearningMock({
          panelOpen: true,
          asides: [parent],
          activeAside: parent,
          createAside,
          sendMessage,
        })
      )

      renderColumn()
      fireEvent.click(
        screen.getAllByRole('button', { name: 'learningAsides.diveIn' })[0]
      )

      await waitFor(() =>
        expect(sendMessage).toHaveBeenCalledWith({
          asideId: 'learning_aside:child',
          message: 'Why a Gaussian prior?',
        })
      )
      // Asked from the full-height view, the child opens there too.
      expect(createAside).toHaveBeenCalledWith({
        type: 'message',
        content: 'Why a Gaussian prior?',
        parentAside: parent,
        presentation: 'full',
      })
      expect(createAside.mock.invocationCallOrder[0]).toBeLessThan(
        sendMessage.mock.invocationCallOrder[0]
      )
    })

    it('does not ask when the dive could not be created', async () => {
      const createAside = vi.fn().mockRejectedValue(new Error('nope'))
      const sendMessage = vi.fn()
        vi.mocked(useNotebookChat).mockReturnValue(createChatMock())
      vi.mocked(useLearningAsides).mockReturnValue(
        createLearningMock({
          panelOpen: true,
          asides: [parent],
          activeAside: parent,
          createAside,
          sendMessage,
        })
      )

      renderColumn()
      fireEvent.click(
        screen.getAllByRole('button', { name: 'learningAsides.diveIn' })[0]
      )

      await waitFor(() => expect(createAside).toHaveBeenCalled())
      expect(sendMessage).not.toHaveBeenCalled()
    })
  })

  describe('inline dives', () => {
    const answer = { id: 'ai:1', type: 'ai', content: 'The ELBO is a bound.' }
    const inlineDive = {
      id: 'learning_aside:inline',
      journey_id: 'learning_journey:one',
      parent_session_id: 'chat_session:main',
      chat_session_id: 'chat_session:inline',
      title: 'Why a bound',
      status: 'active',
      anchor: { type: 'message', message_id: 'ai:1', content: answer.content },
      messages: [],
      updates: [],
      created: '2026-10-29T00:00:00Z',
      updated: '2026-10-29T00:00:00Z',
    }

    it('opens Go deeper as a dive under the answer, keeping the chat', async () => {
      const createAside = vi.fn().mockResolvedValue(inlineDive)
      const learning = createLearningMock({ createAside })
      vi.mocked(useNotebookChat).mockReturnValue(
        createChatMock({ messages: [answer], currentSessionId: 'chat_session:main' })
      )
      vi.mocked(useLearningAsides).mockReturnValue(learning)

      renderColumn()
      lastChatPanelProps().onOpenAside(answer)

      await waitFor(() =>
        expect(createAside).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'message',
            message_id: 'ai:1',
            content: answer.content,
            presentation: 'inline',
          })
        )
      )
      expect(learning.openAside).not.toHaveBeenCalled()
      expect(screen.getByTestId('chat-panel')).toBeInTheDocument()
    })

    it('resumes a dive under its answer instead of replacing the chat', () => {
      const learning = createLearningMock({
        asides: [inlineDive],
        resume: { open_aside_ids: [inlineDive.id], recommended_aside_id: inlineDive.id },
      })
      vi.mocked(useNotebookChat).mockReturnValue(
        createChatMock({ messages: [answer], currentSessionId: 'chat_session:main' })
      )
      vi.mocked(useLearningAsides).mockReturnValue(learning)

      renderColumn()
      fireEvent.click(screen.getByRole('button', { name: 'learningAsides.resume' }))

      expect(learning.expandAside).toHaveBeenCalledWith(inlineDive.id)
      expect(learning.openAside).not.toHaveBeenCalled()
    })

    it('hides the resume prompt for the dive already open under its answer', () => {
      vi.mocked(useNotebookChat).mockReturnValue(
        createChatMock({ messages: [answer], currentSessionId: 'chat_session:main' })
      )
      vi.mocked(useLearningAsides).mockReturnValue(
        createLearningMock({
          asides: [inlineDive],
          activeAside: inlineDive,
          activeAsideId: inlineDive.id,
          resume: { open_aside_ids: [inlineDive.id], recommended_aside_id: inlineDive.id },
        })
      )

      renderColumn()

      expect(screen.queryByText('learningAsides.resumePrompt')).toBeNull()
    })

    it('keeps the chat mounted and inert under the full-height view', () => {
      vi.mocked(useNotebookChat).mockReturnValue(
        createChatMock({ messages: [answer] })
      )
      vi.mocked(useLearningAsides).mockReturnValue(
        createLearningMock({
          panelOpen: true,
          asides: [inlineDive],
          activeAside: inlineDive,
          activeAsideId: inlineDive.id,
        })
      )

      renderColumn()

      const chat = screen.getByTestId('chat-panel').closest('[data-main-chat]')!
      expect(chat).toHaveAttribute('inert')
      expect(
        screen.getByRole('region', { name: inlineDive.title })
      ).toBeInTheDocument()
    })

    it('returns from full height to the dive under its answer', () => {
      const learning = createLearningMock({
        panelOpen: true,
        asides: [inlineDive],
        activeAside: inlineDive,
        activeAsideId: inlineDive.id,
      })
      vi.mocked(useNotebookChat).mockReturnValue(
        createChatMock({ messages: [answer] })
      )
      vi.mocked(useLearningAsides).mockReturnValue(learning)

      renderColumn()
      fireEvent.click(
        screen.getByRole('button', { name: 'learningAsides.returnToMain' })
      )

      // Still open, now inline: only the full-height view closes.
      expect(learning.setPanelOpen).toHaveBeenCalledWith(false)
      expect(learning.closeAside).not.toHaveBeenCalled()
    })

    it('goes deeper on a passage of a full-height dive in a dive nested under it', async () => {
      const opened = {
        ...inlineDive,
        messages: [
          { id: 'human:d1', type: 'human', content: 'Why a bound?' },
          { id: 'ai:d1', type: 'ai', content: 'The logarithm is concave.' },
        ],
      }
      const createAside = vi.fn().mockResolvedValue({
        ...inlineDive,
        id: 'learning_aside:passage',
        parent_aside_id: inlineDive.id,
      })
      vi.mocked(useNotebookChat).mockReturnValue(
        createChatMock({ messages: [answer], currentSessionId: 'chat_session:main' })
      )
      vi.mocked(useLearningAsides).mockReturnValue(
        createLearningMock({
          panelOpen: true,
          asides: [inlineDive],
          activeAside: opened,
          activeAsideId: inlineDive.id,
          createAside,
        })
      )

      renderColumn()
      const text = screen.getByText('The logarithm is concave.').firstChild!
      const range = document.createRange()
      range.setStart(text, 4)
      range.setEnd(text, 13)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)
      fireEvent.mouseUp(text)
      fireEvent.click(screen.getByRole('button', { name: 'learningAsides.goDeeper' }))
      window.getSelection()!.removeAllRanges()

      await waitFor(() =>
        expect(createAside).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'message',
            content: 'logarithm',
            message_id: 'ai:d1',
            locator: 'selection',
            parentAside: opened,
            // Asked from the full-height view, the dive opens there too.
            presentation: 'full',
          })
        )
      )
    })

    it('closes a dive that cannot show inline when leaving full height', () => {
      const loose = { ...inlineDive, anchor: { type: 'message', content: 'No message' } }
      const learning = createLearningMock({
        panelOpen: true,
        asides: [loose],
        activeAside: loose,
        activeAsideId: loose.id,
      })
      vi.mocked(useNotebookChat).mockReturnValue(
        createChatMock({ messages: [answer] })
      )
      vi.mocked(useLearningAsides).mockReturnValue(learning)

      renderColumn()
      fireEvent.click(
        screen.getByRole('button', { name: 'learningAsides.returnToMain' })
      )

      expect(learning.closeAside).toHaveBeenCalled()
      expect(learning.setPanelOpen).not.toHaveBeenCalled()
    })
  })
})
