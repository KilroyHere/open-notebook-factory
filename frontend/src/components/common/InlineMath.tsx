'use client'

import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

import { KATEX_OPTIONS } from '@/lib/utils/katex-options'

/**
 * One line of plain text with `$…$` math rendered by KaTeX, for short labels
 * such as open questions where full Markdown blocks would add spacing.
 */
export function InlineMath({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[[rehypeKatex, KATEX_OPTIONS]]}
      components={{ p: ({ children }) => <>{children}</> }}
    >
      {text}
    </ReactMarkdown>
  )
}
