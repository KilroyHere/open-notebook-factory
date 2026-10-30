# Interface Overview - Finding Your Way Around

## The Sidebar

The workspace pages have a sidebar on the left (it can be collapsed to icons). The exception is a source's own page (opened with **Chat with Sources**), which shows only the source and its chat.

```
┌──────────────────────┐
│ Open Notebook        │
│ [+ New]              │  → Source, Notebook, Podcast
│                      │
│ COLLECT              │
│   Sources            │
│ PROCESS              │
│   Notebooks          │
│   Ask and Search     │
│ CREATE               │
│   Podcasts           │
│ MANAGE               │
│   Models             │
│   Transformations    │
│   Settings           │
│   Advanced           │
│                      │
│ Quick actions   ⌘K   │
│ Theme · Language ·   │
│ Sign Out             │
└──────────────────────┘
```

| Item | What it's for |
|------|---------------|
| **New** | Create a source, notebook or podcast episode from anywhere |
| **Sources** | Your source library: every source, whichever notebooks it is in |
| **Notebooks** | Your notebooks: recently viewed, active and archived, in tile or list view |
| **Ask and Search** | Ask questions across your knowledge base, or search it ([Search and Ask](search.md)) |
| **Podcasts** | Generated episodes and the episode/speaker profiles ([Creating Podcasts](creating-podcasts.md)) |
| **Models** | AI provider configurations and default models ([API Configuration](api-configuration.md)) |
| **Transformations** | Your transformation prompts and the Playground ([Transformations](transformations.md)) |
| **Settings** | Content Processing, Embedding and Search, File Management |
| **Advanced** | System Info (version and update check) and Rebuild Embeddings |
| **Quick actions** | The command palette: jump to pages and notebooks, search or ask, create items, change theme |
| **Theme / Language** | Light, dark or system theme; interface language |

---

## The Notebook Page

Opening a notebook shows its header, then three panels: **Sources** on the left, the chat in the center and **Studio** on the right. Inside a notebook the app sidebar shrinks to its icon rail to leave room for the panels; other pages keep the sidebar the way you set it. The arrow before the notebook name goes back to the notebook list. On a wide screen the chat fills the remaining window height, so the message list scrolls and the composer stays at the bottom. Messages keep a readable width and are centered when the column is wider. Sources and Studio can each be collapsed so the conversation uses the full width; the page remembers which ones you collapsed.

```
┌───┬────────────────────────────────────────────────────────────────────┐
│ ▪ │ ← Notebook name (click to edit)              [Archive] [Delete]    │
│ ▪ │   Description (one line, click to edit)                            │
│ ▪ ├──────────────────┬────────────────────────────┬────────────────────┤
│ ▪ │ SOURCES          │   messages, with numbered  │ [Journey] [Notes]  │
│   │ [Context] [Add]  │   references               │ Learned 2 · Open   │
│   │ ┌──────────────┐ │   └ Deep dive · title    ▾ │ questions 1 · ...  │
│   │ │ paper.pdf    │ │   └ ✓ Learned: …         ▾ │ [Outline] [Map]    │
│   │ │ File · 2  ◐ ⋮│ │ [Asides] [Current session] │ 1. question        │
│   │ └──────────────┘ │ ╭ Ask anything...        ╮ │    └ deep dive     │
│   │                  │ ╰ 2 sources  [Model] [➤] ╯ │                    │
└───┴──────────────────┴────────────────────────────┴────────────────────┘
```

On small screens (narrower than 1024 px) the workspace becomes three tabs, **Sources**, **Chat** and **Studio**, with Chat selected first, and the icon rail is hidden so the notebook gets the whole width. The **menu** button at the start of the notebook header opens the app navigation in a drawer; choosing a page closes it. Studio has the same **Journey** and **Notes** tabs as on a wide screen. Opening a branch, the main thread or a message from Journey switches back to Chat.

### Sources column

- **Add Source** opens a menu: **Add Source** (the wizard for new content) or **Add Existing Sources** (link sources from your library). See [Adding Sources](adding-sources.md).
- **Context** sets every source at once: **Include all (insights only)**, **Include all (full content)** or **Exclude all from context**.
- Each **source card** shows the title, the type (Add URL, Upload File or Enter Text), the processing status while it isn't finished, and the insight count (when there are any). The **context icon** cycles the source's [context level](../2-CORE-CONCEPTS/ai-context-rag.md#context-levels-in-notebook-chat) when you click it. The **⋮ menu** has **Remove from Notebook**, **Retry Processing** (failed sources), **Refresh content** (completed links) and **Delete Source**.
- Click a card to open the source view.

### Studio

Studio has two tabs. It opens on **Journey** once the current chat has an aside, and on **Notes** before that; after you pick a tab it stays on your choice.

- **Journey** starts with three counts for the current chat: **Learned** (resolved asides whose conclusion is used in the main chat), **Open questions** (questions on the latest conclusions that no dive has picked up yet) and **Saved for later** (parked asides). Below them, **Outline** starts with **What you've learned**, the conclusion of each resolved dive with a **Use in main chat** checkbox (uncheck it to leave that conclusion out of main-chat messages), then lists the chat's sections with each aside nested under the turn it came from. **Map** shows the main thread, each branch, its summary and the merged reply. Clicking an aside or a conclusion scrolls the chat to its dive and opens it there. See [Chat Effectively](chat-effectively.md#learning-asides).
- **Notes**: **Write Note** creates a note. **Context** has **Include all in context** and **Exclude all from context**. Each **note card** shows the title, an **AI Generated** or **Human** badge and a context icon (on or off). Click a card to edit the note. See [Working with Notes](working-with-notes.md).

### Chat column

Notebook chat with the sources and notes in context. **Go deeper** under an answer opens a deep dive right below it, as a thread you can fold to one row (**Deep dive · title**, or **✓ Learned: …** once resolved) and unfold again; **Open full height** shows a long dive over the chat instead ([Learning Asides](chat-effectively.md#learning-asides)). Selecting part of an answer shows **Go deeper** and **Save to note** for just that passage. The button labeled with the current session title opens **Chat Sessions**. The message box is one rounded field: under the text sit a chip with what's in context (for example **2 sources · 1 note**), the model button, which picks a model for the session, and the send button. Hover or focus the chip to see how many sources are at *Insights only* and *Full content* and the estimated size in tokens and characters. Send with **Ctrl+Enter** (**⌘+Enter** on Mac). See [Chat Effectively](chat-effectively.md).

---

## The Source View

Clicking a source opens it with three tabs:

- **Content**: the extracted text and, for YouTube links, the embedded video.
- **Insights**: the insights generated by transformations, and **Generate New Insight** to run another one. See [Transformations](transformations.md).
- **Details**: topics, embedding status, created and updated dates, and the notebooks the source belongs to (**Manage Notebooks**).

**Chat with Sources** opens the source's own page, with the source on the left and a chat about it on the right. The **⋮ menu** has **Download File** (uploaded files, while the file is still stored), **Embed Content** (if the source isn't embedded yet) and **Delete Source**.

---

## Other Pages

- **Sources** (library): a table of all sources with type, insight count and embedding status. **New Source** adds a source without opening a notebook.
- **Notebooks**: **New Notebook**, a search box, **Recently Viewed** (notebooks only), and the **Active Notebooks** and **Archived Notebooks** lists.
- **Settings**: Content Processing (document and URL engines, OCR and other Docling options; see [Content Processing Engines](content-processing-engines.md)), Embedding and Search (**Default Embedding Option**: Ask, Always or Never), and File Management (**Auto Delete Files**: whether uploaded files are deleted after processing).
- **Advanced**: **System Info** shows your version and whether an update is available. **Rebuild Embeddings** re-embeds content after you change the embedding model (mode *Existing* or *All*); it runs in the background.

---

## Keyboard Shortcuts

| Shortcut | Where | Action |
|----------|-------|--------|
| **Ctrl+K** / **⌘K** | Anywhere | Open Quick actions (command palette) |
| **Ctrl+Enter** / **⌘+Enter** | Chat message box | Send |
| **Enter** | Chat message box | New line |
| **Ctrl+Enter** / **⌘+Enter** | Ask question box | Ask |
| **Enter** | Search box | Search |
