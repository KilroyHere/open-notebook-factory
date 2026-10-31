import { describe, expect, it } from 'vitest'
import { LearningAside, LearningJourney, LearningUpdate } from '@/lib/types/api'
import {
  buildReferenceTitles,
  canOpenInline,
  childDiveForQuestion,
  childDives,
  currentConclusion,
  diveLineage,
  isPassageDive,
  journeyWithIncludeInMain,
  learnedConclusions,
  leftOutConclusionIds,
  withAside,
  withIncludeInMain,
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

  it('does not take a dive about a selected passage for a question\'s dive', () => {
    const passage = {
      id: 'learning_aside:passage',
      parent_aside_id: 'learning_aside:parent',
      status: 'active',
      anchor: {
        type: 'message',
        message_id: 'ai:dive-1',
        content: 'Why a Gaussian prior?',
        locator: 'selection',
      },
    } as LearningAside

    expect(
      childDiveForQuestion([passage], 'learning_aside:parent', 'Why a Gaussian prior?')
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

  describe('what was learned', () => {
    const v1 = update({
      id: 'learning_update:a1',
      aside_id: 'learning_aside:a',
      version: 1,
      superseded: true,
      conclusion: 'First take.',
    })
    const v2 = update({
      id: 'learning_update:a2',
      aside_id: 'learning_aside:a',
      version: 2,
      conclusion: 'Second take.',
    })
    const resolved = make({
      id: 'learning_aside:a',
      status: 'resolved',
      updates: [v1, v2],
    })
    const leftOut = make({
      id: 'learning_aside:b',
      status: 'resolved',
      updates: [
        update({
          id: 'learning_update:b1',
          aside_id: 'learning_aside:b',
          include_in_main: false,
        }),
      ],
    })
    const asides = [
      resolved,
      leftOut,
      make({ id: 'learning_aside:open', status: 'active' }),
      make({
        id: 'learning_aside:gone',
        status: 'discarded',
        updates: [update({ id: 'learning_update:gone', aside_id: 'learning_aside:gone' })],
      }),
    ]

    it('takes an aside\'s latest version unless a newer one replaced it', () => {
      expect(currentConclusion(resolved)).toBe(v2)
      expect(currentConclusion(make({ updates: [v1] }))).toBeUndefined()
      expect(currentConclusion(make({}))).toBeUndefined()
    })

    it('lists the current conclusion of each resolved aside, in journey order', () => {
      expect(learnedConclusions(asides)).toEqual([
        { aside: resolved, update: v2 },
        { aside: leftOut, update: leftOut.updates[0] },
      ])
    })

    it('counts as learned exactly the listed conclusions main chat uses', () => {
      const included = learnedConclusions(asides).filter(
        ({ update }) => update.include_in_main
      )
      expect(journeyStats(asides).learned).toBe(included.length)
      expect(included).toHaveLength(1)
    })

    it('switches one conclusion everywhere a journey lists it', () => {
      const journey: LearningJourney = {
        id: 'learning_journey:one',
        notebook_id: 'notebook:1',
        main_session_id: 'chat_session:main',
        status: 'active',
        asides,
        updates: [v1, v2, leftOut.updates[0]],
        created: '2026-10-29T00:00:00Z',
        updated: '2026-10-29T00:00:00Z',
      }

      const next = journeyWithIncludeInMain(journey, v2.id, false)

      const included = (updates: LearningUpdate[]) =>
        updates.map((item) => item.include_in_main)
      expect(included(next.asides[0].updates)).toEqual([true, false])
      expect(included(next.updates)).toEqual([true, false, false])
      // Asides without that conclusion keep their identity.
      expect(next.asides[1]).toBe(leftOut)
      expect(journeyStats(next.asides).learned).toBe(0)
      expect(withIncludeInMain([v1], 'learning_update:other', false)).toEqual([v1])
    })

    describe('left out by the context limit', () => {
      const conclusion = (id: string, includeInMain = true) =>
        make({
          id: `learning_aside:${id}`,
          status: 'resolved',
          updates: [
            update({
              id: `learning_update:${id}`,
              aside_id: `learning_aside:${id}`,
              include_in_main: includeInMain,
            }),
          ],
        })
      const learned = learnedConclusions([
        conclusion('kept'),
        conclusion('dropped'),
        conclusion('unchecked', false),
      ])

      it('are the used conclusions the counted context did not keep', () => {
        expect(
          leftOutConclusionIds(learned, new Set(['learning_update:kept']), 1)
        ).toEqual(new Set(['learning_update:dropped']))
      })

      it('are none while nothing is left out or nothing is counted yet', () => {
        expect(leftOutConclusionIds(learned, new Set(), 0).size).toBe(0)
        expect(leftOutConclusionIds(learned, undefined, 1).size).toBe(0)
      })

      it('are none while the count describes other conclusions than the list', () => {
        // Just after a conclusion is switched on, or a new one is resolved,
        // the last count has not seen it yet.
        expect(
          leftOutConclusionIds(
            learnedConclusions([conclusion('kept'), conclusion('dropped'), conclusion('new')]),
            new Set(['learning_update:kept']),
            1
          ).size
        ).toBe(0)
      })
    })
  })
})

describe('buildReferenceTitles', () => {
  it('names insights by the transformation that made them', () => {
    expect(
      buildReferenceTitles(
        [{ id: 'source:paper', title: 'Attention Is All You Need' }],
        [],
        [
          { id: 'source_insight:dense', insight_type: ' Dense Summary ' },
          { id: 'source_insight:blank', insight_type: '  ' },
        ]
      )
    ).toEqual({
      'source:paper': 'Attention Is All You Need',
      'source_insight:dense': 'Dense Summary',
    })
  })

  it("names a listed source's insights after the source and their type", () => {
    expect(
      buildReferenceTitles(
        [
          {
            id: 'source:paper',
            title: 'Attention Is All You Need',
            insights: [
              { id: 'source_insight:dense', insight_type: 'Dense Summary' },
              { id: 'source_insight:blank', insight_type: ' ' },
            ],
          },
          {
            id: 'source:untitled',
            title: null,
            insights: [{ id: 'source_insight:toc', insight_type: 'Table of Contents' }],
          },
        ],
        []
      )
    ).toEqual({
      'source:paper': 'Attention Is All You Need',
      'source_insight:dense': 'Attention Is All You Need · Dense Summary',
      'source_insight:toc': 'Table of Contents',
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

describe('inline dive placement', () => {
  const at = '2026-10-29T00:00:00Z'
  const make = (overrides: Partial<LearningAside>): LearningAside => ({
    id: 'learning_aside:root',
    journey_id: 'learning_journey:one',
    parent_session_id: 'chat_session:main',
    chat_session_id: 'chat_session:x',
    title: 'Dive',
    status: 'active',
    anchor: { type: 'message', message_id: 'ai:1', content: 'Answer' },
    messages: [],
    updates: [],
    created: at,
    updated: at,
    ...overrides,
  })
  const root = make({})
  const child = make({
    id: 'learning_aside:child',
    parent_aside_id: root.id,
    anchor: { type: 'message', content: 'Question?' },
  })
  const grandchild = make({
    id: 'learning_aside:grandchild',
    parent_aside_id: child.id,
    anchor: { type: 'message', content: 'Deeper?' },
  })
  const asides = [root, child, grandchild]
  const answers = new Set(['ai:1'])

  it('finds the dive at the top of a chain and how deep it nests', () => {
    expect(diveLineage(grandchild, asides)).toEqual({ root, depth: 2 })
    expect(diveLineage(root, asides)).toEqual({ root, depth: 0 })
  })

  it('treats a missing, discarded or looping parent as a broken chain', () => {
    expect(diveLineage(child, [child])).toBeNull()
    expect(
      diveLineage(child, [{ ...root, status: 'discarded' }, child])
    ).toBeNull()
    const loop = make({ id: 'a', parent_aside_id: 'b' })
    expect(diveLineage(loop, [loop, make({ id: 'b', parent_aside_id: 'a' })])).toBeNull()
  })

  it('shows a dive inline one level deep under an answer in the chat', () => {
    expect(canOpenInline(root, asides, answers)).toBe(true)
    expect(canOpenInline(child, asides, answers)).toBe(true)
    expect(canOpenInline(grandchild, asides, answers)).toBe(false)
    expect(canOpenInline(root, asides, new Set(['ai:other']))).toBe(false)
    expect(canOpenInline({ ...root, status: 'discarded' }, asides, answers)).toBe(false)
    expect(
      canOpenInline(make({ anchor: { type: 'message', content: 'No answer' } }), asides, answers)
    ).toBe(false)
  })

  it('lists a dive\'s open children and adds a dive the journey lacks', () => {
    expect(
      childDives([...asides, { ...child, id: 'x', status: 'discarded' }], root.id)
    ).toEqual([child])
    expect(withAside([root], child)).toEqual([root, child])
    expect(withAside(asides, child)).toBe(asides)
    expect(withAside(asides)).toBe(asides)
  })

  it('tells a passage dive from a whole-answer dive', () => {
    expect(isPassageDive(root)).toBe(false)
    expect(
      isPassageDive(make({ anchor: { ...root.anchor, locator: 'selection' } }))
    ).toBe(true)
  })
})

