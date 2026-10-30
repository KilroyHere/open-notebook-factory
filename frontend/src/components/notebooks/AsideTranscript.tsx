'use client'

import { useRef } from 'react'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReferencedMarkdown } from '@/components/common/ReferencedMarkdown'
import { SelectionActions } from '@/components/sources/SelectionActions'
import type { LearningAside, NotebookChatMessage } from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useRevealNewReply } from '@/lib/hooks/use-reveal-new-reply'
import type { ReferenceTitles } from '@/lib/utils/learning-asides'
import { cn } from '@/lib/utils'
import { isOpenDive } from './aside-status'

/**
 * A dive's conversation: the learner's questions and the answers, with
 * numbered citations and math. While the transcript loads it says so; an
 * empty dive explains what to ask, and a nested dive offers to ask the
 * question it was opened for. A learner at the end of the dive sees the
 * question they send and, once it comes, the start of the reply. Selecting
 * part of an answer offers Go deeper and Save to note, like in main chat.
 */
export function AsideTranscript({
  aside,
  isAsideLoading,
  isSending,
  pendingMessage,
  onSendMessage,
  onReferenceClick,
  referenceTitles,
  onGoDeeperOnSelection,
  notebookId,
  className,
}: {
  aside: LearningAside
  isAsideLoading: boolean
  isSending: boolean
  /** The question being sent, shown until the reply arrives. */
  pendingMessage?: string | null
  onSendMessage: (asideId: string, message: string) => Promise<unknown>
  onReferenceClick?: (type: string, id: string) => void
  referenceTitles?: ReferenceTitles
  /** "Go deeper" on a passage selected in one of the answers. */
  onGoDeeperOnSelection?: (message: NotebookChatMessage, passage: string) => void
  /** Where "Save to note" on a selected passage saves it. */
  notebookId?: string
  className?: string
}) {
  const { t } = useTranslation()
  const transcriptRef = useRef<HTMLDivElement>(null)
  useRevealNewReply({
    transcriptRef,
    asideId: aside.id,
    messages: aside.messages,
    waiting: isSending || Boolean(pendingMessage),
    ready: !isAsideLoading,
  })
  const empty = aside.messages.length === 0 && !pendingMessage

  return (
    <div
      ref={transcriptRef}
      data-dive-transcript
      className={cn('min-w-0 space-y-4', className)}
    >
      {empty ? (
        isAsideLoading ? (
          // Journey listings carry asides without transcripts; the detail
          // query fills them in, so wait before calling the aside empty.
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('common.loading')}
          </p>
        ) : isSending ? null : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t('learningAsides.askHint')}
            </p>
            {aside.parent_aside_id &&
              !aside.anchor.message_id &&
              isOpenDive(aside.status) && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isAsideLoading}
                  onClick={() =>
                    void onSendMessage(aside.id, aside.anchor.content).catch(
                      () => undefined
                    )
                  }
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {t('learningAsides.askThisQuestion')}
                </Button>
              )}
          </div>
        )
      ) : (
        <>
          {aside.messages.map((message) => (
            <TranscriptMessage
              key={message.id}
              type={message.type}
              content={message.content}
              onReferenceClick={onReferenceClick}
              referenceTitles={referenceTitles}
              // The nested dive is anchored to this answer by its ID.
              onGoDeeper={
                onGoDeeperOnSelection && message.id
                  ? (passage) => onGoDeeperOnSelection(message, passage)
                  : undefined
              }
              notebookId={notebookId}
            />
          ))}
          {pendingMessage && (
            <TranscriptMessage type="human" content={pendingMessage} />
          )}
        </>
      )}
      {isSending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.processing')}
        </div>
      )}
    </div>
  )
}

function TranscriptMessage({
  type,
  content,
  onReferenceClick,
  referenceTitles,
  onGoDeeper,
  notebookId,
}: {
  type: string
  content: string
  onReferenceClick?: (type: string, id: string) => void
  referenceTitles?: ReferenceTitles
  onGoDeeper?: (passage: string) => void
  notebookId?: string
}) {
  return (
    // TRANSCRIPT_MESSAGE_ATTRIBUTE: how a new reply is found to reveal it.
    <div
      data-transcript-message=""
      className={`flex ${type === 'human' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`min-w-0 max-w-[88%] overflow-hidden break-words rounded-md border px-3 py-2 text-sm [&_*]:max-w-full ${
          type === 'human' ? 'bg-muted' : 'bg-card'
        }`}
      >
        {type === 'ai' ? (
          <SelectionActions onGoDeeper={onGoDeeper} notebookId={notebookId}>
            <ReferencedMarkdown
              content={content}
              onReferenceClick={onReferenceClick}
              referenceTitles={referenceTitles}
            />
          </SelectionActions>
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}
      </div>
    </div>
  )
}
