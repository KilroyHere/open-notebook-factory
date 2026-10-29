'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getDateLocale } from '@/lib/utils/date-locale'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BaseChatSession } from '@/lib/types/api'
import { useModels } from '@/lib/hooks/use-models'

interface SessionManagerProps {
  sessions: BaseChatSession[]
  currentSessionId: string | null
  onCreateSession: (title: string) => void
  onSelectSession: (sessionId: string) => void
  onUpdateSession: (sessionId: string, title: string) => void
  onDeleteSession: (sessionId: string) => void
  loadingSessions: boolean
}

export function SessionManager({
  sessions,
  currentSessionId,
  onCreateSession,
  onSelectSession,
  onUpdateSession,
  onDeleteSession,
  loadingSessions
}: SessionManagerProps) {
  const { t, language } = useTranslation()
  const [isCreating, setIsCreating] = useState(false)
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const { data: models } = useModels()

  // Helper to get model name from ID
  const customModelLabel = t('common.customModel')
  const getModelName = useMemo(() => {
    return (modelId: string) => {
      const model = models?.find(m => m.id === modelId)
      return model?.name || customModelLabel
    }
  }, [models, customModelLabel])

  const handleCreateSession = () => {
    if (newSessionTitle.trim()) {
      onCreateSession(newSessionTitle.trim())
      setNewSessionTitle('')
      setIsCreating(false)
    }
  }

  const handleStartEdit = (session: BaseChatSession) => {
    setEditingId(session.id)
    setEditTitle(session.title)
  }

  const handleSaveEdit = () => {
    if (editingId && editTitle.trim()) {
      onUpdateSession(editingId, editTitle.trim())
      setEditingId(null)
      setEditTitle('')
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirmId) {
      onDeleteSession(deleteConfirmId)
      setDeleteConfirmId(null)
    }
  }

  return (
    <>
      <div className="flex max-h-[70vh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b py-3 pl-4 pr-12">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <MessageSquare className="h-4 w-4 shrink-0 text-teal" />
            {t('chat.sessionsTitle')}
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="h-4 w-4" />
            {t('common.create')}
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-3">
            {isCreating && (
              <form
                className="space-y-2 rounded-md border p-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  handleCreateSession()
                }}
              >
                <Input
                  value={newSessionTitle}
                  onChange={(e) => setNewSessionTitle(e.target.value)}
                  placeholder={t('chat.sessionTitlePlaceholder')}
                  aria-label={t('chat.sessionTitlePlaceholder')}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" type="submit">
                    {t('common.create')}
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreating(false)
                      setNewSessionTitle('')
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </form>
            )}

            {loadingSessions ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t('common.loading')}
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <p className="text-sm">{t('chat.noSessions')}</p>
                <p className="mt-1 text-xs">{t('chat.createToStart')}</p>
              </div>
            ) : (
              sessions.map((session) => {
                const current = currentSessionId === session.id
                const details = [
                  formatDistanceToNow(new Date(session.created), {
                    addSuffix: true,
                    locale: getDateLocale(language),
                  }),
                  session.message_count
                    ? t('chat.messagesCount', { count: session.message_count })
                    : null,
                  session.model_override
                    ? getModelName(session.model_override)
                    : null,
                ].filter(Boolean)
                return (
                  <div
                    key={session.id}
                    className={cn(
                      'flex items-start gap-2 rounded-md border p-2',
                      current ? 'border-teal bg-teal-tint' : 'bg-card'
                    )}
                  >
                    {editingId === session.id ? (
                      <form
                        className="min-w-0 flex-1 space-y-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          handleSaveEdit()
                        }}
                      >
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') handleCancelEdit()
                          }}
                          aria-label={t('common.edit')}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button size="sm" type="submit">
                            <Check className="h-3.5 w-3.5" />
                            {t('common.save')}
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={handleCancelEdit}
                          >
                            <X className="h-3.5 w-3.5" />
                            {t('common.cancel')}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="min-w-0 flex-1 rounded-sm px-1 py-0.5 text-left"
                          aria-current={current ? 'true' : undefined}
                          onClick={() => onSelectSession(session.id)}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {session.title}
                            </span>
                            {current && (
                              <Badge variant="outline" className="shrink-0">
                                {t('common.current')}
                              </Badge>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {details.join(' · ')}
                          </span>
                        </button>
                        <div className="flex shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            aria-label={t('common.edit')}
                            onClick={() => handleStartEdit(session)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            aria-label={t('chat.deleteSession')}
                            onClick={() => setDeleteConfirmId(session.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chat.deleteSession')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('chat.deleteSessionDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}