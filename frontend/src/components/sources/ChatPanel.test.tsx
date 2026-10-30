import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatPanel } from './ChatPanel'
import type { LearningAside } from '@/lib/types/api'

// useTranslation is mocked globally in setup.ts (t returns the key string)

const { openModal } = vi.hoisted(() => ({ openModal: vi.fn() }))

vi.mock('@/lib/hooks/use-modal-manager', () => ({
  useModalManager: () => ({ openModal }),
}))

// Keep the message-content deps light for this composer-focused test.
vi.mock('@/components/sources/MessageActions', () => ({
  MessageActions: () => null,
}))

vi.mock('./ModelSelector', () => ({
  ModelSelector: () => <button type="button">model-picker</button>,
}))

describe('ChatPanel composer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom does not implement scrollIntoView (used by the auto-scroll effect).
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  const getTextarea = () => screen.getByRole('textbox') as HTMLTextAreaElement

  it('sends the typed message and clears the input on send-button click', () => {
    const onSendMessage = vi.fn()
    render(
      <ChatPanel
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={onSendMessage}
      />
    )

    const textarea = getTextarea()
    fireEvent.change(textarea, { target: { value: '  hello world  ' } })

    const sendButton = screen.getByRole('button')
    fireEvent.click(sendButton)

    expect(onSendMessage).toHaveBeenCalledTimes(1)
    expect(onSendMessage).toHaveBeenCalledWith('hello world', undefined)
    expect(textarea.value).toBe('')
  })

  it('sends on Cmd+Enter on macOS', () => {
    const uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
    )
    const onSendMessage = vi.fn()
    render(
      <ChatPanel
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={onSendMessage}
      />
    )

    const textarea = getTextarea()
    fireEvent.change(textarea, { target: { value: 'via cmd' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true, ctrlKey: false })

    expect(onSendMessage).toHaveBeenCalledWith('via cmd', undefined)
    expect(textarea.value).toBe('')
    uaSpy.mockRestore()
  })

  it('sends on Ctrl+Enter on non-macOS', () => {
    const uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    )
    const onSendMessage = vi.fn()
    render(
      <ChatPanel
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={onSendMessage}
      />
    )

    const textarea = getTextarea()
    fireEvent.change(textarea, { target: { value: 'via ctrl' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true, metaKey: false })

    expect(onSendMessage).toHaveBeenCalledWith('via ctrl', undefined)
    expect(textarea.value).toBe('')
    uaSpy.mockRestore()
  })

  it('does not send while streaming', () => {
    const onSendMessage = vi.fn()
    render(
      <ChatPanel
        messages={[]}
        isStreaming={true}
        contextIndicators={null}
        onSendMessage={onSendMessage}
      />
    )

    const textarea = getTextarea()
    // Textarea is disabled while streaming, but the guard must also hold.
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('keeps a title outside workspace mode', () => {
    render(
      <ChatPanel
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={vi.fn()}
      />
    )

    expect(screen.getByText('chat.chatWith')).toBeInTheDocument()
  })

  it('shows the current session on the composer and hides the chat title in the workspace', () => {
    render(
      <ChatPanel
        workspaceMode
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        notebookContextStats={{
          sourcesInsights: 0,
          sourcesFull: 0,
          notesCount: 0,
        }}
        onSendMessage={vi.fn()}
        onModelChange={vi.fn()}
        sessions={[
          {
            id: 's1',
            title: 'ELBO',
            created: '2026-10-29T12:00:00Z',
            updated: '2026-10-29T12:00:00Z',
          },
        ]}
        currentSessionId="s1"
        onCreateSession={vi.fn()}
        onSelectSession={vi.fn()}
        onDeleteSession={vi.fn()}
      />
    )

    expect(screen.queryByText('chat.chatWith')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.model')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'chat.sessions: ELBO' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'model-picker' })).toBeInTheDocument()
  })

  it('wraps human messages at word boundaries instead of mid-word', () => {
    render(
      <ChatPanel
        messages={[
          { id: 'h1', type: 'human', content: 'Why does this work and happen to converge?' },
        ]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={vi.fn()}
      />
    )

    const bubble = screen.getByText('Why does this work and happen to converge?')
    // break-all splits ordinary words ("works a / nd"); break-words only
    // breaks a string that cannot fit on a line by itself.
    expect(bubble).not.toHaveClass('break-all')
    expect(bubble).toHaveClass('break-words')
  })

  it('keeps messages at a readable width, centered in a wide column', () => {
    render(
      <ChatPanel
        workspaceMode
        messages={[{ id: 'h1', type: 'human', content: 'Hello' }]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={vi.fn()}
      />
    )

    const list = screen.getByText('Hello').closest('.max-w-\\[45rem\\]')
    expect(list).not.toBeNull()
    expect(list).toHaveClass('mx-auto')
  })

  it('puts the context count on a chip and the size in its details', () => {
    render(
      <ChatPanel
        workspaceMode
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        notebookContextStats={{
          sourcesInsights: 1,
          sourcesFull: 1,
          notesCount: 1,
          tokenCount: 1500,
          charCount: 6000,
        }}
        onSendMessage={vi.fn()}
      />
    )

    const chip = screen.getByTestId('context-chip')
    expect(chip).toHaveTextContent('chat.contextSources · chat.contextNotes')
    // The size is no longer an always-visible line under the composer.
    expect(chip).toHaveTextContent('chat.contextSize')
    expect(chip).toHaveTextContent('chat.contextInsightsOnly')
  })

  it('says when nothing is in context', () => {
    render(
      <ChatPanel
        workspaceMode
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        notebookContextStats={{ sourcesInsights: 0, sourcesFull: 0, notesCount: 0 }}
        onSendMessage={vi.fn()}
      />
    )

    expect(screen.getByTestId('context-chip')).toHaveTextContent('chat.contextNone')
  })

  it('names cited sources by title in the References list', () => {
    render(
      <ChatPanel
        workspaceMode
        messages={[
          {
            id: 'ai:1',
            type: 'ai',
            content: 'The bound is tight [source:8cvgg8uul1f5xdm6cq5w].',
          },
        ]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={vi.fn()}
        referenceTitles={{
          'source:8cvgg8uul1f5xdm6cq5w': 'Variational Inference: A Review',
        }}
      />
    )

    expect(screen.queryByText(/8cvgg8uul1f5xdm6cq5w/)).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Variational Inference: A Review' })
    )
    expect(openModal).toHaveBeenCalledWith('source', '8cvgg8uul1f5xdm6cq5w')
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    expect(openModal).toHaveBeenCalledTimes(2)
  })

  describe('a reply that used what the learner resolved', () => {
    const aside: LearningAside = {
      id: 'learning_aside:one',
      journey_id: 'learning_journey:one',
      parent_session_id: 'chat_session:main',
      chat_session_id: 'chat_session:aside',
      title: 'Why Jensen applies',
      status: 'resolved',
      anchor: { type: 'message', message_id: 'ai:origin', content: 'Origin' },
      messages: [],
      updates: [
        {
          id: 'learning_update:one',
          aside_id: 'learning_aside:one',
          conclusion: 'The logarithm is concave so the bound holds.',
          relevance: 'It justifies the ELBO.',
          open_questions: [],
          citations: [],
          include_in_main: true,
          applied_message_id: 'ai:merged',
          version: 1,
          created: '2026-10-29T00:00:00Z',
          updated: '2026-10-29T00:00:00Z',
        },
      ],
      created: '2026-10-29T00:00:00Z',
      updated: '2026-10-29T00:00:00Z',
    }

    const renderReply = () =>
      render(
        <ChatPanel
          workspaceMode
          messages={[
            { id: 'ai:origin', type: 'ai', content: 'Origin answer' },
            { id: 'ai:merged', type: 'ai', content: 'Merged answer' },
          ]}
          isStreaming={false}
          contextIndicators={null}
          onSendMessage={vi.fn()}
          learningAsides={[aside]}
          onOpenLearningAside={vi.fn()}
          onNavigateToMessage={vi.fn()}
        />
      )

    it('shows a collapsed chip above that reply only', () => {
      renderReply()

      const chips = screen.getAllByRole('button', {
        name: /learningAsides\.usedWhatYouLearned/,
      })
      expect(chips).toHaveLength(1)
      expect(chips[0]).toHaveAttribute('aria-expanded', 'false')
      // Above the reply: the chip comes before the reply text in the row.
      expect(
        chips[0].compareDocumentPosition(screen.getByText('Merged answer')) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
      // The full summary card stays closed until asked for.
      expect(screen.queryByText('learningAsides.origin')).toBeNull()
    })

    it('expands into the merge summary and collapses again', () => {
      renderReply()

      const chip = screen.getByRole('button', {
        name: /learningAsides\.usedWhatYouLearned/,
      })
      fireEvent.click(chip)
      expect(chip).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('learningAsides.summary')).toBeInTheDocument()
      expect(screen.getByText('learningAsides.origin')).toBeInTheDocument()
      expect(screen.getAllByText('learningAsides.whyItMatters')).toHaveLength(2)

      fireEvent.click(chip)
      expect(chip).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('learningAsides.origin')).toBeNull()
    })
  })
})
