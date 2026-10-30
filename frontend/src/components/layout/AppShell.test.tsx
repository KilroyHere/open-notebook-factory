import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

const { sidebar } = vi.hoisted(() => ({ sidebar: vi.fn() }))

vi.mock('./AppSidebar', () => ({
  AppSidebar: (props: { forceCollapsed?: boolean }) => {
    sidebar(props)
    return <nav aria-label="app nav" />
  },
}))
vi.mock('./SetupBanner', () => ({ SetupBanner: () => null }))

describe('AppShell', () => {
  it('keeps the sidebar on every width by default', () => {
    render(<AppShell>page</AppShell>)

    const nav = screen.getByRole('navigation', { name: 'app nav' })
    expect(nav.closest('[data-app-nav]')).toBeNull()
    expect(nav.parentElement?.className.split(/\s+/)).not.toContain('hidden')
    expect(sidebar).toHaveBeenLastCalledWith({})
  })

  it('shows the compact icon rail only from the lg breakpoint', () => {
    render(<AppShell compactNav>page</AppShell>)

    const rail = screen.getByRole('navigation', { name: 'app nav' }).parentElement!
    expect(rail).toHaveAttribute('data-app-nav', 'rail')
    // Hidden on phones and tablets, where the page offers the menu instead.
    expect(rail.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['hidden', 'lg:flex'])
    )
    expect(sidebar).toHaveBeenLastCalledWith({ forceCollapsed: true })
    expect(screen.getByText('page')).toBeInTheDocument()
  })
})
