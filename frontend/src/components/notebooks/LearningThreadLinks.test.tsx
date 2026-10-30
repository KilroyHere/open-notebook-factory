import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LearningThreadLinks } from './LearningThreadLinks'
import { LearningMergeEvent } from './LearningUpdateParts'
import {
  InlineDivesProvider,
  type InlineDivesController,
} from './InlineDivesContext'
import { LearningAside } from '@/lib/types/api'

// Interpolate values so rows can be told apart by their titles.
vi.mock('@/lib/hooks/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join('|')}` : key,
    language: 'en-US',
    setLanguage: vi.fn(),
  }),
}))

const resolvedAside: LearningAside = {
  id: 'learning_aside:one',
  journey_id: 'learning_journey:one',
  parent_session_id: 'chat_session:one',
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
      relevance: 'This establishes the lower bound.',
      open_questions: ['Why choose a Gaussian prior?'],
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

const activeAside: LearningAside = {
  ...resolvedAside,
  id: 'learning_aside:two',
  title: 'KL term',
  status: 'active',
  updates: [],
}

describe('LearningThreadLinks', () => {
  it('lists the dives of this answer as compact rows, not summary cards', () => {
    render(
      <LearningThreadLinks
        messageId="ai:origin"
        asides={[
          resolvedAside,
          activeAside,
          { ...activeAside, id: 'learning_aside:gone', title: 'Gone', status: 'discarded' },
          {
            ...activeAside,
            id: 'learning_aside:elsewhere',
            title: 'Elsewhere',
            anchor: { ...activeAside.anchor, message_id: 'ai:other' },
          },
        ]}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
      />
    )

    const rows = screen.getAllByRole('button')
    expect(rows.map((row) => row.textContent)).toEqual([
      'learningAsides.learnedRow:The logarithm is concave.',
      'learningAsides.deepDiveRow:KL termlearningAsides.status.active',
    ])
    // The summary, why it matters and the old "N deep dives" header are gone
    // until a row is expanded.
    expect(screen.queryByText('This establishes the lower bound.')).toBeNull()
    expect(screen.queryByText(/branchCount/)).toBeNull()
  })

  it('opens a dive from its row outside the notebook chat', () => {
    const onOpenAside = vi.fn()
    render(
      <LearningThreadLinks
        messageId="ai:origin"
        asides={[resolvedAside]}
        onOpenAside={onOpenAside}
        onNavigateToMessage={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /learnedRow/ }))
    expect(onOpenAside).toHaveBeenCalledWith(resolvedAside.id)
  })

  it('reads a resolved row as plain text, without math markup', () => {
    render(
      <LearningThreadLinks
        messageId="ai:origin"
        asides={[
          {
            ...resolvedAside,
            updates: [
              {
                ...resolvedAside.updates[0],
                conclusion: 'Scores are divided by $\\sqrt{d_k}$ [source:paper].',
              },
            ],
          },
        ]}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
      />
    )

    expect(
      screen.getByRole('button', {
        name: 'learningAsides.learnedRow:Scores are divided by sqrt d_k.',
      })
    ).toBeInTheDocument()
  })

  it('nests a dive started from an open question under its parent, once', () => {
    const child: LearningAside = {
      ...activeAside,
      id: 'learning_aside:child',
      parent_aside_id: resolvedAside.id,
      title: 'Gaussian prior',
      status: 'parked',
      anchor: { type: 'message', content: 'Why choose a Gaussian prior?' },
    }
    render(
      <LearningThreadLinks
        messageId="ai:origin"
        asides={[resolvedAside, child]}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
      />
    )

    const parent = screen
      .getByRole('button', { name: /learnedRow/ })
      .closest('[data-inline-dive]')!
    const nested = screen.getAllByRole('button', { name: /Gaussian prior/ })
    expect(nested).toHaveLength(1)
    expect(parent.contains(nested[0])).toBe(true)
  })

  it('omits branches anchored to another message', () => {
    const { container } = render(
      <LearningThreadLinks
        messageId="ai:other"
        asides={[resolvedAside]}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the existing child dive from its question in the summary', () => {
    const onOpenAside = vi.fn()
    const child: LearningAside = {
      ...activeAside,
      id: 'learning_aside:child',
      parent_aside_id: resolvedAside.id,
      title: 'Gaussian prior',
      anchor: { type: 'message', content: 'Why choose a Gaussian prior?' },
    }
    const controller = {
      expandedAsideId: resolvedAside.id,
      creating: null,
      attention: null,
      onAttended: vi.fn(),
      sendingAsideId: null,
      pendingMessage: null,
      resolvingAsideId: null,
      isAsideLoading: false,
      onExpand: vi.fn(),
      onCollapse: vi.fn(),
      onOpenFullHeight: vi.fn(),
      onSendMessage: vi.fn(),
      onResolve: vi.fn(),
      onUpdateStatus: vi.fn(),
    } satisfies InlineDivesController
    render(
      <InlineDivesProvider value={controller}>
        <LearningThreadLinks
          messageId="ai:origin"
          asides={[resolvedAside, child]}
          onOpenAside={onOpenAside}
          onNavigateToMessage={vi.fn()}
          onDiveIntoQuestion={vi.fn()}
          onParkQuestion={vi.fn()}
        />
      </InlineDivesProvider>
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Why choose a Gaussian prior?' })
    )
    expect(onOpenAside).toHaveBeenCalledWith('learning_aside:child')
    expect(
      screen.queryByRole('button', { name: 'learningAsides.diveIn' })
    ).not.toBeInTheDocument()
  })

  it('keeps the merge summary for the reply that used the conclusion', () => {
    render(<LearningMergeEvent aside={resolvedAside} update={resolvedAside.updates[0]} />)

    expect(screen.getByText('The logarithm is concave.')).toBeInTheDocument()
    expect(screen.getByText('This establishes the lower bound.')).toBeInTheDocument()
  })
})
