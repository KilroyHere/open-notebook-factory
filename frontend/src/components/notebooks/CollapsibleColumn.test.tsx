import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PanelRight } from 'lucide-react'
import { CollapseColumnButton, CollapsibleColumn } from './CollapsibleColumn'

// Interpolate values so a label shows which column it names.
vi.mock('@/lib/hooks/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join('|')}` : key,
    language: 'en-US',
    setLanguage: vi.fn(),
  }),
}))

// Show tooltip text in place, so its wording can be checked without hovering.
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div role="tooltip">{children}</div>
  ),
}))

describe('CollapsibleColumn', () => {
  it('collapses to a rail whose button names the column it expands', () => {
    const onToggle = vi.fn()
    render(
      <CollapsibleColumn
        isCollapsed
        onToggle={onToggle}
        collapsedIcon={PanelRight}
        collapsedLabel="Studio"
      >
        <p>Column body</p>
      </CollapsibleColumn>
    )

    // The accessible name starts with the action and includes the visible label.
    const expand = screen.getByRole('button', { name: 'notebooks.expandColumn:Studio' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(expand).toHaveTextContent('Studio')
    expect(screen.getByRole('tooltip')).toHaveTextContent('notebooks.expandColumn:Studio')
    expect(screen.queryByText('Column body')).toBeNull()

    fireEvent.click(expand)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('shows the column while it is expanded', () => {
    render(
      <CollapsibleColumn
        isCollapsed={false}
        onToggle={vi.fn()}
        collapsedIcon={PanelRight}
        collapsedLabel="Studio"
      >
        <p>Column body</p>
      </CollapsibleColumn>
    )

    expect(screen.getByText('Column body')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('CollapseColumnButton', () => {
  it('names the column it collapses and does not reach the header under it', () => {
    const onToggle = vi.fn()
    const onHeaderClick = vi.fn()
    render(
      <div onClick={onHeaderClick}>
        <CollapseColumnButton onToggle={onToggle} label="Sources" />
      </div>
    )

    const collapse = screen.getByRole('button', {
      name: 'notebooks.collapseColumn:Sources',
    })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'notebooks.collapseColumn:Sources'
    )

    fireEvent.click(collapse)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onHeaderClick).not.toHaveBeenCalled()
  })
})
