import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface NotebookColumnsState {
  sourcesCollapsed: boolean
  notesCollapsed: boolean
  knowledgeCollapsed: boolean
  journeyCollapsed: boolean
  toggleSources: () => void
  toggleNotes: () => void
  toggleKnowledge: () => void
  toggleJourney: () => void
  setSources: (collapsed: boolean) => void
  setNotes: (collapsed: boolean) => void
  setKnowledge: (collapsed: boolean) => void
  setJourney: (collapsed: boolean) => void
}

export const useNotebookColumnsStore = create<NotebookColumnsState>()(
  persist(
    (set) => ({
      sourcesCollapsed: false,
      notesCollapsed: false,
      knowledgeCollapsed: false,
      journeyCollapsed: false,
      toggleSources: () => set((state) => ({ sourcesCollapsed: !state.sourcesCollapsed })),
      toggleNotes: () => set((state) => ({ notesCollapsed: !state.notesCollapsed })),
      toggleKnowledge: () => set((state) => ({ knowledgeCollapsed: !state.knowledgeCollapsed })),
      toggleJourney: () => set((state) => ({ journeyCollapsed: !state.journeyCollapsed })),
      setSources: (collapsed) => set({ sourcesCollapsed: collapsed }),
      setNotes: (collapsed) => set({ notesCollapsed: collapsed }),
      setKnowledge: (collapsed) => set({ knowledgeCollapsed: collapsed }),
      setJourney: (collapsed) => set({ journeyCollapsed: collapsed }),
    }),
    {
      name: 'notebook-columns-storage',
    }
  )
)
