import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionManager } from './SessionManager'
import { BaseChatSession } from '@/lib/types/api'

vi.mock('@/lib/hooks/use-models', () => ({
  useModels: () => ({ data: [], isLoading: false }),
}))

const sessions: BaseChatSession[] = [
  {
    id: 'chat_session:current',
    title: 'ELBO',
    created: '2026-10-29T12:00:00Z',
    updated: '2026-10-29T12:00:00Z',
    message_count: 2,
  },
  {
    id: 'chat_session:other',
    title: 'Evidence',
    created: '2026-10-28T12:00:00Z',
    updated: '2026-10-28T12:00:00Z',
  },
]

function renderManager(
  onSelectSession = vi.fn(),
  onDeleteSession = vi.fn()
) {
  render(
    <SessionManager
      sessions={sessions}
      currentSessionId="chat_session:current"
      onCreateSession={vi.fn()}
      onSelectSession={onSelectSession}
      onUpdateSession={vi.fn()}
      onDeleteSession={onDeleteSession}
      loadingSessions={false}
    />
  )
  return { onSelectSession, onDeleteSession }
}

describe('SessionManager', () => {
  it('marks the open session and selects it from its title', () => {
    const { onSelectSession } = renderManager()

    const current = screen.getByRole('button', { name: /ELBO/ })
    expect(current).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('common.current')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Evidence/ })
    ).not.toHaveAttribute('aria-current')

    fireEvent.click(current)
    expect(onSelectSession).toHaveBeenCalledWith('chat_session:current')
  })

  it('keeps rename and delete off the select action', () => {
    const { onSelectSession } = renderManager()

    fireEvent.click(screen.getAllByRole('button', { name: 'common.edit' })[0])
    expect(onSelectSession).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'common.save' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'chat.deleteSession' })[1]
    )
    expect(onSelectSession).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})
