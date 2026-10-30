import { afterEach, describe, expect, it } from 'vitest'
import { selectedPassage } from './text-selection'

function render(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

const katex = (tex: string, glyphs: string) =>
  `<span class="katex"><span class="katex-mathml"><math><semantics><mrow>${glyphs}</mrow>` +
  `<annotation encoding="application/x-tex">${tex}</annotation></semantics></math></span>` +
  `<span class="katex-html" aria-hidden="true">${glyphs}</span></span>`

describe('selectedPassage', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('writes math as TeX, citations as markers and paragraphs apart', () => {
    const root = render(
      `<p>Scores are divided by ${katex('\\sqrt{d_k}', 'dk')} first ` +
        `<button data-reference="source:paper">1</button>.</p>` +
        `<span class="katex-display">${katex('QK^T', 'QKT')}</span>` +
        `<ul><li>One</li><li>Two</li></ul><p>Last<br>line</p>`
    )
    const range = document.createRange()
    range.selectNodeContents(root)

    expect(selectedPassage(range)).toBe(
      'Scores are divided by $\\sqrt{d_k}$ first [source:paper].\n\n' +
        '$$QK^T$$\n\nOne\nTwo\nLast\nline'
    )
  })

  it('gives the whole formula when a selection takes in its start', () => {
    const root = render(`<p>Bound ${katex('\\log p(x)', 'logp(x)')}</p>`)
    const glyphs = root.querySelector('.katex-html')!.firstChild!
    const range = document.createRange()
    range.setStart(root.querySelector('p')!.firstChild!, 0)
    range.setEnd(glyphs, 3)

    expect(selectedPassage(range)).toBe('Bound $\\log p(x)$')
  })

  it('keeps only the visible glyphs when a selection starts inside a formula', () => {
    const root = render(`<p>${katex('\\log p(x)', 'logp(x)')} is concave</p>`)
    const glyphs = root.querySelector('.katex-html')!.firstChild!
    const range = document.createRange()
    range.setStart(glyphs, 3)
    range.setEnd(root.querySelector('p')!.lastChild!, 3)

    expect(selectedPassage(range)).toBe('p(x) is')
  })

  it('returns the plain words of a simple selection', () => {
    const root = render('<p>The probability that a latent explains the data.</p>')
    const text = root.querySelector('p')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 4)
    range.setEnd(text, 15)

    expect(selectedPassage(range)).toBe('probability')
  })
})
