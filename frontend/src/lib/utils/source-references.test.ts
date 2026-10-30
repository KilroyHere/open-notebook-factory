import { describe, expect, it } from 'vitest'

import {
  convertReferencesToCompactMarkdown,
  stripInternalCitations,
} from './source-references'

describe('stripInternalCitations', () => {
  it('drops a bracket that only cites an internal learning record', () => {
    expect(
      stripInternalCitations('Softmax saturates [learning_updates]. Then [learning_update:abc12345].')
    ).toBe('Softmax saturates. Then.')
  })

  it('keeps real citations that share a bracket with an internal one', () => {
    expect(stripInternalCitations('Gradients vanish [source:abc, learning_updates].')).toBe(
      'Gradients vanish [source:abc].'
    )
    expect(stripInternalCitations('Gradients vanish [learning_update:x1, note:n2].')).toBe(
      'Gradients vanish [note:n2].'
    )
  })

  it('leaves ordinary text and citations untouched', () => {
    const text = 'The learning_updates table stores [source:abc] and [note:xyz].'
    expect(stripInternalCitations(text)).toBe(text)
  })
})

describe('convertReferencesToCompactMarkdown', () => {
  it('numbers real citations without listing internal records', () => {
    const result = convertReferencesToCompactMarkdown(
      'Saturation [source:abc, learning_updates] stalls learning [learning_updates].'
    )
    expect(result).not.toContain('learning_updates')
    expect(result).toContain('[1](#ref-source-abc)')
    expect(result).toContain('References:\n[1] - [source:abc](#ref-source-abc)')
  })
})
