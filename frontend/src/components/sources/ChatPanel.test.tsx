import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatPanel } from './ChatPanel'

// useTranslation is mocked globally in setup.ts (t returns the key string)

vi.mock('@/lib/hooks/use-modal-manager', () => ({
  useModalManager: () => ({ openModal: vi.fn() }),
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
})
