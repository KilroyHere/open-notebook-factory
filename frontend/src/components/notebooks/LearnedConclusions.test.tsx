import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LearnedConclusions } from './LearnedConclusions'
import type { LearningAside, LearningUpdate } from '@/lib/types/api'

// Interpolate values so each switch's accessible name names its conclusion.
vi.mock('@/lib/hooks/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join('|')}` : key,
    language: 'en-US',
    setLanguage: vi.fn(),
  }),
}))

const created = '2026-10-29T00:00:00Z'

function update(overrides: Partial<LearningUpdate>): LearningUpdate {
  return {
    id: 'learning_update:x',
    aside_id: 'learning_aside:x',
    conclusion: 'A conclusion.',
    open_questions: [],
    citations: [],
    include_in_main: true,
    version: 1,
    created,
    updated: created,
    ...overrides,
  }
}

function aside(overrides: Partial<LearningAside>): LearningAside {
  return {
    id: 'learning_aside:x',
    journey_id: 'learning_journey:one',
    parent_session_id: 'chat_session:main',
    chat_session_id: 'chat_session:x',
    title: 'Aside',
    status: 'resolved',
    anchor: { type: 'message', message_id: 'ai:1', content: 'Answer' },
    messages: [],
    updates: [],
    created,
    updated: created,
    ...overrides,
  }
}

const jensen = aside({
  id: 'learning_aside:jensen',
  title: 'Why Jensen applies',
  updates: [
    update({
      id: 'learning_update:old',
      aside_id: 'learning_aside:jensen',
      conclusion: 'An earlier take on the bound.',
      superseded: true,
    }),
    update({
      id: 'learning_update:jensen',
      aside_id: 'learning_aside:jensen',
      version: 2,
      conclusion: '**Jensen** gives a lower bound because $\\log$ is concave [source:paper].',
    }),
  ],
})
const prior = aside({
  id: 'learning_aside:prior',
  title: 'Gaussian prior',
  updates: [
    update({
      id: 'learning_update:prior',
      aside_id: 'learning_aside:prior',
      conclusion: 'A Gaussian prior keeps the KL term closed form.',
      include_in_main: false,
    }),
  ],
})
const open = aside({
  id: 'learning_aside:open',
  title: 'Still exploring',
  status: 'active',
})
const discarded = aside({
  id: 'learning_aside:gone',
  title: 'Thrown away',
  status: 'discarded',
  updates: [update({ id: 'learning_update:gone', conclusion: 'Not kept.' })],
})

function renderSection(
  props: Partial<Parameters<typeof LearnedConclusions>[0]> = {}
) {
  const handlers = { onOpenAside: vi.fn(), onSetIncludeInMain: vi.fn() }
  render(
    <LearnedConclusions
      asides={[jensen, prior, open, discarded]}
      {...handlers}
      {...props}
    />
  )
  return handlers
}

describe('LearnedConclusions', () => {
  it('lists the current conclusion of each resolved dive, as plain text', () => {
    renderSection()

    const section = screen.getByRole('region', {
      name: 'learningAsides.whatYouLearned',
    })
    const items = within(section).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent(
      'Jensen gives a lower bound because log is concave.'
    )
    expect(items[1]).toHaveTextContent('A Gaussian prior keeps the KL term closed form.')
    // Superseded versions, open dives and discarded dives are not listed.
    expect(screen.queryByText(/An earlier take/)).toBeNull()
    expect(screen.queryByText(/Still exploring/)).toBeNull()
    expect(screen.queryByText(/Not kept/)).toBeNull()
  })

  it('names each switch after its conclusion and shows whether main chat uses it', () => {
    renderSection()

    const switches = screen.getAllByRole('checkbox')
    expect(switches).toHaveLength(2)
    expect(switches[0]).toHaveAccessibleName(
      'learningAsides.useInMainChatFor:Jensen gives a lower bound because log is concave.'
    )
    expect(switches[0]).toBeChecked()
    expect(switches[1]).toHaveAccessibleName(
      'learningAsides.useInMainChatFor:A Gaussian prior keeps the KL term closed form.'
    )
    expect(switches[1]).not.toBeChecked()
    // The visible label says what it does next to every switch.
    expect(screen.getAllByText('learningAsides.useInMainChat')).toHaveLength(2)
  })

  it('switches a conclusion out of main chat and back in', () => {
    const { onSetIncludeInMain } = renderSection()

    fireEvent.click(
      screen.getByRole('checkbox', { name: /Jensen gives a lower bound/ })
    )
    expect(onSetIncludeInMain).toHaveBeenLastCalledWith(jensen.updates[1], false)

    // The visible label works as well as the box.
    fireEvent.click(screen.getAllByText('learningAsides.useInMainChat')[1])
    expect(onSetIncludeInMain).toHaveBeenLastCalledWith(prior.updates[0], true)
  })

  it('opens the dive a conclusion came from', () => {
    const { onOpenAside } = renderSection()

    fireEvent.click(screen.getByRole('button', { name: /Gaussian prior keeps/ }))

    expect(onOpenAside).toHaveBeenCalledWith(prior.id)
  })

  it('says how many conclusions the context limit left out, only when some are', () => {
    const { rerender } = render(
      <LearnedConclusions asides={[jensen, prior]} omitted={2} onOpenAside={vi.fn()} />
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'learningAsides.conclusionsLeftOut:2'
    )

    rerender(
      <LearnedConclusions asides={[jensen, prior]} omitted={0} onOpenAside={vi.fn()} />
    )
    // The live region stays, empty, so a later count is announced.
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.queryByText(/conclusionsLeftOut/)).toBeNull()
  })

  it('marks each conclusion the context limit leaves out', () => {
    const kl = aside({
      id: 'learning_aside:kl',
      title: 'KL term',
      updates: [
        update({
          id: 'learning_update:kl',
          aside_id: 'learning_aside:kl',
          conclusion: 'The KL term keeps the posterior near the prior.',
        }),
      ],
    })
    render(
      <LearnedConclusions
        asides={[jensen, prior, kl]}
        omitted={1}
        keptUpdateIds={new Set(['learning_update:kl'])}
        onOpenAside={vi.fn()}
        onSetIncludeInMain={vi.fn()}
      />
    )

    const [leftOut, unchecked, kept] = screen.getAllByRole('listitem')
    expect(
      within(leftOut).getByText('learningAsides.leftOutOfMainChat')
    ).toBeInTheDocument()
    // An unchecked conclusion is not sent anyway, and a kept one is sent.
    expect(within(unchecked).queryByText('learningAsides.leftOutOfMainChat')).toBeNull()
    expect(within(kept).queryByText('learningAsides.leftOutOfMainChat')).toBeNull()
    // The conclusion and its switch say it to screen readers too.
    expect(within(leftOut).getByRole('button')).toHaveAccessibleDescription(
      'learningAsides.leftOutOfMainChat'
    )
    expect(within(leftOut).getByRole('checkbox')).toHaveAccessibleDescription(
      'learningAsides.leftOutOfMainChat'
    )
    expect(within(kept).getByRole('checkbox')).not.toHaveAccessibleDescription()
    // The note with the count stays.
    expect(screen.getByRole('status')).toHaveTextContent(
      'learningAsides.conclusionsLeftOut:1'
    )
  })

  it('marks nothing while nothing is left out', () => {
    render(
      <LearnedConclusions
        asides={[jensen, prior]}
        omitted={0}
        keptUpdateIds={new Set()}
        onOpenAside={vi.fn()}
      />
    )

    expect(screen.queryByText('learningAsides.leftOutOfMainChat')).toBeNull()
  })

  it('is read-only without a way to change it, and absent with nothing learned', () => {
    const { unmount } = render(
      <LearnedConclusions asides={[jensen]} onOpenAside={vi.fn()} />
    )
    expect(screen.getByRole('region')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
    unmount()

    render(
      <LearnedConclusions asides={[open, discarded]} onOpenAside={vi.fn()} />
    )
    expect(screen.queryByRole('region')).toBeNull()
  })
})
