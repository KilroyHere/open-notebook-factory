'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

import { useThemeStore } from '@/lib/stores/theme-store'
import { KATEX_OPTIONS } from '@/lib/utils/katex-options'
import { oneDark as darkTheme } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneLight as lightTheme } from 'react-syntax-highlighter/dist/esm/styles/prism'
// PrismLight with an explicit language set instead of the full Prism build:
// bundling every refractor grammar costs ~600KB of client JS. Unregistered
// languages fall back to unhighlighted text.
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c'
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp'
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff'
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import kotlin from 'react-syntax-highlighter/dist/esm/languages/prism/kotlin'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import r from 'react-syntax-highlighter/dist/esm/languages/prism/r'
import ruby from 'react-syntax-highlighter/dist/esm/languages/prism/ruby'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import swift from 'react-syntax-highlighter/dist/esm/languages/prism/swift'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'

import { useMemo, type ComponentProps, type ElementType, type ReactNode } from 'react'
import type { ExtraProps, Options } from 'react-markdown'

const LANGUAGES = {
  bash, c, cpp, csharp, css, diff, docker, go, java, javascript, json, jsx,
  kotlin, markdown, markup, php, python, r, ruby, rust, sql, swift, tsx,
  typescript, yaml,
}
for (const [name, language] of Object.entries(LANGUAGES)) {
  SyntaxHighlighter.registerLanguage(name, language)
}

type Components = {
  [Key in Extract<ElementType, string>]?: ElementType<ComponentProps<Key> & ExtraProps>
}

type ChildrenProps = { children?: ReactNode }

// The element overrides are defined once, outside any render. A component
// created during a render is a new type on every render, so React would
// rebuild the whole answer's DOM each time (dropping a text selection in
// it, among other things).
function Paragraph({ children }: ChildrenProps) {
  return <p className="mb-4">{children}</p>
}
function Heading1({ children }: ChildrenProps) {
  return <h1 className="mb-4 mt-6">{children}</h1>
}
function Heading2({ children }: ChildrenProps) {
  return <h2 className="mb-3 mt-5">{children}</h2>
}
function Heading3({ children }: ChildrenProps) {
  return <h3 className="mb-3 mt-4">{children}</h3>
}
function Heading4({ children }: ChildrenProps) {
  return <h4 className="mb-2 mt-4">{children}</h4>
}
function Heading5({ children }: ChildrenProps) {
  return <h5 className="mb-2 mt-3">{children}</h5>
}
function Heading6({ children }: ChildrenProps) {
  return <h6 className="mb-2 mt-3">{children}</h6>
}
function ListItem({ children }: ChildrenProps) {
  return <li className="mb-1">{children}</li>
}
function UnorderedList({ children }: ChildrenProps) {
  return <ul className="mb-4 space-y-1">{children}</ul>
}
function OrderedList({ children }: ChildrenProps) {
  return <ol className="mb-4 space-y-1">{children}</ol>
}
function Table({ children }: ChildrenProps) {
  return (
    <div className="my-4 overflow-x-auto">
      <table className="min-w-full border-collapse border border-border">{children}</table>
    </div>
  )
}
function TableHead({ children }: ChildrenProps) {
  return <thead className="bg-muted">{children}</thead>
}
function TableBody({ children }: ChildrenProps) {
  return <tbody>{children}</tbody>
}
function TableRow({ children }: ChildrenProps) {
  return <tr className="border-b border-border">{children}</tr>
}
function TableHeaderCell({ children }: ChildrenProps) {
  return <th className="border border-border px-3 py-2 text-left font-semibold">{children}</th>
}
function TableCell({ children }: ChildrenProps) {
  return <td className="border border-border px-3 py-2">{children}</td>
}

/** A code block (highlighted in the current theme) or inline code. */
function Code({ children, className }: ChildrenProps & { className?: string }) {
  const { getEffectiveTheme } = useThemeStore()
  const isDark = getEffectiveTheme() === 'dark'
  const match = /language-(\w+)/.exec(className || '')
  const isBlock = match || String(children).includes('\n')
  return isBlock ? (
    <SyntaxHighlighter
      language={match ? match[1] : 'text'}
      style={isDark ? darkTheme : lightTheme}
      PreTag="div"
      className="text-sm border border-border"
    >
      {String(children)}
    </SyntaxHighlighter>
  ) : (
    <code className="bg-border rounded px-1 py-0.5">{children}</code>
  )
}

const BASE_COMPONENTS: Components = {
  p: Paragraph,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  h4: Heading4,
  h5: Heading5,
  h6: Heading6,
  li: ListItem,
  ul: UnorderedList,
  ol: OrderedList,
  table: Table,
  thead: TableHead,
  tbody: TableBody,
  tr: TableRow,
  th: TableHeaderCell,
  td: TableCell,
  code: Code,
}

const REMARK_PLUGINS = [remarkGfm, remarkMath]
const REHYPE_PLUGINS: NonNullable<Options['rehypePlugins']> = [[rehypeKatex, KATEX_OPTIONS]]

/**
 * Markdown with GFM, math and highlighted code. `components` overrides
 * elements; pass components that keep their identity across renders (not
 * ones created during a render), or the overridden elements are rebuilt on
 * every render.
 */
export function MarkdownRenderer({
  children,
  components,
}: {
  children: ReactNode
  components?: Components
}) {
  const allComponents = useMemo(
    () => (components ? { ...BASE_COMPONENTS, ...components } : BASE_COMPONENTS),
    [components]
  )

  return (
    <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none break-words [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-0.5 prose-headings:font-semibold prose-a:text-primary prose-a:break-all prose-code:before:content-none prose-code:after:content-none prose-pre:p-0 prose-pre:bg-transparent prose-p:mb-4 prose-p:leading-7 prose-li:mb-2">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={allComponents}
      >
        {String(children)}
      </ReactMarkdown>
    </div>
  )
}
