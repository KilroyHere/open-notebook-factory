'use client'

import { AppSidebar } from './AppSidebar'
import { SetupBanner } from './SetupBanner'

interface AppShellProps {
  children: React.ReactNode
  /**
   * Keep the app navigation on its icon rail for this page only, and hide
   * the rail below the `lg` breakpoint so the page gets the whole width. The
   * page then offers the app menu itself (`MobileNavMenu`).
   */
  compactNav?: boolean
}

export function AppShell({ children, compactNav = false }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      {compactNav ? (
        <div data-app-nav="rail" className="hidden h-full shrink-0 lg:flex">
          <AppSidebar forceCollapsed />
        </div>
      ) : (
        <AppSidebar />
      )}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <SetupBanner />
        {children}
      </main>
    </div>
  )
}
