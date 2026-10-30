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

describe('convertReferencesToCompactMarkdown with labels', () => {
  const titles: Record<string, string> = {
    'source:paper': 'Attention Is All You Need',
    'note:n1': 'Margin notes',
  }
  const labels = {
    title: (type: string, id: string) => titles[`${type}:${id}`],
    typeLabel: (type: string) =>
      type === 'note' ? 'Note' : type === 'source' ? 'Source' : 'Insight',
  }

  it('names each reference by its title and keeps the links', () => {
    const result = convertReferencesToCompactMarkdown(
      'Attention [source:paper] scales [note:n1].',
      'References',
      labels
    )
    expect(result).toContain('Attention [1](#ref-source-paper) scales [2](#ref-note-n1).')
    expect(result).toContain(
      'References:\n[1] - [Attention Is All You Need](#ref-source-paper)\n[2] - [Margin notes](#ref-note-n1)'
    )
    expect(result).not.toContain('source:paper]')
  })

  it('numbers untitled references per type instead of showing their IDs', () => {
    const result = convertReferencesToCompactMarkdown(
      'A [source:8cvgg8uul1f5xdm6cq5w] B [source:paper] C [source:other] D [source_insight:i1].',
      'References',
      labels
    )
    expect(result).toContain('[1] - [Source 1](#ref-source-8cvgg8uul1f5xdm6cq5w)')
    expect(result).toContain('[2] - [Attention Is All You Need](#ref-source-paper)')
    expect(result).toContain('[3] - [Source 3](#ref-source-other)')
    expect(result).toContain('[4] - [Insight 1](#ref-source_insight-i1)')
    expect(result).not.toMatch(/- \[source:/)
  })

  it('escapes Markdown in titles so they read literally', () => {
    const result = convertReferencesToCompactMarkdown('See [source:x].', 'References', {
      ...labels,
      title: () => 'Costs in $ and [brackets] *starred*\nnext line',
    })
    expect(result).toContain(
      '[1] - [Costs in \\$ and \\[brackets\\] \\*starred\\* next line](#ref-source-x)'
    )
  })
})
