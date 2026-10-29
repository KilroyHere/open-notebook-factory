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

Opening a notebook shows its header, then a conversation-first workspace. On a wide screen the chat fills the center and the remaining window height, so the message list scrolls and the composer stays at the bottom. Sources and notes share a collapsible **Knowledge** rail on the left, and the **Learning journey** rail on the right holds the chat outline and an aside map. A nested dive started from an open question sits under its parent branch in both the outline and the map. Outline headings are named sections you can rename or pin; those names stay after a reload. Both rails can be collapsed so the conversation uses the full width.

```
┌────────────────────────────────────────────────────────────────────┐
│ Notebook name (click to edit)              [Archive] [Delete]      │
│ Description (one line, click to edit)                              │
├──────────────────┬──────────────────────────────┬──────────────────┤
│ KNOWLEDGE        │                              │ LEARNING JOURNEY │
│ [Sources] [Notes]│  messages, with numbered     │ [Outline] [Map]  │
│ [Context] [Add]  │  references and aside        │                  │
│ ┌──────────────┐ │  summaries                   │ 1. question      │
│ │ paper.pdf    │ │                              │    └ deep dive   │
│ │ File · 2  ◐ ⋮│ │ [Asides] [Current session]   │                  │
│ └──────────────┘ │ [Ask anything...] [Model]    │                  │
└──────────────────┴──────────────────────────────┴──────────────────┘
```

On small screens the workspace becomes four tabs, **Sources**, **Notes**, **Chat** and **Journey**, with Chat selected first. Journey shows the same outline and map as the wide-screen rail. Opening a branch or a message there switches back to Chat.

### Knowledge rail

The left rail has **Sources** and **Notes** tabs. Collapse it from the header to give the conversation the full width. The actions below are the same ones that used to live in separate columns.

### Sources column

- **Add Source** opens a menu: **Add Source** (the wizard for new content) or **Add Existing Sources** (link sources from your library). See [Adding Sources](adding-sources.md).
- **Context** sets every source at once: **Include all (insights only)**, **Include all (full content)** or **Exclude all from context**.
- Each **source card** shows the title, the type (Add URL, Upload File or Enter Text), the processing status while it isn't finished, and the insight count (when there are any). The **context icon** cycles the source's [context level](../2-CORE-CONCEPTS/ai-context-rag.md#context-levels-in-notebook-chat) when you click it. The **⋮ menu** has **Remove from Notebook**, **Retry Processing** (failed sources), **Refresh content** (completed links) and **Delete Source**.
- Click a card to open the source view.

### Notes column

- **Write Note** creates a note.
- **Context** has **Include all in context** and **Exclude all from context**.
- Each **note card** shows the title, an **AI Generated** or **Human** badge and a context icon (on or off). Click a card to edit the note. See [Working with Notes](working-with-notes.md).

### Chat column

Notebook chat with the sources and notes in context. The button labeled with the current session title opens **Chat Sessions**. The model button sits on the message row and picks a model for the session. Context counts appear under the messages only when sources or notes are included. Send with **Ctrl+Enter** (**⌘+Enter** on Mac). See [Chat Effectively](chat-effectively.md).

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
