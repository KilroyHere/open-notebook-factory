'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/hooks/use-auth'
import { useSidebarStore } from '@/lib/stores/sidebar-store'
import { useCreateDialogs } from '@/lib/hooks/use-create-dialogs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { LanguageToggle } from '@/components/common/LanguageToggle'
import type { TFunction } from 'i18next'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { Separator } from '@/components/ui/separator'
import {
  Book,
  Search,
  Mic,
  Bot,
  Shuffle,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  FileText,
  Plus,
  Wrench,
  Command,
} from 'lucide-react'

const getNavigation = (t: TFunction) => [
  {
    title: t('navigation.collect'),
    items: [
      { name: t('navigation.sources'), href: '/sources', icon: FileText, iconClass: 'text-sage' },
    ],
  },
  {
    title: t('navigation.process'),
    items: [
      { name: t('navigation.notebooks'), href: '/notebooks', icon: Book, iconClass: 'text-teal' },
      { name: t('navigation.askAndSearch'), href: '/search', icon: Search, iconClass: undefined },
    ],
  },
  {
    title: t('navigation.create'),
    items: [
      { name: t('navigation.podcasts'), href: '/podcasts', icon: Mic, iconClass: 'text-mauve' },
    ],
  },
  {
    title: t('navigation.manage'),
    items: [
      { name: t('navigation.models'), href: '/settings/models', icon: Bot, iconClass: undefined },
      { name: t('navigation.transformations'), href: '/transformations', icon: Shuffle, iconClass: undefined },
      { name: t('navigation.settings'), href: '/settings', icon: Settings, iconClass: undefined },
      { name: t('navigation.advanced'), href: '/advanced', icon: Wrench, iconClass: undefined },
    ],
  },
] as const

// The tri-hue mark recomposed in the owned palette: fern / gold / teal.
function LogoPebbles({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-[3px]', className)} aria-hidden="true">
      <span className="size-[9px] rounded-[3px] bg-fern" />
      <span className="size-[9px] rounded-[3px] bg-gold" />
      <span className="size-[9px] rounded-[3px] bg-teal" />
    </span>
  )
}

type CreateTarget = 'source' | 'notebook' | 'podcast'

interface AppSidebarProps {
  /**
   * Show only the icon rail without touching the persisted preference, so a
   * full-width workspace (the notebook page) can claim the space while every
   * other page keeps the sidebar the user chose.
   */
  forceCollapsed?: boolean
  /**
   * The sidebar inside the mobile menu drawer (`MobileNavMenu`): always
   * expanded at any width, without the collapse toggle.
   */
  inDrawer?: boolean
  /** Called when a link or a create action is chosen, e.g. to close the drawer. */
  onNavigate?: () => void
}

export function AppSidebar({
  forceCollapsed = false,
  inDrawer = false,
  onNavigate,
}: AppSidebarProps = {}) {
  const { t } = useTranslation()
  const navigation = getNavigation(t)
  const pathname = usePathname()
  const { logout } = useAuth()
  const { isCollapsed, toggleCollapse } = useSidebarStore()
  const isNarrow = useMediaQuery('(max-width: 767px)')
  const effectiveCollapsed =
    !inDrawer && (isCollapsed || isNarrow || forceCollapsed)
  const { openSourceDialog, openNotebookDialog, openPodcastDialog } = useCreateDialogs()

  // The active item is the longest href that prefixes the current path.
  // Longest-wins keeps `/settings` from also highlighting on `/settings/models`
  // (the Models page is a URL child of the Settings page but a distinct item).
  const activeHref = navigation
    .map((section) => section.items)
    .flat()
    .filter((item) => pathname === item.href || pathname?.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [isMac, setIsMac] = useState(true) // Default to Mac for SSR

  // Detect platform for keyboard shortcut display
  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes('mac'))
  }, [])

  const handleCreateSelection = (target: CreateTarget) => {
    setCreateMenuOpen(false)
    onNavigate?.()

    if (target === 'source') {
      openSourceDialog()
    } else if (target === 'notebook') {
      openNotebookDialog()
    } else if (target === 'podcast') {
      openPodcastDialog()
    }
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'app-sidebar flex flex-col overflow-hidden bg-sidebar border-sidebar-border transition-all duration-300',
          inDrawer
            ? 'min-h-full w-full'
            : cn('h-full max-md:w-16 border-r', effectiveCollapsed ? 'w-16' : 'w-64')
        )}
      >
        <div
          className={cn(
            'flex h-16 items-center group',
            effectiveCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          )}
        >
          {effectiveCollapsed ? (
            <div className="relative flex items-center justify-center w-full">
              <LogoPebbles
                className={cn(
                  'flex-col gap-[3px] transition-opacity',
                  !forceCollapsed && 'group-hover:opacity-0'
                )}
              />
              {!forceCollapsed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleCollapse}
                  className="absolute text-sidebar-foreground hover:bg-sidebar-accent opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5">
                <LogoPebbles />
                <span className="font-display text-[15px] font-bold tracking-tight text-sidebar-foreground">
                  {t('common.appName')}
                </span>
              </div>
              {!inDrawer && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleCollapse}
                  className="text-sidebar-foreground hover:bg-sidebar-accent"
                  data-testid="sidebar-toggle"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>

        <nav
          className={cn(
            'flex-1 space-y-1 py-4',
            effectiveCollapsed ? 'px-2' : 'px-3'
          )}
        >
          <div
            className={cn(
              'mb-4',
              effectiveCollapsed ? 'px-0' : 'px-3'
            )}
          >
            <DropdownMenu open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
              {effectiveCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        onClick={() => setCreateMenuOpen(true)}
                        variant="default"
                        size="sm"
                        className="w-full justify-center px-2 font-display font-bold"
                        aria-label={t('common.create')}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                   <TooltipContent side="right">{t('common.create')}</TooltipContent>
                </Tooltip>
              ) : (
                <DropdownMenuTrigger asChild>
                  <Button
                    onClick={() => setCreateMenuOpen(true)}
                    variant="default"
                    size="sm"
                    className="w-full justify-start font-display font-bold"
                   >
                    <Plus className="h-4 w-4 mr-2" />
                    {t('common.create')}
                  </Button>
                </DropdownMenuTrigger>
              )}

              <DropdownMenuContent
                align={effectiveCollapsed ? 'end' : 'start'}
                side={effectiveCollapsed ? 'right' : 'bottom'}
                className="w-48"
              >
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    handleCreateSelection('source')
                  }}
                  className="gap-2"
                >
                   <FileText className="h-4 w-4" />
                  {t('common.source')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    handleCreateSelection('notebook')
                  }}
                  className="gap-2"
                >
                   <Book className="h-4 w-4" />
                  {t('common.notebook')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    handleCreateSelection('podcast')
                  }}
                  className="gap-2"
                >
                   <Mic className="h-4 w-4" />
                  {t('common.podcast')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {navigation.map((section, index) => (
            <div key={section.title}>
              {index > 0 && (
                <Separator className="my-3" />
              )}
              <div className="space-y-1">
                {!effectiveCollapsed && (
                  <h3 className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/40">
                    {section.title}
                  </h3>
                )}

                {section.items.map((item) => {
                  const isActive = item.href === activeHref
                  const button = (
                    <Button
                      variant="ghost"
                      className={cn(
                        'w-full gap-2.5 text-[13px] font-medium text-sidebar-foreground/80 sidebar-menu-item relative',
                        isActive &&
                          'bg-popover font-semibold text-sidebar-foreground ring-1 ring-inset ring-border before:absolute before:-left-1.5 before:top-[7px] before:bottom-[7px] before:w-[3px] before:rounded-[2px] before:bg-fern',
                        effectiveCollapsed ? 'justify-center px-2' : 'justify-start'
                      )}
                    >
                      <item.icon className={cn('h-4 w-4 opacity-85', item.iconClass)} />
                      {!effectiveCollapsed && <span>{item.name}</span>}
                    </Button>
                  )

                  if (effectiveCollapsed) {
                    return (
                      <Tooltip key={item.name}>
                        <TooltipTrigger asChild>
                          <Link href={item.href} onClick={onNavigate}>
                            {button}
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">{item.name}</TooltipContent>
                      </Tooltip>
                    )
                  }

                  return (
                    <Link key={item.name} href={item.href} onClick={onNavigate}>
                      {button}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div
          className={cn(
            'border-t border-sidebar-border p-3 space-y-2',
            effectiveCollapsed && 'px-2'
          )}
        >
          {/* Command Palette hint */}
          {!effectiveCollapsed && (
            <div className="px-3 py-1.5 text-xs text-sidebar-foreground/60">
              <div className="flex items-center justify-between">
                 <span className="flex items-center gap-1.5">
                  <Command className="h-3 w-3" />
                  {t('common.quickActions')}
                </span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  {isMac ? <span className="text-xs">⌘</span> : <span>Ctrl+</span>}K
                </kbd>
              </div>
               <p className="mt-1 text-[10px] text-sidebar-foreground/40">
                {t('common.quickActionsDesc')}
              </p>
            </div>
          )}

           <div
            className={cn(
              'flex flex-col gap-2',
              effectiveCollapsed ? 'items-center' : 'items-stretch'
            )}
          >
            {effectiveCollapsed ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <ThemeToggle iconOnly />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t('common.theme')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <LanguageToggle iconOnly />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t('common.language')}</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <>
                <ThemeToggle />
                <LanguageToggle />
              </>
            )}
          </div>

          {effectiveCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-center sidebar-menu-item"
                  onClick={logout}
                  aria-label={t('common.signOut')}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
               <TooltipContent side="right">{t('common.signOut')}</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="outline"
              className="w-full justify-start gap-2 sidebar-menu-item"
              onClick={logout}
              aria-label={t('common.signOut')}
             >
              <LogOut className="h-4 w-4" />
              {t('common.signOut')}
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
