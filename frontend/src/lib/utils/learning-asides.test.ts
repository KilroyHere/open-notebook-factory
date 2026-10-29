import { describe, expect, it } from 'vitest'
import {
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
})
