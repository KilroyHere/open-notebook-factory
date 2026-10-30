import { render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SourceDetailPage from './page'
import { sourcesApi } from '@/lib/api/sources'
import { insightsApi } from '@/lib/api/insights'
import { chatMessageDomId } from '@/lib/utils/chat-navigation'
import type { SourceDetailResponse } from '@/lib/types/api'

const { openModal } = vi.hoisted(() => ({ openModal: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ id: 'source%3Apaper' }),
  usePathname: () => '/sources/source:paper',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/hooks/use-modal-manager', () => ({
  useModalManager: () => ({ openModal }),
}))
vi.mock('@/lib/api/sources', () => ({ sourcesApi: { get: vi.fn() } }))
vi.mock('@/lib/api/insights', () => ({
  insightsApi: { listForSource: vi.fn() },
}))
vi.mock('@/lib/api/transformations', () => ({
  transformationsApi: { list: vi.fn().mockResolvedValue([]) },
}))
vi.mock('@/components/sources/NotebookAssociations', () => ({
  NotebookAssociations: () => null,
}))
vi.mock('@/components/sources/SourceInsightDialog', () => ({
  SourceInsightDialog: () => null,
}))
vi.mock('@/components/sources/ModelSelector', () => ({
  ModelSelector: () => null,
}))

// Source chat cites the source, its insights (either spelling) and, rarely,
// something the page does not know.
const answer =
  'Attention replaces recurrence [source:paper]. The summary agrees ' +
  '[insight:dense], and so do [source_insight:gone] and [note:margin].'

vi.mock('@/lib/hooks/use-source-chat', () => ({
  useSourceChat: () => ({
    messages: [{ id: 'ai:1', type: 'ai', content: answer }],
    isStreaming: false,
    contextIndicators: null,
    sendMessage: vi.fn(),
    sessions: [],
    currentSession: undefined,
    currentSessionId: null,
    createSession: vi.fn(),
    switchSession: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
    loadingSessions: false,
  }),
}))

const source: SourceDetailResponse = {
  id: 'source:paper',
  title: 'Attention Is All You Need',
  asset: null,
  embedded: true,
  embedded_chunks: 4,
  insights_count: 1,
  created: '2026-10-29T00:00:00Z',
  updated: '2026-10-29T00:00:00Z',
  full_text: 'We propose the Transformer.',
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <SourceDetailPage />
    </QueryClientProvider>
  )
}

const reply = () => document.getElementById(chatMessageDomId('ai:1'))!

describe('SourceDetailPage chat references', () => {
  beforeEach(() => {
    openModal.mockClear()
    vi.mocked(sourcesApi.get).mockReset().mockResolvedValue(source)
    vi.mocked(insightsApi.listForSource).mockReset().mockResolvedValue([
      {
        id: 'source_insight:dense',
        source_id: source.id,
        insight_type: 'Dense Summary',
        content: 'A dense summary.',
        created: null,
        updated: null,
      },
    ])
  })

  it('names the source and its insights in the References list', async () => {
    renderPage()

    const insight = await within(reply()).findByRole('button', {
      name: 'Dense Summary',
    })
    within(reply()).getByRole('button', { name: 'Attention Is All You Need' }).click()
    expect(openModal).toHaveBeenCalledWith('source', 'paper')
    insight.click()
    expect(openModal).toHaveBeenLastCalledWith('insight', 'dense')
    // What the page cannot name reads as a numbered type, never an ID.
    expect(
      within(reply()).getByRole('button', { name: 'common.insight 2' })
    ).toBeInTheDocument()
    expect(
      within(reply()).getByRole('button', { name: 'common.note 1' })
    ).toBeInTheDocument()
    expect(
      within(reply()).queryByText(/source:paper|insight:dense|note:margin/)
    ).toBeNull()
  })

  it('takes the titles from what the source panel already loads', async () => {
    renderPage()

    await within(reply()).findByRole('button', { name: 'Dense Summary' })
    // The source panel shows the same source and insights…
    expect(screen.getByText('We propose the Transformer.')).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'common.insights (1)' })
    ).toBeInTheDocument()
    // …from the one request each it always made.
    await waitFor(() => expect(insightsApi.listForSource).toHaveBeenCalledTimes(1))
    expect(sourcesApi.get).toHaveBeenCalledTimes(1)
  })
})
