'use client'

import { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ChevronLeft, ChevronRight, LucideIcon } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface CollapsibleColumnProps {
  isCollapsed: boolean
  onToggle: () => void
  collapsedIcon: LucideIcon
  collapsedLabel: string
  children: ReactNode
}

/**
 * A notebook column that folds to a narrow rail. The rail is one button
 * that shows the column's name and expands it again; its accessible name
 * and tooltip say "Expand <name>".
 */
export function CollapsibleColumn({
  isCollapsed,
  onToggle,
  collapsedIcon: CollapsedIcon,
  collapsedLabel,
  children,
}: CollapsibleColumnProps) {
  const { t } = useTranslation()
  const isCJK = /[一-龥぀-ヿ가-힯]/.test(collapsedLabel);

  if (isCollapsed) {
    const expandLabel = t('notebooks.expandColumn', { name: collapsedLabel })
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggle}
              className={cn(
                'flex min-h-0 flex-1 flex-col items-center justify-center gap-3',
                'h-full w-12',
                'border rounded-lg',
                'bg-card hover:bg-accent/50',
                'transition-all duration-150',
                'cursor-pointer group',
                'py-6'
              )}
              aria-label={expandLabel}
              aria-expanded={false}
            >
              <CollapsedIcon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              <div
                className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap"
                style={{ writingMode: 'vertical-rl', transform: isCJK ? 'none' : 'rotate(180deg)', textOrientation: 'mixed' }}
              >
                {collapsedLabel}
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{expandLabel}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col transition-all duration-150">
      {children}
    </div>
  )
}

/**
 * The button in a column's header that folds it to its rail (wide screens
 * only); its accessible name and tooltip say "Collapse <label>".
 */
export function CollapseColumnButton({
  onToggle,
  label,
  side = 'left',
}: {
  onToggle: () => void
  label: string
  /** The side of the page the column sits on, which its chevron points to. */
  side?: 'left' | 'right'
}) {
  const { t } = useTranslation()
  const Icon = side === 'right' ? ChevronRight : ChevronLeft
  const collapseLabel = t('notebooks.collapseColumn', { name: label })
  return (
    <div className="hidden lg:block">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
              className="h-7 w-7 hover:bg-accent"
              aria-label={collapseLabel}
              aria-expanded
            >
              <Icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{collapseLabel}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
