# Multiple notepads in Flow

Today every account has exactly one stream. This adds several fully independent streams — Work, Personal, Ideas — that you switch between in one click from the top-left, next to the logo.

## The switcher

Next to the Flow wordmark in the sidebar header (and in the mobile top bar), the current notepad name with a caret: `Work ▾`. Clicking opens a quiet list:

```text
Work        ✓
Personal
Ideas
+ New Notepad
```

Pinned notepads sit at the top of the list. Selecting one switches instantly — no loading page, no dashboard. Flow always opens directly into the notepad you last used.

## Creating one

`+ New Notepad` asks for a name only, with an optional icon and accent color inline. On save, the notepad is created and opened immediately; no tags, groups, or rules to configure first.

## Isolation

Each notepad has its own messages, replies, tags, tag groups, tag colors, context rules, suggested tags, and completed messages. A `ShipHero` tag in Work never appears in Personal. Nothing is shared or merged automatically.

- The sidebar tag tree, filters, and counts show only the active notepad's tags.
- AI organization reads only the active notepad's tags, groups, and context rules. Other notepads' content is never sent.
- The suggestions bell shows the active notepad's suggestions. When other notepads also have pending suggestions, the panel notes that in a single line ("3 more in Personal") that switches you there — it never mixes tag systems.
- Retention/auto-delete and "clear completed" act on the active notepad only.

## Per-notepad state

Each notepad remembers its own scroll position, tag filter selection, and filter mode. Switching Work → Personal → Work returns you to where you left off in Work.

## Customization and management

Each notepad has a name, optional icon, and optional accent color. The accent tints small active-state details (switcher dot, active sidebar item, composer focus ring) without altering the overall Flow design.

A Notepads section in Settings lets you rename, change icon/accent, reorder (drag), pin, and delete. Deleting asks for explicit confirmation and states that its messages, tags, groups, rules, and suggestions go with it. The last remaining notepad cannot be deleted.

## Technical notes

Data model — the existing `conversations` table becomes the notepad entity:

- `conversations` gains `name`, `icon`, `accent` (from the existing muted palette), `sort_order`, `is_pinned`; drops the one-row-per-user assumption.
- `tags`, `tag_groups`, `context_rules`, `tag_suggestions` each gain `conversation_id not null` (cascade delete). Tag uniqueness becomes `(user_id, conversation_id, normalized_name)`.
- `messages.conversation_id` already exists and stays the single owner link.
- `user_preferences.settings` stores the last active notepad id; retention settings move to per-notepad columns on `conversations` (`completed_retention_days`).
- Migration backfills: existing single conversation is renamed `Flow` (or `Work` if it is the only one) and every existing tag, group, rule, and suggestion is attached to it, so nothing is lost. Grants + RLS policies re-applied for the new columns.

Server side — every notepad-scoped server function in `src/lib/flow.functions.ts` takes a `notepadId` and validates it belongs to `auth.uid()` before reading or writing; a helper `resolveNotepad(supabase, userId, notepadId)` centralizes that check and falls back to the user's default notepad. `src/lib/flow.server.ts` query helpers (`loadStreamPage`, `loadTags`, `loadTagGroups`, `resolveTaggedMessageIds`, `runRetention`) and `src/lib/organize.server.ts` all filter by conversation. The `tag_message_counts` / `group_message_counts` RPCs are re-created with a notepad argument.

Client side — a new `src/lib/use-notepad.ts` holds the active notepad id (persisted in `localStorage`, seeded from preferences) plus per-notepad UI state (scroll offset, selected tags, filter mode). All React Query keys become `["tags", notepadId]`, `["stream", notepadId, …]`, etc., so switching is a cache swap rather than a refetch of shared state. New `src/components/flow/notepad-switcher.tsx` renders the switcher and the create dialog; `src/routes/_authenticated/settings.tsx` gains the Notepads management section.
