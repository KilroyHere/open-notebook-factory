'use client'

import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import type { LearningUpdate } from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import { leadingWords } from '@/lib/utils/learning-asides'
import { cn } from '@/lib/utils'

/** Send a conclusion with every main-chat message, or leave it out. */
export type SetIncludeInMain = (
  update: Pick<LearningUpdate, 'id' | 'aside_id'>,
  includeInMain: boolean
) => void

/**
 * The "Use in main chat" checkbox of one accepted conclusion. Its accessible
 * name starts with that visible label and adds the conclusion's first words,
 * so a list of them can be told apart. Studio's "What you've learned" and a
 * resolved dive's summary share it.
 */
export function IncludeInMainToggle({
  update,
  onChange,
  describedBy,
  className,
}: {
  update: Pick<LearningUpdate, 'id' | 'aside_id' | 'conclusion' | 'include_in_main'>
  onChange: SetIncludeInMain
  /** ID of a note about this conclusion, read out with the checkbox. */
  describedBy?: string
  className?: string
}) {
  const { t } = useTranslation()
  const id = useId()

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Checkbox
        id={id}
        checked={update.include_in_main}
        onCheckedChange={(checked) => onChange(update, checked === true)}
        aria-label={t('learningAsides.useInMainChatFor', {
          summary: leadingWords(update.conclusion, 12),
        })}
        aria-describedby={describedBy}
      />
      <label htmlFor={id} className="cursor-pointer text-xs font-medium">
        {t('learningAsides.useInMainChat')}
      </label>
    </div>
  )
}
