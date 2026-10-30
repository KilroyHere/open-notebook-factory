'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  LearningAside,
  LearningResolutionDraft,
  ResolveLearningAsideRequest,
} from '@/lib/types/api'
import {
  createLearningUpdateDraft,
  documentCitations,
  normalizeOpenQuestions,
  stripCitationMarkers,
} from '@/lib/utils/learning-asides'

interface UseAsideResolutionParams {
  /** The dive being wrapped up; without one the form stays closed. */
  aside?: LearningAside
  /** Model-drafted resolution; on failure the form starts from a local draft. */
  onDraftResolution?: (asideId: string) => Promise<LearningResolutionDraft>
  onResolve: (
    asideId: string,
    data: ResolveLearningAsideRequest
  ) => Promise<unknown>
  isResolving: boolean
}

/**
 * The form that wraps a dive up into an approved learning update: the AI
 * draft request, the editable fields and the submit. The inline dive thread
 * and the full-height dive view share it, so both behave the same.
 */
export function useAsideResolution({
  aside,
  onDraftResolution,
  onResolve,
  isResolving,
}: UseAsideResolutionParams) {
  const [isOpen, setIsOpen] = useState(false)
  const [conclusion, setConclusion] = useState('')
  const [relevance, setRelevance] = useState('')
  const [openQuestions, setOpenQuestions] = useState<string[]>([])
  // Citations the prefilled text relied on. The fields show no raw
  // `[source:id]` markers, so the evidence travels here and is sent on resolve.
  const [draftCitations, setDraftCitations] = useState<string[]>([])
  const [isDrafting, setIsDrafting] = useState(false)
  const [draftFailed, setDraftFailed] = useState(false)
  const [includeInMain, setIncludeInMain] = useState(true)
  const [saveAsNote, setSaveAsNote] = useState(false)
  // Each draft request gets a number; a reply for an older one is ignored.
  const draftRequest = useRef(0)

  const asideId = aside?.id
  const status = aside?.status
  // Another dive, or a new status (resolved, discarded), closes the form.
  useEffect(() => {
    draftRequest.current += 1
    setIsDrafting(false)
    setDraftFailed(false)
    setIsOpen(false)
  }, [asideId, status])

  const latestAnswerContent =
    [...(aside?.messages ?? [])]
      .reverse()
      .find((message) => message.type === 'ai')?.content ?? ''
  const latestAnswerDraft = createLearningUpdateDraft(latestAnswerContent)
  const latestUpdate = aside?.updates.at(-1)

  // Fill the form without raw citation markers, keeping their citations.
  const prefill = (
    draft: {
      conclusion: string
      relevance?: string | null
      citations?: string[]
    },
    questions: string[] = []
  ) => {
    setConclusion(stripCitationMarkers(draft.conclusion))
    setRelevance(stripCitationMarkers(draft.relevance ?? ''))
    setOpenQuestions(questions.map(stripCitationMarkers))
    setDraftCitations(
      Array.from(
        new Set([
          ...(draft.citations ?? []),
          ...documentCitations(`${draft.conclusion}\n${draft.relevance ?? ''}`),
        ])
      )
    )
  }

  const start = async () => {
    if (!aside) return
    const requestId = ++draftRequest.current
    setIsOpen(true)
    setDraftFailed(false)
    if (aside.status === 'resolved' && latestUpdate) {
      // Updating a resolution starts from what the learner already approved.
      prefill(latestUpdate, latestUpdate.open_questions)
      return
    }
    if (!onDraftResolution || !latestAnswerContent.trim()) {
      prefill({ conclusion: latestAnswerDraft })
      return
    }
    prefill({ conclusion: '' })
    setIsDrafting(true)
    try {
      const draft = await onDraftResolution(aside.id)
      if (requestId !== draftRequest.current) return
      prefill(
        { ...draft, conclusion: draft.conclusion.trim() || latestAnswerDraft },
        normalizeOpenQuestions(draft.open_questions ?? [])
      )
    } catch {
      if (requestId !== draftRequest.current) return
      prefill({ conclusion: latestAnswerDraft })
      setDraftFailed(true)
    } finally {
      if (requestId === draftRequest.current) setIsDrafting(false)
    }
  }

  const cancel = () => {
    draftRequest.current += 1
    setIsDrafting(false)
    setIsOpen(false)
  }

  const addOpenQuestion = () => {
    setOpenQuestions((questions) => [...questions, ''])
  }

  const updateOpenQuestion = (index: number, value: string) => {
    setOpenQuestions((questions) =>
      questions.map((question, position) =>
        position === index ? value : question
      )
    )
  }

  const removeOpenQuestion = (index: number) => {
    setOpenQuestions((questions) =>
      questions.filter((_, position) => position !== index)
    )
  }

  const submit = async () => {
    if (!aside || !conclusion.trim() || isResolving || isDrafting) return
    // The draft's citations plus any the learner typed into the fields.
    const citations = Array.from(
      new Set([
        ...draftCitations,
        ...documentCitations(`${conclusion}\n${relevance}`),
      ])
    )
    try {
      await onResolve(aside.id, {
        conclusion: conclusion.trim(),
        relevance: relevance.trim() || undefined,
        open_questions: normalizeOpenQuestions(openQuestions),
        citations,
        include_in_main: includeInMain,
        save_as_note: saveAsNote,
      })
      setIsOpen(false)
    } catch {
      // The mutation owns the translated error toast.
    }
  }

  return {
    isOpen,
    isDrafting,
    draftFailed,
    conclusion,
    setConclusion,
    relevance,
    setRelevance,
    openQuestions,
    addOpenQuestion,
    updateOpenQuestion,
    removeOpenQuestion,
    includeInMain,
    setIncludeInMain,
    saveAsNote,
    setSaveAsNote,
    start,
    cancel,
    submit,
  }
}

export type AsideResolution = ReturnType<typeof useAsideResolution>
