import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NotebookPage from './page'
import { useIsDesktop } from '@/lib/hooks/use-media-query'

const { appShell, studio } = vi.hoisted(() => ({
  appShell: vi.fn(),
  studio: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'notebook%3A1' }),
}))
vi.mock('@/lib/hooks/use-media-query', () => ({ useIsDesktop: vi.fn() }))
vi.mock('@/lib/hooks/use-notebooks', () => ({
  useNotebook: () => ({
    data: { id: 'notebook:1', name: 'Variational inference', archived: false },
    isLoading: false,
  }),
}))
vi.mock('@/lib/hooks/use-sources', () => ({
  useNotebookSources: () => ({
    sources: [],
    isLoading: false,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
}))
vi.mock('@/lib/hooks/use-notes', () => ({
  useNotes: () => ({ data: [], isLoading: false }),
}))
vi.mock('@/lib/hooks/use-notebook-workspace', () => ({
  useNotebookWorkspace: () => ({ notebookId: 'notebook:1' }),
}))
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: (props: { children: React.ReactNode; compactNav?: boolean }) => {
    appShell(props)
    return <div>{props.children}</div>
  },
}))
vi.mock('../components/NotebookHeader', () => ({
  NotebookHeader: () => <header>Notebook header</header>,
}))
vi.mock('../components/SourcesColumn', () => ({
  SourcesColumn: () => <div>Sources column</div>,
}))
vi.mock('../components/ChatColumn', () => ({
  ChatColumn: () => <div>Chat column</div>,
}))
vi.mock('../components/StudioColumn', () => ({
  StudioColumn: (props: {
    presentation?: string
    onShowConversation?: () => void
  }) => {
    studio(props)
    return (
      <div>
        Studio column {props.presentation ?? 'rail'}
        <button type="button" onClick={props.onShowConversation}>
          open branch
        </button>
      </div>
    )
  },
}))

function openTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), {
    button: 0,
    ctrlKey: false,
  })
}

describe('NotebookPage layout', () => {
  beforeEach(() => {
    appShell.mockClear()
    studio.mockClear()
  })

  it('shows Sources, Chat and Studio side by side on desktop with the compact app nav', () => {
    vi.mocked(useIsDesktop).mockReturnValue(true)
    render(<NotebookPage />)

    expect(appShell).toHaveBeenCalledWith(
      expect.objectContaining({ compactNav: true })
    )
    expect(screen.getByText('Sources column')).toBeInTheDocument()
    expect(screen.getByText('Chat column')).toBeInTheDocument()
    expect(screen.getByText('Studio column rail')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('uses Sources / Chat / Studio tabs on narrow screens', () => {
    vi.mocked(useIsDesktop).mockReturnValue(false)
    render(<NotebookPage />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'navigation.sources',
      'common.chat',
      'notebooks.studio',
    ])
    expect(screen.getByText('Chat column')).toBeInTheDocument()

    openTab('navigation.sources')
    expect(screen.getByText('Sources column')).toBeInTheDocument()
    expect(screen.queryByText('Chat column')).toBeNull()

    openTab('notebooks.studio')
    expect(screen.getByText('Studio column sheet')).toBeInTheDocument()
  })

  it('returns to Chat when the Studio opens something in the conversation', () => {
    vi.mocked(useIsDesktop).mockReturnValue(false)
    render(<NotebookPage />)

    openTab('notebooks.studio')
    fireEvent.click(screen.getByRole('button', { name: 'open branch' }))

    expect(screen.getByText('Chat column')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'common.chat' })).toHaveAttribute(
      'data-state',
      'active'
    )
  })
})
