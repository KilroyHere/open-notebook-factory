import { useState } from 'react'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LearningThreadLinks } from './LearningThreadLinks'
import {
  InlineDivesProvider,
  type InlineDivesController,
} from './InlineDivesContext'
import { clearAsideDrafts } from './AsideComposer'
import type { LearningAside, LearningResolutionDraft } from '@/lib/types/api'
import type { DiveAttention } from '@/lib/hooks/use-notebook-workspace'

// Interpolate values so rows can be told apart by their titles.
vi.mock('@/lib/hooks/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join('|')}` : key,
    language: 'en-US',
    setLanguage: vi.fn(),
  }),
}))

const created = '2026-10-29T00:00:00Z'

const dive: LearningAside = {
  id: 'learning_aside:one',
  journey_id: 'learning_journey:one',
  parent_session_id: 'chat_session:main',
  chat_session_id: 'chat_session:one',
  title: 'Why Jensen applies',
  status: 'active',
  anchor: { type: 'message', message_id: 'ai:origin', content: 'Origin answer' },
  messages: [],
  updates: [],
  created,
  updated: created,
}

const transcript: LearningAside['messages'] = [
  { id: 'human:1', type: 'human', content: 'Why does that inequality apply?' },
  {
    id: 'ai:1',
    type: 'ai',
    content: 'The logarithm is concave [source:paper], so $\\log$ bends down.',
  },
]

const resolved: LearningAside = {
  ...dive,
  id: 'learning_aside:resolved',
  title: 'Concavity',
  status: 'resolved',
  updates: [
    {
      id: 'learning_update:one',
      aside_id: 'learning_aside:resolved',
      conclusion:
        'Jensen gives a lower bound because the logarithm is concave everywhere.',
      relevance: 'It justifies the first ELBO step.',
      open_questions: ['Why a Gaussian prior?'],
      citations: [],
      include_in_main: true,
      applied_message_id: 'ai:merged',
      version: 1,
      created,
      updated: created,
    },
  ],
}

type Overrides = Partial<InlineDivesController>

interface HarnessProps {
  asides: LearningAside[]
  /** Transcripts by aside id, as the open dive's detail query returns them. */
  details?: Record<string, LearningAside>
  initialExpanded?: string | null
  overrides?: Overrides
  handlers?: Partial<{
    onOpenAside: (id: string) => void
    onNavigateToMessage: (id: string) => void
    onDiveIntoQuestion: (parent: LearningAside, question: string) => void
    onParkQuestion: (parent: LearningAside, question: string) => void
    onReferenceClick: (type: string, id: string) => void
  }>
}

const spies = {
  onSendMessage: vi.fn(),
  onDraftResolution: vi.fn(),
  onResolve: vi.fn(),
  onUpdateStatus: vi.fn(),
  onOpenFullHeight: vi.fn(),
  onAttended: vi.fn(),
}

// A controller with real expand/collapse state, as the workspace keeps it.
function Harness({
  asides,
  details = {},
  initialExpanded = null,
  overrides = {},
  handlers = {},
}: HarnessProps) {
  const [expanded, setExpanded] = useState<string | null>(initialExpanded)
  const listed = asides.find((aside) => aside.id === expanded)
  const controller: InlineDivesController = {
    expandedAsideId: expanded,
    activeAside: expanded ? details[expanded] ?? listed : undefined,
    creating: null,
    attention: null,
    sendingAsideId: null,
    pendingMessage: null,
    resolvingAsideId: null,
    isAsideLoading: false,
    onExpand: setExpanded,
    onCollapse: (id) =>
      setExpanded((current) => (current === id ? null : current)),
    ...spies,
    ...overrides,
  }
  return (
    <div data-slot="scroll-area-viewport">
      <InlineDivesProvider value={controller}>
        <LearningThreadLinks
          messageId="ai:origin"
          asides={asides}
          onOpenAside={handlers.onOpenAside ?? vi.fn()}
          onNavigateToMessage={handlers.onNavigateToMessage ?? vi.fn()}
          onDiveIntoQuestion={handlers.onDiveIntoQuestion}
          onParkQuestion={handlers.onParkQuestion}
          onReferenceClick={handlers.onReferenceClick}
          referenceTitles={{ 'source:paper': 'Attention Is All You Need' }}
        />
      </InlineDivesProvider>
    </div>
  )
}

const row = (name: RegExp) => screen.getByRole('button', { name })

describe('InlineDiveThread', () => {
  beforeEach(() => {
    for (const spy of Object.values(spies)) spy.mockReset()
    spies.onSendMessage.mockResolvedValue(undefined)
    spies.onResolve.mockResolvedValue(undefined)
    spies.onUpdateStatus.mockResolvedValue(undefined)
  })
  afterEach(() => clearAsideDrafts())

  it('starts collapsed as one row with its title and status', () => {
    render(<Harness asides={[dive]} details={{ [dive.id]: { ...dive, messages: transcript } }} />)

    const toggle = row(/learningAsides\.deepDiveRow:Why Jensen applies/)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(toggle).getByText('learningAsides.status.active')).toBeInTheDocument()
    expect(screen.queryByText('Why does that inequality apply?')).toBeNull()
    expect(screen.queryByLabelText('learningAsides.askPlaceholder')).toBeNull()
  })

  it('expands into the transcript with citations and math, and folds again', () => {
    const onReferenceClick = vi.fn()
    const { container } = render(
      <Harness
        asides={[dive]}
        details={{ [dive.id]: { ...dive, messages: transcript } }}
        handlers={{ onReferenceClick }}
      />
    )

    const toggle = row(/learningAsides\.deepDiveRow:Why Jensen applies/)
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Why does that inequality apply?')).toBeInTheDocument()
    expect(container.querySelector('.katex')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Attention Is All You Need' }))
    expect(onReferenceClick).toHaveBeenCalledWith('source', 'paper')
    expect(screen.getByLabelText('learningAsides.askPlaceholder')).toBeInTheDocument()
    for (const action of [
      'learningAsides.wrapUp',
      'learningAsides.saveForLater',
      'learningAsides.discard',
      'learningAsides.openFullHeight',
    ]) {
      expect(screen.getByRole('button', { name: action })).toBeInTheDocument()
    }

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Why does that inequality apply?')).toBeNull()
  })

  it('keeps one dive open at a time', () => {
    const other: LearningAside = { ...dive, id: 'learning_aside:two', title: 'KL term' }
    render(<Harness asides={[dive, other]} />)

    fireEvent.click(row(/Why Jensen applies/))
    fireEvent.click(row(/KL term/))

    expect(row(/Why Jensen applies/)).toHaveAttribute('aria-expanded', 'false')
    expect(row(/KL term/)).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByLabelText('learningAsides.askPlaceholder')).toHaveLength(1)
  })

  it('sends a question with Ctrl+Enter and gives it back if sending fails', async () => {
    spies.onSendMessage.mockRejectedValueOnce(new Error('502'))
    render(<Harness asides={[dive]} initialExpanded={dive.id} />)

    const input = screen.getByLabelText('learningAsides.askPlaceholder')
    fireEvent.change(input, { target: { value: 'Show the algebra' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(spies.onSendMessage).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    expect(spies.onSendMessage).toHaveBeenCalledWith(dive.id, 'Show the algebra')
    expect(input).toHaveValue('')
    await waitFor(() => expect(input).toHaveValue('Show the algebra'))

    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.send' }))
    await waitFor(() => expect(spies.onSendMessage).toHaveBeenCalledTimes(2))
    expect(input).toHaveValue('')
  })

  it('shows the question on its way and that it is being answered', () => {
    render(
      <Harness
        asides={[dive]}
        initialExpanded={dive.id}
        overrides={{ sendingAsideId: dive.id, pendingMessage: 'Why concave?' }}
      />
    )

    expect(screen.getByText('Why concave?')).toBeInTheDocument()
    expect(screen.getByText('common.processing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'learningAsides.send' })).toBeDisabled()
  })

  it('keeps an unsent question when the dive is folded and reopened', () => {
    render(<Harness asides={[dive]} />)

    fireEvent.click(row(/Why Jensen applies/))
    fireEvent.change(screen.getByLabelText('learningAsides.askPlaceholder'), {
      target: { value: 'Half a thought' },
    })
    fireEvent.click(row(/Why Jensen applies/))
    fireEvent.click(row(/Why Jensen applies/))

    expect(screen.getByLabelText('learningAsides.askPlaceholder')).toHaveValue(
      'Half a thought'
    )
  })

  it('wraps up inline from the AI draft', async () => {
    let finish: (draft: LearningResolutionDraft) => void = () => undefined
    spies.onDraftResolution.mockImplementation(
      () =>
        new Promise<LearningResolutionDraft>((resolve) => {
          finish = resolve
        })
    )
    render(
      <Harness
        asides={[dive]}
        details={{ [dive.id]: { ...dive, messages: transcript } }}
        initialExpanded={dive.id}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.wrapUp' }))
    expect(spies.onDraftResolution).toHaveBeenCalledWith(dive.id)
    expect(await screen.findByText('learningAsides.drafting')).toBeInTheDocument()
    // The form takes the place of the question box while it is open.
    expect(screen.queryByLabelText('learningAsides.askPlaceholder')).toBeNull()

    await act(async () =>
      finish({
        conclusion: 'Log is concave [source:paper].',
        relevance: 'It bounds the evidence.',
        open_questions: ['When is it tight?'],
        citations: ['source:paper'],
      })
    )
    expect(
      screen.getByPlaceholderText('learningAsides.conclusionPlaceholder')
    ).toHaveValue('Log is concave.')

    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.resolve' }))
    await waitFor(() =>
      expect(spies.onResolve).toHaveBeenCalledWith(dive.id, {
        conclusion: 'Log is concave.',
        relevance: 'It bounds the evidence.',
        open_questions: ['When is it tight?'],
        citations: ['source:paper'],
        include_in_main: true,
        save_as_note: false,
      })
    )
  })

  it('saves for later, discards and opens full height', async () => {
    const { rerender } = render(<Harness asides={[dive]} initialExpanded={dive.id} />)

    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.saveForLater' }))
    expect(spies.onUpdateStatus).toHaveBeenCalledWith(dive.id, 'parked')
    // Saved for later, the dive folds to its row, which keeps the cursor.
    await waitFor(() =>
      expect(row(/Why Jensen applies/)).toHaveAttribute('aria-expanded', 'false')
    )
    expect(document.activeElement).toBe(row(/Why Jensen applies/))
    fireEvent.click(row(/Why Jensen applies/))

    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.discard' }))
    await waitFor(() =>
      expect(spies.onUpdateStatus).toHaveBeenLastCalledWith(dive.id, 'discarded')
    )

    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.openFullHeight' }))
    expect(spies.onOpenFullHeight).toHaveBeenCalledWith(dive.id)

    // A parked dive can be reopened from its thread.
    rerender(
      <Harness asides={[{ ...dive, status: 'parked' }]} initialExpanded={dive.id} />
    )
    expect(
      within(row(/Why Jensen applies/)).getByText('learningAsides.status.parked')
    ).toBeInTheDocument()
  })

  it('collapses a resolved dive to what was learned and expands to its summary', () => {
    const onNavigateToMessage = vi.fn()
    const onDiveIntoQuestion = vi.fn()
    const onParkQuestion = vi.fn()
    render(
      <Harness
        asides={[resolved]}
        details={{ [resolved.id]: { ...resolved, messages: transcript } }}
        handlers={{ onNavigateToMessage, onDiveIntoQuestion, onParkQuestion }}
      />
    )

    const toggle = row(
      /^learningAsides\.learnedRow:Jensen gives a lower bound because the logarithm…$/
    )
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(toggle).queryByText('learningAsides.status.resolved')).toBeNull()
    expect(screen.queryByText('It justifies the first ELBO step.')).toBeNull()

    fireEvent.click(toggle)
    expect(screen.getByText('learningAsides.summary')).toBeInTheDocument()
    expect(screen.getByText('It justifies the first ELBO step.')).toBeInTheDocument()
    // The transcript stays folded until asked for.
    expect(screen.queryByText('Why does that inequality apply?')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.viewTranscript' }))
    expect(screen.getByText('Why does that inequality apply?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.diveIn' }))
    expect(onDiveIntoQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ id: resolved.id }),
      'Why a Gaussian prior?'
    )
    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.parkQuestion' }))
    expect(onParkQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ id: resolved.id }),
      'Why a Gaussian prior?'
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.viewMergedResponse' })
    )
    expect(onNavigateToMessage).toHaveBeenCalledWith('ai:merged')
    // A resolved dive takes no new questions here.
    expect(screen.queryByLabelText('learningAsides.askPlaceholder')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.resolveAgain' }))
    expect(
      screen.getByPlaceholderText('learningAsides.conclusionPlaceholder')
    ).toHaveValue(
      'Jensen gives a lower bound because the logarithm is concave everywhere.'
    )
    expect(spies.onDraftResolution).not.toHaveBeenCalled()
  })

  it('nests a dive from an open question and opens deeper ones full height', () => {
    const child: LearningAside = {
      ...dive,
      id: 'learning_aside:child',
      parent_aside_id: resolved.id,
      title: 'Why a Gaussian prior?',
      anchor: { type: 'message', content: 'Why a Gaussian prior?' },
    }
    const grandchild: LearningAside = {
      ...dive,
      id: 'learning_aside:grandchild',
      parent_aside_id: child.id,
      title: 'Conjugacy',
      status: 'parked',
      anchor: { type: 'message', content: 'What is conjugacy?' },
    }
    const greatGrandchild: LearningAside = {
      ...dive,
      id: 'learning_aside:deepest',
      parent_aside_id: grandchild.id,
      title: 'Exponential families',
      anchor: { type: 'message', content: 'Exponential families?' },
    }
    render(<Harness asides={[resolved, child, grandchild, greatGrandchild]} />)

    // The child sits under its parent's row, the grandchild under the child.
    const parentThread = row(/learnedRow/).closest('[data-inline-dive]')!
    expect(
      within(parentThread as HTMLElement).getByRole('button', {
        name: /deepDiveRow:Why a Gaussian prior\?/,
      })
    ).toBeInTheDocument()
    // One level of nesting expands inline.
    fireEvent.click(row(/deepDiveRow:Why a Gaussian prior\?/))
    expect(row(/deepDiveRow:Why a Gaussian prior\?/)).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByLabelText('learningAsides.askPlaceholder')).toBeInTheDocument()

    // Deeper dives are rows that open the full-height view.
    const deep = row(/deepDiveRow:Conjugacy/)
    expect(deep).not.toHaveAttribute('aria-expanded')
    expect(within(deep).getByText('learningAsides.openFullHeight')).toHaveClass('sr-only')
    fireEvent.click(deep)
    expect(spies.onOpenFullHeight).toHaveBeenCalledWith(grandchild.id)
    // Nothing nests inline below that.
    expect(screen.queryByText(/Exponential families/)).toBeNull()
  })

  it('quotes the passage a dive was started from', () => {
    const passage: LearningAside = {
      ...dive,
      title: 'The probability that a latent explains',
      anchor: {
        type: 'message',
        message_id: 'ai:origin',
        content: 'The probability that a latent explains $p(x)$ [source:paper].',
        locator: 'selection',
      },
    }
    render(<Harness asides={[passage, { ...dive, id: 'learning_aside:whole' }]} />)

    fireEvent.click(row(/deepDiveRow:The probability that a latent explains/))
    expect(screen.getByText('learningAsides.selectedPassage')).toBeInTheDocument()
    expect(
      screen.getByText('The probability that a latent explains p(x).')
    ).toBeInTheDocument()

    // A dive about the whole answer has no quote.
    fireEvent.click(row(/deepDiveRow:Why Jensen applies/))
    expect(screen.queryByText('learningAsides.selectedPassage')).toBeNull()
  })

  it('says a new dive is opening under its answer', () => {
    render(
      <Harness asides={[]} overrides={{ creating: { messageId: 'ai:origin' } }} />
    )
    expect(screen.getByRole('status')).toHaveTextContent('learningAsides.opening')
  })

  it('shows a dive just created before the journey lists it', () => {
    render(
      <Harness
        asides={[]}
        overrides={{ expandedAsideId: dive.id, activeAside: { ...dive, messages: transcript } }}
      />
    )
    expect(row(/Why Jensen applies/)).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Why does that inequality apply?')).toBeInTheDocument()
  })

  it('scrolls to a dive and focuses its box when asked, then reports back', async () => {
    const attention: DiveAttention = { asideId: dive.id, scroll: 'start', focus: true }
    const { container } = render(
      <Harness
        asides={[dive]}
        initialExpanded={dive.id}
        overrides={{ attention }}
      />
    )
    const scroller = container.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    )!
    scroller.scrollTo = vi.fn()
    const thread = container.querySelector<HTMLElement>('[data-inline-dive]')!
    thread.getBoundingClientRect = () => ({ top: 640, bottom: 700 }) as DOMRect

    await waitFor(() => expect(spies.onAttended).toHaveBeenCalledWith(attention))
    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 640 - 24,
      behavior: 'smooth',
    })
    expect(document.activeElement).toBe(
      screen.getByLabelText('learningAsides.askPlaceholder')
    )
  })

  it('does not grab the cursor again when a focused dive is unfolded later', async () => {
    const attention: DiveAttention = { asideId: dive.id, scroll: null, focus: true }
    const { rerender } = render(
      <Harness asides={[dive]} initialExpanded={dive.id} overrides={{ attention }} />
    )
    const box = () => screen.getByLabelText('learningAsides.askPlaceholder')
    await waitFor(() => expect(document.activeElement).toBe(box()))

    rerender(<Harness asides={[dive]} initialExpanded={dive.id} />)
    fireEvent.click(row(/Why Jensen applies/))
    fireEvent.click(row(/Why Jensen applies/))

    expect(box()).toBeInTheDocument()
    expect(document.activeElement).not.toBe(box())
  })

  it('keeps the clicked row in place when a dive above it folds', () => {
    const above: LearningAside = { ...dive, id: 'learning_aside:above', title: 'Above' }
    const below: LearningAside = { ...dive, id: 'learning_aside:below', title: 'Below' }
    const { container } = render(
      <Harness asides={[above, below]} initialExpanded={above.id} />
    )
    const scroller = container.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    )!
    let scrollTop = 500
    Object.defineProperty(scroller, 'scrollTop', {
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value
      },
    })
    const belowRow = row(/Below/)
    // Folding the dive above moves this row up by 320px.
    const tops = [800, 480]
    belowRow.getBoundingClientRect = () => ({ top: tops.shift() ?? 480 }) as DOMRect

    fireEvent.click(belowRow)

    expect(row(/Above/)).toHaveAttribute('aria-expanded', 'false')
    expect(scrollTop).toBe(500 - 320)
  })

  it('opens the dive by its row outside the notebook chat', () => {
    const onOpenAside = vi.fn()
    render(
      <LearningThreadLinks
        messageId="ai:origin"
        asides={[dive]}
        onOpenAside={onOpenAside}
        onNavigateToMessage={vi.fn()}
      />
    )

    const toggle = row(/Why Jensen applies/)
    expect(toggle).not.toHaveAttribute('aria-expanded')
    fireEvent.click(toggle)
    expect(onOpenAside).toHaveBeenCalledWith(dive.id)
  })
})
