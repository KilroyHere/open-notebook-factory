import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MobileNavMenu } from './MobileNavMenu'

// The sidebar's own behaviour is covered in AppSidebar.test.tsx.
vi.mock('./AppSidebar', () => ({
  AppSidebar: ({
    inDrawer,
    onNavigate,
  }: {
    inDrawer?: boolean
    onNavigate?: () => void
  }) => (
    <nav aria-label={inDrawer ? 'drawer nav' : 'rail nav'}>
      <a href="/podcasts" onClick={(event) => {
        event.preventDefault()
        onNavigate?.()
      }}>
        Podcasts
      </a>
    </nav>
  ),
}))

describe('MobileNavMenu', () => {
  it('opens the app navigation in a drawer and closes it after navigating', async () => {
    render(<MobileNavMenu className="lg:hidden" />)

    const button = screen.getByRole('button', { name: 'navigation.openMenu' })
    expect(button).toHaveClass('lg:hidden')
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(button)
    const drawer = await screen.findByRole('dialog', { name: 'navigation.nav' })
    expect(
      screen.getByRole('navigation', { name: 'drawer nav' })
    ).toBeInTheDocument()
    expect(drawer.className).toContain('left-0')

    fireEvent.click(screen.getByRole('link', { name: 'Podcasts' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
