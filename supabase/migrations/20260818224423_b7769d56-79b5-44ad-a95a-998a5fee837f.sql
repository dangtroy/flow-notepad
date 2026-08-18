ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS remind_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_dismissed_at timestamptz;

CREATE INDEX IF NOT EXISTS messages_pinned_idx
  ON public.messages (user_id, conversation_id, pinned_at DESC)
  WHERE is_pinned;

CREATE INDEX IF NOT EXISTS messages_remind_idx
  ON public.messages (user_id, conversation_id, remind_at)
  WHERE remind_at IS NOT NULL;