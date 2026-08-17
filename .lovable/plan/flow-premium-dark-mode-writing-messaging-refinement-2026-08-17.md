# Flow — premium dark-mode writing & messaging refinement

Refine the existing Flow app into a calm, premium, dark-first messaging/writing surface with real rich text, a serious composer, a minimal sidebar, and scalable message loading. No AI brain, no integrations in this pass (the background tagging that already exists stays wired but stays out of the visual language).

## 1. Visual direction (dark-first)

- Dark becomes the default and primary theme: `.dark` applied at the document root, and the dark palette rebuilt from the current blue-gray defaults to a neutral deep charcoal system.
- Tonal layering instead of cards: near-black app background, a slightly lifted sidebar, a marginally lighter composer bar, hairline borders, one very soft shadow token.
- Off-white foreground (not pure white), restrained gray secondary text, a single quiet accent used only for the send action, selection, and focus rings.
- Typography: keep the display serif for the wordmark only; body text at comfortable size with generous line height. Generous whitespace, few rounded containers, no glass/glow/gradients.
- All values as semantic tokens in `src/styles.css` (oklch); components use tokens only.

## 2. Conversation stream

- One continuous chronological stream, newest at the bottom, composer focused on open.
- Messages are no longer bubbles-in-cards: text sits on the page with a subtle left alignment rhythm, day separators as quiet centered labels, hairline separation and hover tint instead of borders per message.
- Hover reveals a small action row (edit, complete) — nothing permanent, nothing flashy.
- Completed messages: strike-through, dimmed, completion time in the meta line, still a message.
- Open-position behavior: restore to the bottom (or the last read position) without animation, then never jump scroll when older pages load.

## 3. Rich text

- Add TipTap as the editor for both the composer and inline message editing.
- Supported marks/blocks: bold, italic, underline, strikethrough, headings, bulleted list, numbered list, checklist, link, blockquote, inline + block code, undo/redo.
- Storage: messages gain an HTML column for the rendered rich content while the existing plain-text `content` column keeps a text rendition (used for search and future AI). Rendering sanitizes/whitelists to the supported node set, so formatting survives save, edit, reload, and filtering.
- Message rendering uses a shared prose style built from the design tokens (headings, lists, checkboxes, quotes, code) — no third-party prose theme.

## 4. Composer

- Persistent bottom composer, visually minimal at rest, growing with content up to a comfortable max height then scrolling internally.
- Formatting toolbar is hidden until focus (or a small toggle), then fades in as a compact single row of icon buttons.
- Keyboard: Enter sends, Shift+Enter newlines; inside lists/quotes/code Enter behaves as the editor expects (new list item / new line) and Cmd/Ctrl+Enter always sends. Standard Cmd+B/I/U/Shift+X/Z shortcuts.
- Attachment-ready: a disabled-for-now attach slot and a message attachments shape reserved in the data layer, no upload logic.
- Send is optimistic — the message renders instantly, persistence and any background processing happen after.

## 5. Editing and completing

- Inline edit in place: same ID, same position, same metadata, rich-text editing, updated timestamp, `edited` marker, background reprocessing flag set. No duplicate rows.
- One-click completion toggle with a quiet cross-out transition, completion time recorded, message stays in the stream.

## 6. Sidebar

- Minimal left rail: wordmark, a single "All" item selected, a reserved (empty, labelled) space for future tags, and settings/sign-out at the bottom.
- Subtle hover and selected states; no counts, no widgets.
- Below the mobile breakpoint the rail collapses into a drawer opened from a header button.

## 7. Scale and performance

- Message loading switches to keyset pagination: newest page on open, older pages fetched when the user scrolls near the top, with scroll anchoring so the position never jumps.
- Message list rendering is kept cheap (memoized rows, no per-message editor instances until edit is opened) so thousands of messages scroll smoothly.

## 8. Micro-interactions

Short, near-invisible transitions only: message fade-in on send, hover tint, toolbar fade, sidebar selection, completion cross-out, edit-state swap. No spring/bounce/flash.

## Technical notes

- New dependencies: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, plus underline, link, task-list/task-item extensions. Editor instantiated with `immediatelyRender: false` for SSR safety.
- Migration: add `content_html text` (and a reserved `attachments jsonb`) to `public.messages`; existing rows backfilled by wrapping their text in paragraphs. Existing RLS/grants unchanged.
- Server functions updated: `getFlow` becomes a paginated `getStreamPage` (cursor by `created_at`,`id`, newest-first, returns in ascending order), `sendMessage`/`updateMessage` accept `{ html, text }` and validate/sanitize server-side.
- Files touched: `src/styles.css` (dark-first token system), `src/routes/__root.tsx` (dark class, fonts), `src/routes/_authenticated/route.tsx` (sidebar shell + drawer), `src/routes/_authenticated/index.tsx` (stream + composer, split into `src/components/flow/*`), `src/lib/flow.functions.ts` and `src/lib/flow.server.ts` (pagination, rich content), `src/routes/_authenticated/settings.tsx` (restyle only), `src/routes/auth.tsx` (restyle to match).
- Existing background tagging stays functional but its visual treatment is reduced to a quiet meta line; no new AI work.
