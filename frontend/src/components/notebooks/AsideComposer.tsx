'use client'

import { useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from '@/lib/hooks/use-translation'
import { isSendShortcut, sendShortcutHint } from '@/lib/utils/composer-shortcut'
import { cn } from '@/lib/utils'

/**
 * The question box of a dive. It sends on Ctrl+Enter (⌘+Enter on macOS),
 * like the main chat, and says so in its placeholder.
 */
export function AsideComposer({
  asideId,
  isSending,
  disabled = false,
  onSendMessage,
  className,
}: {
  asideId: string
  isSending: boolean
  /** Blocks typing and sending, e.g. while the transcript loads. */
  disabled?: boolean
  onSendMessage: (asideId: string, message: string) => Promise<unknown>
  className?: string
}) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')

  const send = async () => {
    if (!input.trim() || isSending || disabled) return
    try {
      await onSendMessage(asideId, input.trim())
      setInput('')
    } catch {
      // The mutation owns the translated error toast.
    }
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <Textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={`${t('learningAsides.askPlaceholder')} (${t('chat.pressToSend', { key: sendShortcutHint() })})`}
        aria-label={t('learningAsides.askPlaceholder')}
        className="min-h-[42px] flex-1 resize-none"
        rows={1}
        disabled={isSending || disabled}
        onKeyDown={(event) => {
          if (isSendShortcut(event)) {
            event.preventDefault()
            void send()
          }
        }}
      />
      <Button
        size="icon"
        className="h-[42px] w-[42px]"
        onClick={() => void send()}
        disabled={!input.trim() || isSending || disabled}
        aria-label={t('learningAsides.send')}
      >
        {isSending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
