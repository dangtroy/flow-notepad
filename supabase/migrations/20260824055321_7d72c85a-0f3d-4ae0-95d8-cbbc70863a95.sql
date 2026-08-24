ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS due_at        timestamptz,
  ADD COLUMN IF NOT EXISTS due_is_fuzzy  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_priority text;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_task_priority_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_task_priority_check
  CHECK (task_priority IS NULL OR task_priority IN ('low','normal','high'));

CREATE OR REPLACE VIEW public.task_messages AS
SELECT
  m.id, m.user_id, m.conversation_id,
  m.content, m.content_html,
  m.is_completed, m.completed_at,
  m.due_at, m.due_is_fuzzy, m.task_priority,
  m.is_pinned, m.created_at, m.metadata, m.type, m.parent_message_id,
  (m.due_at IS NOT NULL AND m.due_at < now() AND NOT m.is_completed) AS is_overdue
FROM public.messages m
WHERE m.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.message_tags mt
    JOIN public.tags t       ON t.id = mt.tag_id
    JOIN public.tag_groups g ON g.id = t.group_id
    WHERE mt.message_id = m.id AND g.name = 'Tasks'
  );

ALTER VIEW public.task_messages SET (security_invoker = on);

GRANT SELECT ON public.task_messages TO authenticated;
GRANT ALL ON public.task_messages TO service_role;

CREATE INDEX IF NOT EXISTS messages_due_at_idx
  ON public.messages (user_id, due_at)
  WHERE due_at IS NOT NULL AND deleted_at IS NULL;