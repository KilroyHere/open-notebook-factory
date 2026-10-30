const TEX_ANNOTATION = 'annotation[encoding="application/x-tex"]'
// Elements that end a paragraph-like block of text.
const BLOCK_ELEMENTS = 'p, h1, h2, h3, h4, h5, h6, pre, blockquote, table'
const LINE_ELEMENTS = 'li, tr'

/**
 * The text of a selection inside a rendered assistant answer, written back
 * the way the answer was: math as `$…$` TeX instead of KaTeX glyphs (and
 * their hidden MathML copy), numbered citations as `[source:id]` markers,
 * and blank lines between paragraphs.
 */
export function selectedPassage(range: Range): string {
  const fragment = range.cloneContents()

  for (const node of Array.from(fragment.querySelectorAll('.katex-display'))) {
    const tex = node.querySelector(TEX_ANNOTATION)?.textContent?.trim()
    if (tex) node.replaceWith(`\n\n$$${tex}$$\n\n`)
  }
  for (const node of Array.from(fragment.querySelectorAll('.katex'))) {
    const tex = node.querySelector(TEX_ANNOTATION)?.textContent?.trim()
    if (tex) {
      node.replaceWith(`$${tex}$`)
    } else {
      // Part of a formula: keep the visible glyphs only.
      for (const copy of Array.from(node.querySelectorAll('.katex-mathml'))) {
        copy.remove()
      }
    }
  }
  for (const node of Array.from(fragment.querySelectorAll('[data-reference]'))) {
    node.replaceWith(`[${node.getAttribute('data-reference')}]`)
  }
  for (const node of Array.from(fragment.querySelectorAll('br'))) {
    node.replaceWith('\n')
  }
  for (const node of Array.from(fragment.querySelectorAll(LINE_ELEMENTS))) {
    node.append('\n')
  }
  for (const node of Array.from(fragment.querySelectorAll(BLOCK_ELEMENTS))) {
    node.append('\n\n')
  }

  return (fragment.textContent ?? '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
