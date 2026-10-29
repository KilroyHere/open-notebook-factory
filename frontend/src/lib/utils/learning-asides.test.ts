import { describe, expect, it } from 'vitest'
import { LearningAside } from '@/lib/types/api'
import {
  childDiveForQuestion,
  createAsideTitle,
  createLearningUpdateDraft,
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
})
