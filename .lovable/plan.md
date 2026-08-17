# Flow — one permanent conversation for your thoughts

Flow is a single, never-ending message stream. You send a thought, it saves instantly, then AI quietly tags and organizes it in the background. No folders, no documents, no "new note".

## What gets built

**Sign in**
Email/password plus Google sign-in. Each account gets exactly one Flow conversation, created automatically on first use.

**The stream (main screen, at `/`)**
- Full-height messaging view: chronological messages, newest at the bottom, day dividers, auto-scroll to the latest.
- Composer pinned to the bottom: multiline, Enter to send, Shift+Enter for newline. Sending is optimistic — the message appears instantly.
- Each message bubble shows its text, a quiet timestamp, AI tags as small inline chips once they arrive, and an "edited" marker when applicable.
- Hover (or long-press on mobile) reveals two subtle actions: complete and edit.
- Complete: one click strikes the text through, fades it, and records the completion time. Click again to un-complete.
- Edit: the bubble becomes inline-editable in place; saving updates the same record, keeps its position, bumps `updated_at`, and re-queues AI tagging.
- Warm, writing-focused visual direction: soft paper background, one warm accent, generous line height, a real typeface pairing (not Inter/Poppins), no cards, no dashboard, no metrics.

**AI organization (background, never blocking)**
After a message is saved, a background call runs through Lovable AI. It reads the message, the user's active context rules, and the existing tag list, then returns tags plus a short context blob. Tags are reused by normalized name so "Travel" doesn't spawn "Trips". If the AI call fails, the message stays untouched and is simply left unprocessed (retryable).

**Settings (a quiet secondary screen)**
- Auto-delete completed messages after: 1 / 3 / 7 / 30 days / never.
- Context rules: create, edit, enable/disable, delete. Each rule is a tag name plus a free-text context description used by the AI.
- Nothing else. Settings stays out of the way of the stream.

**Auto-deletion**
Completed messages past their retention window are permanently deleted, and each deletion is recorded in a deletion log for history. Unfinished messages are never deleted. Cleanup runs on app open and via a scheduled endpoint.

## Technical notes

Enable Lovable Cloud for auth, database, and server functions.

Schema (all RLS-protected, scoped to `auth.uid()`, with explicit grants):
- `profiles` — one row per auth user.
- `conversations` — one row per user (the single Flow); unique on `user_id`.
- `messages` — `user_id`, `conversation_id`, `content`, `created_at`, `updated_at`, `is_completed`, `completed_at`, `ai_context jsonb`, `ai_status` (pending/done/failed), `ai_processed_at`, `deleted_at` (reserved). jsonb + status columns keep it expandable without re-architecture.
- `tags` — `user_id`, `name`, `normalized_name` (unique per user), `color`.
- `message_tags` — join table (`message_id`, `tag_id`), the only place a message/tag link exists; messages are never duplicated per tag.
- `context_rules` — `user_id`, `tag_name`, `context` text, `is_enabled`, timestamps.
- `user_preferences` — `user_id` unique, `completed_retention_days int null` (null = never), plus room for future settings.
- `deletion_log` — `user_id`, deleted message id, its content snapshot, `completed_at`, `deleted_at`, reason.

Server functions in `src/lib/*.functions.ts` with `requireSupabaseAuth`: create/edit/complete message, list stream, tag CRUD-lite, context rule CRUD, preferences read/write, `processMessageAi` (fire-and-forget after save), `runRetentionCleanup`. Protected stream route lives under `_authenticated/`; `/` redirects there and `/auth` is the public sign-in page. A scheduled cleanup endpoint under `src/routes/api/public/` verifies a shared secret before running.

Reads use route loaders + TanStack Query; mutations are optimistic so saving never waits on AI.

Future capabilities (semantic search, multi-tag filtering, message merging, Gmail/Drive, related-context panels, conversational recall) are left unbuilt but the schema and function boundaries above accommodate them.
