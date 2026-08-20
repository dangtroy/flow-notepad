# Quiet stream: text at rest, details on hover

Only the notes stream changes. Sidebar, right rail, composer, top bar, database, queries and routing stay as they are. One logic change: the visibility toggle inverts and moves to Settings.

## What you'll see

At rest each note is just its text. Hovering a row (or tabbing into it) fades in, without moving the text one pixel:

- checkbox + timestamp in the left margin
- reply / reference / remind / more icons in the right margin
- tags, expanding under the note text

```text
                 [x] 12:57 AM   Ship the pricing page copy today          ↩ ⌘ ⏰ ⋯
                                • ideas   • work
```

Other refinements:

- Completed notes show no checkbox at all — the strikethrough is the state, and the text keeps full contrast.
- Timestamps use tabular figures so they align column-straight.
- Replies show a relative offset after the time ("12:57 AM · +7h") so an out-of-order reply doesn't read as a bug.
- Tags become links that filter the stream to that tag (same as clicking it in the sidebar). No pill, no border: a 5px coloured dot and the name in the tag's colour, 11px mono.
- Action icons become plain 1.3px stroke icons — no white card, border, shadow, or filled active state. Muted at rest, full ink on hover, accent when active.
- Reduced-motion users get the instant reveal with no transitions.

## Toggle change

"Hide tags & timestamps" in the sidebar becomes "Always show details" in Settings > Appearance, default OFF. When ON, the stream container gets a class that pins meta, actions and tags to their revealed state — the same CSS, not a second code path.

The now-meaningless "Tag style" (pill/dot/text) and "Tag position" (right/below) appearance controls are removed, since the stream has one canonical tag look.

## Touch and narrow screens

Under 940px, or on any `(hover: none)` device, meta and actions render inline (static position, fully visible) and tags stay expanded — otherwise they'd be unreachable.

## Technical notes

- `src/components/flow/message.tsx`: row becomes `position: relative`; meta and action clusters move out of the text column into absolutely positioned siblings anchored to the first line box (26.4px tall, no row-level `align-items: center`). Reveal via `:hover`/`:focus-within` with direct-child selectors so hovering a parent never reveals a reply's controls. Opacity only — never `display:none`/`visibility:hidden` — so everything stays tabbable. Replies use the tighter `right: calc(100% + 14px)` offset to clear their hairline.
- Tags animate with `grid-template-rows: 0fr → 1fr` plus opacity, never max-height.
- New scoped CSS classes in `src/styles.css` (`flow-row`, `flow-meta`, `flow-acts`, `flow-tagwrap`, `.flow-stream.always-show …`), plus the media queries and `prefers-reduced-motion` block.
- `src/lib/appearance.ts`: replace `showTags`/`showTimestamps`/`showReplyTimestamps`/`tagStyle`/`tagPosition` usage with a single `alwaysShowDetails: false`, migrating existing stored settings.
- `src/components/flow/sidebar.tsx`: remove the toggle button only; nothing else touched.
- `src/components/flow/appearance-settings.tsx`: add the "Always show details" switch, drop the removed visibility/tag-style controls.
- `src/routes/_authenticated/index.tsx`: only prop plumbing for the new class/flag (`cleanNotepad` spacing logic collapses into the always-show flag).
- Tag links use `Link to="/" search={(prev) => ({ ...prev, tags: [tag.id] })}` — no new route.
- Reply offset is computed client-side from existing `created_at` values, so no data-model change. Nothing in this plan needs one.
