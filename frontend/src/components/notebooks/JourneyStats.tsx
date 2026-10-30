'use client'

import { CheckCircle2, CircleHelp, Pause } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LearningAside } from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import { journeyStats } from '@/lib/utils/learning-asides'

function Stat({
  icon: Icon,
  iconClassName,
  value,
  label,
}: {
  icon: LucideIcon
  iconClassName: string
  value: number
  label: string
}) {
  return (
    <div className="min-w-0 rounded-md border bg-card px-2 py-1.5">
      <dt className="flex min-w-0 items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <Icon className={`h-3 w-3 shrink-0 ${iconClassName}`} aria-hidden />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-0.5 font-display text-base font-bold tabular-nums">
        {value}
      </dd>
    </div>
  )
}

/** Learned / open questions / saved-for-later counts for one journey. */
export function JourneyStats({ asides }: { asides: LearningAside[] }) {
  const { t } = useTranslation()
  const stats = journeyStats(asides)
  return (
    <dl
      aria-label={t('learningAsides.statsSummary')}
      className="grid grid-cols-3 gap-2 px-4 pt-3"
    >
      <Stat
        icon={CheckCircle2}
        iconClassName="text-fern"
        value={stats.learned}
        label={t('learningAsides.statsLearned')}
      />
      <Stat
        icon={CircleHelp}
        iconClassName="text-teal"
        value={stats.openQuestions}
        label={t('learningAsides.openQuestions')}
      />
      <Stat
        icon={Pause}
        iconClassName="text-muted-foreground"
        value={stats.savedForLater}
        label={t('learningAsides.statsSavedForLater')}
      />
    </dl>
  )
}
