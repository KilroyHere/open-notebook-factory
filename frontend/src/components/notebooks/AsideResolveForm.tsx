'use client'

import { useId } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { AsideResolution } from '@/lib/hooks/use-aside-resolution'
import { cn } from '@/lib/utils'

/**
 * The wrap-up form: an editable conclusion, why it matters and open
 * questions (prefilled by the AI draft), and where the conclusion goes.
 */
export function AsideResolveForm({
  resolution,
  isResolving,
  isAsideLoading = false,
  className,
}: {
  resolution: AsideResolution
  isResolving: boolean
  isAsideLoading?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const fieldId = useId()
  const { isDrafting } = resolution

  return (
    <div className={cn('space-y-4', className)} aria-busy={isDrafting}>
      {isDrafting && (
        <p role="status" className="flex items-center gap-2 text-sm text-teal">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('learningAsides.drafting')}
        </p>
      )}
      {resolution.draftFailed && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('learningAsides.draftFailed')}
        </p>
      )}
      <div>
        <label
          htmlFor={`${fieldId}-conclusion`}
          className="mb-1.5 block text-sm font-medium"
        >
          {t('learningAsides.conclusion')}
        </label>
        <Textarea
          id={`${fieldId}-conclusion`}
          value={resolution.conclusion}
          onChange={(event) => resolution.setConclusion(event.target.value)}
          placeholder={t('learningAsides.conclusionPlaceholder')}
          rows={5}
          disabled={isDrafting}
        />
      </div>
      <div>
        <label
          htmlFor={`${fieldId}-relevance`}
          className="mb-1.5 block text-sm font-medium"
        >
          {t('learningAsides.relevance')}
        </label>
        <Textarea
          id={`${fieldId}-relevance`}
          value={resolution.relevance}
          onChange={(event) => resolution.setRelevance(event.target.value)}
          placeholder={t('learningAsides.relevancePlaceholder')}
          rows={2}
          disabled={isDrafting}
        />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-sm font-medium">
            {t('learningAsides.openQuestions')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            disabled={isDrafting}
            onClick={resolution.addOpenQuestion}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('learningAsides.addOpenQuestion')}
          </Button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          {t('learningAsides.openQuestionsHint')}
        </p>
        {resolution.openQuestions.length > 0 && (
          <ul className="space-y-2">
            {resolution.openQuestions.map((question, index) => (
              <li key={index} className="flex items-center gap-2">
                <Input
                  value={question}
                  onChange={(event) =>
                    resolution.updateOpenQuestion(index, event.target.value)
                  }
                  placeholder={t('learningAsides.openQuestionPlaceholder')}
                  disabled={isDrafting}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={isDrafting}
                  onClick={() => resolution.removeOpenQuestion(index)}
                  aria-label={t('learningAsides.removeOpenQuestion')}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={resolution.includeInMain}
          onCheckedChange={(checked) =>
            resolution.setIncludeInMain(checked === true)
          }
        />
        {t('learningAsides.includeInMain')}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={resolution.saveAsNote}
          onCheckedChange={(checked) =>
            resolution.setSaveAsNote(checked === true)
          }
        />
        {t('learningAsides.saveAsNote')}
      </label>
      {resolution.saveAsNote && (
        <p className="pl-6 text-xs text-muted-foreground">
          {t('learningAsides.saveAsNoteHint')}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={resolution.cancel}>
          {t('common.cancel')}
        </Button>
        <Button
          onClick={() => void resolution.submit()}
          disabled={
            !resolution.conclusion.trim() ||
            isResolving ||
            isDrafting ||
            isAsideLoading
          }
        >
          {isResolving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('learningAsides.resolve')}
        </Button>
      </div>
    </div>
  )
}
