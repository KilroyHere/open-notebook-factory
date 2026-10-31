# Deep Dives - Follow a Tangent Without Losing Your Place

An answer often raises a prerequisite or a tangent: a term you don't know, a claim you want to check, a step of the math. A deep dive lets you explore it in its own thread, right under that answer, while the main conversation stays where it was. When you're done, you wrap the dive up into a short conclusion, and the main chat uses what you learned from then on.

Deep dives are part of notebook chat. For context levels, sessions and model choice, see [Chat Effectively](chat-effectively.md).

In a few places the app calls a dive an *aside*: the **Asides** button above the message box, the **Resolve aside** button and the **Open aside: …** bar. They're the same thing.

---

## Quick Start

1. Under an assistant answer in notebook chat, click **Go deeper**.
2. Ask your follow-up questions in the dive's box. **Ctrl+Enter** (**⌘+Enter** on Mac) sends.
3. Click **Wrap up**, edit the draft of what you learned, and click **Resolve aside**.
4. Leave **Use this conclusion in the main conversation** checked (it is by default). Main-chat messages include the conclusion from then on.

---

## Start a Deep Dive

Click **Go deeper** under an assistant answer. To dig into one passage rather than the whole answer, select it instead (see [Going deeper on a passage](#going-deeper-on-a-passage)).

The dive opens in the chat, right under that answer: a row reading **Deep dive ·** and the dive's title, with its status, unfolded into the dive's own conversation. Ask follow-up questions in its box and send with **Ctrl+Enter** (**⌘+Enter** on Mac).

- The dive knows the answer and the main conversation up to that point.
- Its replies have numbered citations and math, like the main chat.
- A question you send shows in the dive at once while it is being answered. While you stay at the end of the dive, the chat scrolls to show your question and then the start of the reply. If you scroll away to read something else meanwhile, it stays where you are.

### Going deeper on a passage

Select part of an assistant answer, with the mouse or by touch, and a small toolbar appears next to the selection with **Go deeper** and **Save to note**:

- **Go deeper** opens a deep dive about that passage under the answer, titled from the passage. The dive quotes it under **On this passage**, and still knows the whole answer and the conversation before it. Math and citations in the passage are kept.
- **Save to note** saves the passage as an **AI Generated** note in this notebook, with a generated title, like **Save to note** under an answer does for the whole answer.

The toolbar comes right after the answer in the tab order: after selecting, press **Tab** to reach it (screen readers announce that actions for the selected text follow the answer). **Escape**, or pressing anywhere else, hides it. Selecting and copying text work as usual, and the **Go deeper** button under each answer still opens a dive about the whole answer.

The same toolbar works on the answers inside a deep dive, under its answer in the chat or in the full-height view. There, **Go deeper** opens a dive about the passage nested under that dive, quoting the passage under **On this passage**, and puts the cursor in its question box. It opens where **Dive in** would open a nested dive (see [Open questions and nested dives](#open-questions-and-nested-dives)). Its **Back to parent dive** returns to the dive you selected the passage in.

---

## Work in a Dive

Click a dive's row to fold it or unfold it again. One dive is open at a time: opening another folds the first, and the row you clicked stays where it was on screen. A question you typed but did not send is still there when you come back.

Under the dive:

- **Wrap up** drafts what you learned, for you to edit and resolve (see [Wrap Up](#wrap-up)).
- **Save for later** parks the dive and folds it to its row, which then says *Parked*. To continue, unfold it and write to it, or click **Reopen**.
- **Discard** removes it when the tangent was not useful.
- **Open full height** shows the dive in a view that covers the chat, which is easier for a long dive.

In the full-height view, **✕** (or **Main thread** in its breadcrumb) brings the chat back where you left it, with the dive still open under its answer when it can show there. The view also has **Back to origin message** and, for a nested dive, **Back to parent dive**. Once the dive is resolved, its **Return to main thread** goes to the reply that used the conclusion, or to the message the dive started from.

The **Asides** button, just above the message box, shows how many dives the conversation has. It lists the active, parked and resolved ones in the full-height view, under **Learning journey**.

When you come back to a notebook with an unfinished dive, a bar above the chat says **Open aside:** and its title; **Resume** opens it under its answer. If several dives are unfinished, **Resume** returns to the active one (or the most recently parked one), not simply the oldest.

Dives don't appear in the **Chat Sessions** list.

---

## Wrap Up

**Wrap up** asks the dive's chat model for a draft of what you learned, then shows a form, right there under the answer:

- **What did you learn?**: the conclusion.
- **How does this affect the main conversation?**: why it matters for the main thread.
- **Open questions**: the draft proposes up to three questions the dive left open. Edit or remove them, or **Add question**.
- **Use this conclusion in the main conversation** (checked by default): whether main-chat messages include the conclusion.
- **Also save the conclusion as a note** (unchecked by default): saves it as a notebook note as well.

Edit any of it, then click **Resolve aside** at the end of the form. If no draft can be made, the form says so and starts from the dive's last answer.

The sources the draft relied on are kept as evidence for the conclusion. If you also save the conclusion as a note, it behaves like any other notebook note: sessions that include notes in their context can use it. Leave that option off when the finding should stay with this conversation.

A resolved dive folds to a **✓ Learned: …** row under the answer it came from, naming the first words of the conclusion. Click it for the summary:

- the conclusion, **Why it matters** and the **Open questions**;
- the evidence, as citations that open the source, note or insight;
- a **Use in main chat** checkbox;
- **View transcript**, **Update resolution** and **Open full height**;
- **View merged response**, once the main chat has used the conclusion.

**Update resolution** opens the form again, starting from what you approved. Saving it replaces the conclusion the main chat uses.

### Open questions and nested dives

Each open question in a resolved dive's summary has two buttons:

- **Dive in** starts a nested dive and asks that question at once. It opens under its parent dive in the chat. A dive nested one level deeper than that opens full height instead, and shows in the chat as a row that opens it.
- **Park question** saves the nested dive for later without leaving the thread you are reading.

A nested dive also knows how you got there: an excerpt of the main thread, and the question and conclusion of each dive above it. The outline and map in Studio place it under its parent.

---

## What You've Learned

Only the conclusion you approve reaches the main chat. The dive's own conversation never does, so the main chat doesn't fill up with detours.

With every main-chat message, the conclusions you keep in main chat are added to the context, newest first, up to about 4,000 tokens (roughly 3,000 words). A conclusion too long for the room that is left is skipped for that message, and older, shorter ones still fill it. A reply that used a conclusion carries a small **Used what you learned: …** chip above it; click the chip to unfold the same summary, and click it again to fold it away.

The **Outline** in Studio's **Journey** tab starts with **What you've learned**: the conclusion of each resolved dive (the latest version when you updated it), in the order of the conversation. Each has a **Use in main chat** checkbox:

- Uncheck a conclusion that no longer helps, and main-chat messages stop including it. Check it again to bring it back.
- Nothing is resolved again and no new version is stored. **Update resolution** starts from your choice.
- **Learned** counts only the checked conclusions, and the context size in the message box changes with them.
- The same checkbox sits in a resolved dive's summary.
- If a change can't be saved, the checkbox goes back and a message says why.

Click a conclusion to open its dive.

### When conclusions are left out

When the checked conclusions don't all fit in the 4,000-token limit, the app says which ones are left out:

- A note at the top of **What you've learned** says how many conclusions are left out of main chat.
- The context chip in the message box says how many when you hover or focus it.
- Each conclusion that is left out says **Left out to fit the context limit** under it.

Uncheck the conclusions you no longer need to make room for the others.

---

## The Journey Tab

Studio's **Journey** tab shows the shape of the conversation. Studio opens on it once the current chat has a deep dive; after you pick a tab, it stays on your choice.

It starts with three counts:

- **Learned**: resolved dives whose conclusion the main chat uses.
- **Open questions**: questions on the latest conclusions that no dive has picked up yet.
- **Saved for later**: parked dives.

**Outline** lists [what you've learned](#what-youve-learned), then names each part of the chat as a section, one per question. Rename a section or pin it; the name stays when you reload, and pinned sections stay at the top. Each dive nests under the answer it came from. Clicking one scrolls the chat to its dive and opens it there (full height when it is nested too deep, or when its answer is not in this chat).

**Map** shows the main thread, each branch, its summary and the merged reply. Expanding the map covers the Journey tab; **Outline** brings the list back.

**Main thread** in the Journey tab closes any open dive.

---

## On a Phone

On a narrow screen, dives open in the **Chat** tab in the same way, and the **Studio** tab has the same **Journey** (outline and map) and **Notes** tabs. Opening a branch, the main thread or a message from Journey returns to Chat and scrolls to it.

---

The [API Reference](../7-DEVELOPMENT/api-reference.md) describes the learning endpoints behind deep dives.
