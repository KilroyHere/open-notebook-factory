import { describe, expect, it } from 'vitest'
import { LearningAside, LearningUpdate } from '@/lib/types/api'
import {
  childDiveForQuestion,
  createAsideTitle,
  createLearningUpdateDraft,
  documentCitations,
  journeyStats,
  leadingWords,
  stripCitationMarkers,
  toPlainTextPreview,
  normalizeOpenQuestions,
} from './learning-asides'

describe('learning aside text helpers', () => {
  it('creates a concise plain-text title from markdown and math', () => {
    expect(
      createAsideTitle(
        '## Building on our $f(x)=x^2$ example, explain **momentum** in detail and compare convergence.'
      )
    ).toBe(
      'Building on our f(x)=x^2 example, explain momentum in detail and compare…'
    )
  })

  it('keeps identifier underscores while stripping emphasis', () => {
    expect(
      createAsideTitle(
        'Why divide by $\\sqrt{d_k}$ in _scaled_ __dot-product__ attention?'
      )
    ).toBe('Why divide by sqrt d_k in scaled dot-product attention?')
    expect(createAsideTitle('Compare max_len and `d_model` sizes')).toBe(
      'Compare max_len and d_model sizes'
    )
  })

  it('truncates titles on a word boundary', () => {
    const title = createAsideTitle(
      'This answer contains several words that should never be cut through the middle',
      32
    )

    expect(title).toBe('This answer contains several…')
  })

  it('uses the first focused paragraph for the resolution draft', () => {
    expect(
      createLearningUpdateDraft(
        'The useful conclusion is concise.\n\nA much longer derivation follows here.'
      )
    ).toBe('The useful conclusion is concise.')
  })

  it('matches a child dive to its parent question and skips discarded copies', () => {
    const child = {
      id: 'learning_aside:child',
      parent_aside_id: 'learning_aside:parent',
      status: 'active',
      anchor: { type: 'message', content: ' Why a Gaussian prior? ' },
    } as LearningAside
    const discarded = {
      ...child,
      id: 'learning_aside:old',
      status: 'discarded',
    } as LearningAside

    expect(
      childDiveForQuestion(
        [discarded, child],
        'learning_aside:parent',
        'Why a Gaussian prior?'
      )?.id
    ).toBe('learning_aside:child')
    expect(
      childDiveForQuestion([discarded], 'learning_aside:parent', 'Why a Gaussian prior?')
    ).toBeUndefined()
  })

  it('strips citations, markdown and math from one-line previews', () => {
    expect(
      toPlainTextPreview(
        '**Scaled dot-product attention** computes $QK^T / \\sqrt{d_k}$ [source:6tsit42].\n\n- Then a softmax [insight:abc, note:x].'
      )
    ).toBe(
      'Scaled dot-product attention computes QK^T / sqrt d_k. Then a softmax.'
    )
  })

  it('trims, drops blank and de-duplicates open questions in order', () => {
    expect(
      normalizeOpenQuestions([
        ' Why a Gaussian prior? ',
        '',
        '   ',
        'When is the bound tight?',
        'Why a Gaussian prior?',
      ])
    ).toEqual(['Why a Gaussian prior?', 'When is the bound tight?'])
  })
})

describe('citation markers in editable drafts', () => {
  it('lists distinct document citations in first-seen order', () => {
    expect(
      documentCitations(
        'a [source:paper] b [note:margin] [source:paper] [learning_update:x] [source_insight:l]'
      )
    ).toEqual(['source:paper', 'note:margin', 'source_insight:l'])
  })

  it('removes markers but keeps prose, lists and math as written', () => {
    expect(
      stripCitationMarkers(
        'Scores use $\\sqrt{d_k}$ [source:xh9gy] [note:m].\n[source:a] Then\n- item [source:b]\n  - nested'
      )
    ).toBe('Scores use $\\sqrt{d_k}$.\nThen\n- item\n  - nested')
  })
})

describe('journeyStats', () => {
  const update = (overrides: Partial<LearningUpdate> = {}): LearningUpdate => ({
    id: 'learning_update:x',
    aside_id: 'learning_aside:x',
    conclusion: 'A conclusion.',
    open_questions: [],
    citations: [],
    include_in_main: true,
    version: 1,
    created: '2026-10-29T00:00:00Z',
    updated: '2026-10-29T00:00:00Z',
    ...overrides,
  })
  const make = (overrides: Partial<LearningAside>): LearningAside => ({
    id: 'learning_aside:x',
    journey_id: 'learning_journey:one',
    parent_session_id: 'chat_session:main',
    chat_session_id: 'chat_session:x',
    title: 'Aside',
    status: 'active',
    anchor: { type: 'message', content: 'Anchor' },
    messages: [],
    updates: [],
    created: '2026-10-29T00:00:00Z',
    updated: '2026-10-29T00:00:00Z',
    ...overrides,
  })

  it('counts learned, open questions and saved-for-later from the latest updates', () => {
    const asides = [
      // Learned, with two open questions; one already has a child dive.
      make({
        id: 'learning_aside:a',
        status: 'resolved',
        updates: [
          update({ version: 1, superseded: true, open_questions: ['Old?'] }),
          update({ version: 2, open_questions: ['Why?', 'How?', ' '] }),
        ],
      }),
      make({
        id: 'learning_aside:child',
        parent_aside_id: 'learning_aside:a',
        status: 'parked',
        anchor: { type: 'message', content: 'How?' },
      }),
      // Resolved but kept out of main chat: not learned.
      make({
        id: 'learning_aside:b',
        status: 'resolved',
        updates: [update({ include_in_main: false })],
      }),
      // Discarded asides do not count at all.
      make({
        id: 'learning_aside:c',
        status: 'discarded',
        updates: [update({ open_questions: ['Ignored?'] })],
      }),
    ]

    expect(journeyStats(asides)).toEqual({
      learned: 1,
      openQuestions: 1,
      savedForLater: 1,
    })
  })

  it('is all zero for an empty journey', () => {
    expect(journeyStats([])).toEqual({
      learned: 0,
      openQuestions: 0,
      savedForLater: 0,
    })
  })
})

describe('leadingWords', () => {
  it('keeps the first words as plain text and marks the cut', () => {
    expect(
      leadingWords('**Concavity** gives the bound [source:abc] in one short line', 4)
    ).toBe('Concavity gives the bound…')
    expect(leadingWords('Short one.', 4)).toBe('Short one.')
  })
})
