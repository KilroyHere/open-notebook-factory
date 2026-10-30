# Chat Effectively - Conversations with Your Research

Notebook chat is a conversation with an AI model about the sources and notes you put in context. This page covers how to use it. How the context is built, and how Chat differs from Ask, is explained in [AI Context & RAG](../2-CORE-CONCEPTS/ai-context-rag.md).

---

## Quick Start

1. Open a notebook. The chat is the center panel, between **Sources** and **Studio** (on a phone, the **Chat** tab).
2. Check what's in context: the chip inside the message box shows how many sources and notes are included (for example **2 sources · 1 note**). Hover or focus it for the split between *Insights only* and *Full content* and the estimated token and character count.
3. Type your question in **Ask anything about your sources...** and press **Ctrl+Enter** (**⌘+Enter** on Mac). Plain **Enter** adds a new line.
4. Click a numbered reference in the answer to open the source, note or insight it cites.

The first message creates a chat session automatically.

---

## Choosing What the AI Sees

Every source and note in the notebook has a context level. Chat sends the selected content with **every** message, so this is where you control quality, cost and what a cloud provider receives.

**Per item:** click the **context icon** on a source or note card to cycle through its levels. Hover it to see the current one.

| Level | Sources | Notes |
|-------|---------|-------|
| **Not included in chat** | Not sent | Not sent |
| **Insights only** | Title and insights (only offered when the source has insights) | — |
| **Full content** | Title, insights and full text | Title and content |

**All at once:** the **Context** menu in the Sources panel header and in Studio's Notes tab.
- Sources: **Include all (insights only)** (sources without insights are left out), **Include all (full content)**, **Exclude all from context**.
- Notes: **Include all in context**, **Exclude all from context**.

Things to know:

- When you open a notebook, sources with insights start at *Insights only*, other sources at *Full content*, and notes are included.
- Your choices are **not saved**. Reloading the page resets them to the defaults.
- To make *Insights only* available for a source, generate an insight for it ([Transformations](transformations.md)).

**Choosing levels:**

- Use *Full content* for the few sources you are reading closely or quoting.
- Use *Insights only* for background sources. It's much smaller and usually enough for orientation.
- Exclude anything unrelated to the current question. Less noise gives better answers.
- If the context is very large (over about 105,000 tokens), Open Notebook switches to your **Large Context Model**.

---

## Sessions

A session is one conversation; its messages are saved and reloaded when you come back. The chat control shows the title of the session you are in. Click it to open **Chat Sessions**, where the open session is marked **Current**. From there you can create a session (give it a title), switch to another one, rename it or delete it. Each session remembers the conversation, not the context selection.

## Learning Asides

Use an aside, or *deep dive*, when an answer raises a prerequisite or tangent that you want to explore without filling the main conversation with the detour.

1. Under an assistant answer, click **Go deeper** (its tooltip reads "Open as an aside"). To dig into one passage rather than the whole answer, select it instead (see [Going deeper on a passage](#going-deeper-on-a-passage)).
2. The dive opens in the chat, right under that answer: a row reading **Deep dive · <title>** with its status, unfolded into the dive's own conversation. Ask follow-up questions in its box and send with **Ctrl+Enter** (**⌘+Enter** on Mac). The dive keeps the answer and the main conversation up to that point. Its replies have numbered citations and math, like the main chat. A question you send shows in the dive at once while it is being answered.
3. **Save for later** parks the dive and folds it to its row, which then says *Parked* (unfold it and write to it, or click **Reopen**, to continue). **Discard** removes it when the tangent was not useful. **Wrap up** drafts what you learned, right there under the answer, for you to edit and resolve.
4. Before resolving, edit the proposed conclusion and decide whether to use it in the main conversation, save it as a note, or both.

Click a dive's row to fold it or unfold it again. One dive is open at a time: opening another folds the first, and the row you clicked stays where it was on screen. A question you typed but did not send is still there when you come back. **Open full height** shows the dive in a view that covers the chat, which is easier for a long dive; **Return to main thread** (or ✕) brings the chat back where you left it, with the dive still open under its answer. The full-height view also has **Back to origin message**, the breadcrumb and, for a nested dive, **Back to parent dive**.

The complete aside transcript stays isolated. Only the conclusion you approve is added to future main-chat context. The main chat gets your conclusions newest first, until about 4,000 tokens (roughly 3,000 words) per message are used; the first one that doesn't fit is left out, along with every older one. A resolved dive folds to a **✓ Learned: …** row under the answer it came from, naming the first words of the conclusion. Click it for the summary, with why it matters, open questions, citations that open the existing source, note or insight view, **View transcript**, **Update resolution**, **Open full height** and, after the main chat uses that conclusion, **View merged response**. The reply that received that conclusion carries a small **Used what you learned: …** chip above it; click the chip to expand the same summary, and click it again to fold it away. **Dive in** on an open question starts a nested dive and asks that question at once; it opens under its parent dive in the chat. A dive nested one level deeper than that opens full height instead, and shows in the chat as a row that opens it. **Park question** saves the child without leaving the thread you are reading. The outline and map place the child under its parent.

The **Asides** button lists active, parked and resolved asides in the full-height view. The **Journey** tab in **Studio** starts with three counts: **Learned** (resolved asides whose conclusion the main chat uses), **Open questions** (questions on the latest conclusions that no dive has picked up yet) and **Saved for later** (parked asides). Its **Outline** names each part of the chat as a section. Rename a section or pin it; the name stays when you reload, and pinned sections stay at the top. Each aside still nests under the turn it came from, and clicking one scrolls the chat to its dive and opens it there (full height when it is nested too deep, or when its answer is not in this chat). **Map** shows the main thread, each branch, its summary, and the merged reply. Expanding the map covers the Journey tab; **Outline** brings the list back. **Main thread** in the Journey tab closes any open dive. When you return to a notebook with unfinished work, a resume prompt opens it under its answer. If several branches are unfinished, **Resume** returns to the active branch (or the most recently parked one), not simply the oldest aside. Aside sessions do not appear in the normal **Chat Sessions** list.

### Going deeper on a passage

Select part of an assistant answer, with the mouse or by touch, and a small toolbar appears next to the selection with **Go deeper** and **Save to note**:

- **Go deeper** opens a deep dive about that passage under the answer, titled from the passage. The dive quotes it under **On this passage**, and still knows the whole answer and the conversation before it. Math and citations in the passage are kept.
- **Save to note** saves the passage as an **AI Generated** note in this notebook, with a generated title, like **Save to note** under an answer does for the whole answer.

The toolbar comes right after the answer in the tab order: after selecting, press **Tab** to reach it (screen readers announce that actions for the selected text follow the answer). **Escape**, or pressing anywhere else, hides it. Selecting and copying text work as usual, and the **Go deeper** button under each answer still opens a dive about the whole answer.

If you also save the conclusion as a note, it behaves like any other notebook
note: sessions that include notes in their context can use it. Leave that
option off when the finding should remain private to the current journey.

On a narrow screen dives open in the **Chat** tab in the same way, and the **Studio** tab has the same Journey (outline and map) and Notes tabs. Opening a branch, the main thread, or a message from Journey returns to Chat and scrolls to it.

## Choosing the Model

The model button on the message row opens **Model Configuration**. Pick a model to use for this session instead of your **Chat Model** default, or click **Reset to Default**. Only language models you have added in **Manage → Models** are listed.

---

## Working With Answers

Under each AI answer:

- **Copy to clipboard** copies the answer text.
- **Save to note** saves it as an **AI Generated** note in this notebook, with a generated title. There is no dialog; the note appears in Studio's Notes tab. To save only part of an answer, select it and use **Save to note** in the toolbar that appears.

**References** are the numbered links in the answer. They point to whole items (a source, note or insight), not to pages or passages. See [Citations](citations.md) for how to check them.

---

## Asking Good Questions

- **Be specific.** "What sample size and method did the 2024 survey use?" gets a better answer than "Tell me about the survey."
- **Name the sources** when several are in context: "Compare how the Smith paper and the OECD report define productivity."
- **Ask for the format you want:** a table, a bullet list, a short paragraph.
- **Ask for references** when you plan to verify: "Cite the source for each claim."
- **Follow up.** The model sees the whole session, so "Expand on the second point" works.

---

## Source Chat

Each source also has its own chat. Open the source and click **Chat with Sources**: the source page shows the content on the left and the chat on the right, with its own sessions and model choice.

Source chat always uses that source's full text and insights; there are no context levels. Long sources are truncated to fit about 50,000 tokens, so questions about the later parts of a very long document may not be answerable there; use notebook chat with the source at *Full content* instead (large contexts switch to your Large Context Model). **Save to note** is not available in source chat (the source isn't tied to one notebook); use **Copy to clipboard**.

---

## When Something Goes Wrong

| Symptom | What to do |
|---------|-----------|
| *The model returned an empty response...* | Retry, or pick another model. Reasoning models with a small output limit can spend everything on thinking. The failed question is not kept in the session, so retrying doesn't duplicate it |
| Answers ignore a source | Check its context icon; it may be excluded or at *Insights only* with thin insights |
| Slow or expensive | Reduce context: exclude sources, use *Insights only*, or start a new session (the whole session history is sent too) |
| *The AI provider took too long to respond...* | The request hit the backend timeout (`ESPERANTO_LLM_TIMEOUT`, 180 seconds by default). Retry, use a faster model, reduce context, or raise the timeout |
| *No model configured...* | Set the Chat Model in **Manage → Models → Default Model Assignments** |

More in [AI & Chat Issues](../6-TROUBLESHOOTING/ai-chat-issues.md).
