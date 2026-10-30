import { act, render, screen, fireEvent } from '@testing-library/react'
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

  it('gives a question that could not be sent back to the message box', async () => {
    let fail: (sent: boolean) => void = () => undefined
    const onSendMessage = vi.fn(
      () => new Promise<boolean>((resolve) => {
        fail = resolve
      })
    )
    render(
      <ChatPanel
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={onSendMessage}
      />
    )
    const textarea = getTextarea()
    fireEvent.change(textarea, { target: { value: 'Why a bound?' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    expect(textarea.value).toBe('')

    await act(async () => fail(false))

    expect(textarea.value).toBe('Why a bound?')
  })

  it('keeps what was typed meanwhile when a question could not be sent', async () => {
    let fail: (sent: boolean) => void = () => undefined
    const onSendMessage = vi.fn(
      () => new Promise<boolean>((resolve) => {
        fail = resolve
      })
    )
    render(
      <ChatPanel
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={onSendMessage}
      />
    )
    const textarea = getTextarea()
    fireEvent.change(textarea, { target: { value: 'Why a bound?' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    fireEvent.change(textarea, { target: { value: 'Something else' } })

    await act(async () => fail(false))

    expect(textarea.value).toBe('Something else')
  })

  it('gives a question that could not be sent back only to the session it was asked in', async () => {
    let fail: (sent: boolean) => void = () => undefined
    const onSendMessage = vi.fn(
      () => new Promise<boolean>((resolve) => {
        fail = resolve
      })
    )
    const panel = (currentSessionId: string | null) => (
      <ChatPanel
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={onSendMessage}
        currentSessionId={currentSessionId}
      />
    )
    const { rerender } = render(panel('chat_session:a'))
    const textarea = getTextarea()
    fireEvent.change(textarea, { target: { value: 'Why a bound?' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    rerender(panel('chat_session:b'))

    await act(async () => fail(false))

    expect(textarea.value).toBe('')
  })

  it('gives the first question of a new chat back in the session it opened', async () => {
    let fail: (sent: boolean) => void = () => undefined
    const onSendMessage = vi.fn(
      () => new Promise<boolean>((resolve) => {
        fail = resolve
      })
    )
    const panel = (currentSessionId: string | null) => (
      <ChatPanel
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={onSendMessage}
        currentSessionId={currentSessionId}
      />
    )
    const { rerender } = render(panel(null))
    const textarea = getTextarea()
    fireEvent.change(textarea, { target: { value: 'Why a bound?' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    rerender(panel('chat_session:new'))

    await act(async () => fail(false))

    expect(textarea.value).toBe('Why a bound?')
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

  it('says the messages are loading instead of inviting a first question', () => {
    const { rerender } = render(
      <ChatPanel
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={vi.fn()}
        isLoadingMessages
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent('common.loading')
    expect(screen.queryByText('chat.startConversation')).toBeNull()

    rerender(
      <ChatPanel
        messages={[]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={vi.fn()}
      />
    )
    expect(screen.getByText('chat.startConversation')).toBeInTheDocument()
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

  it('goes deeper on a passage selected in an assistant answer', () => {
    const onGoDeeperOnSelection = vi.fn()
    const answer = {
      id: 'ai:1',
      type: 'ai' as const,
      content: 'The probability that a latent explains the data.',
    }
    render(
      <ChatPanel
        workspaceMode
        messages={[{ id: 'human:1', type: 'human', content: 'Explain it.' }, answer]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={vi.fn()}
        onGoDeeperOnSelection={onGoDeeperOnSelection}
      />
    )

    const text = screen.getByText(answer.content).firstChild!
    const range = document.createRange()
    range.setStart(text, 4)
    range.setEnd(text, 15)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    fireEvent.mouseUp(text)
    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.goDeeper' }))

    expect(onGoDeeperOnSelection).toHaveBeenCalledWith(answer, 'probability')

    // Your own messages offer nothing.
    const mine = screen.getByText('Explain it.').firstChild!
    const own = document.createRange()
    own.setStart(mine, 0)
    own.setEnd(mine, 7)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(own)
    fireEvent.mouseUp(mine)
    expect(screen.queryByRole('toolbar')).toBeNull()
    window.getSelection()!.removeAllRanges()
  })

  it('lets an assistant reply shrink beside its avatar on narrow screens', () => {
    render(
      <ChatPanel
        workspaceMode
        messages={[
          { id: 'ai:1', type: 'ai', content: 'The probability that a latent explains the data.' },
        ]}
        isStreaming={false}
        contextIndicators={null}
        onSendMessage={vi.fn()}
      />
    )

    const bubble = screen
      .getByText('The probability that a latent explains the data.')
      .closest('.rounded-lg')!
    const column = bubble.parentElement!
    // A flex item without min-w-0 cannot shrink below its widest content
    // (a formula, a code block), so the reply ran past the right edge and
    // its text was clipped mid-word on phones.
    expect(column.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['flex-1', 'min-w-0'])
    )
    expect(column).not.toHaveClass('w-full')
    expect(bubble.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['min-w-0', 'max-w-full'])
    )
    // Wide display math scrolls inside the reply instead of widening it.
    expect(bubble.querySelector('.prose')?.className).toContain(
      '[&_.katex-display]:overflow-x-auto'
    )
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

  it('says in the chip details how many conclusions the limit left out', () => {
    const renderChip = (learningUpdatesOmitted: number) =>
      render(
        <ChatPanel
          workspaceMode
          messages={[]}
          isStreaming={false}
          contextIndicators={null}
          notebookContextStats={{
            sourcesInsights: 0,
            sourcesFull: 1,
            notesCount: 0,
            tokenCount: 3900,
            charCount: 15000,
            learningUpdatesOmitted,
          }}
          onSendMessage={vi.fn()}
        />
      )

    const { unmount } = renderChip(2)
    // Screen readers get it from the chip; sighted users from its tooltip.
    expect(screen.getByTestId('context-chip')).toHaveTextContent(
      'chat.contextConclusionsLeftOut'
    )
    unmount()

    renderChip(0)
    expect(screen.getByTestId('context-chip')).not.toHaveTextContent(
      'chat.contextConclusionsLeftOut'
    )
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
      // Only the expanded chip shows why it matters: under the origin answer
      // the dive is a collapsed "Learned" row.
      expect(screen.getAllByText('learningAsides.whyItMatters')).toHaveLength(1)
      expect(
        screen.getByRole('button', { name: 'learningAsides.learnedRow' })
      ).toBeInTheDocument()

      fireEvent.click(chip)
      expect(chip).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('learningAsides.origin')).toBeNull()
    })
  })
})
