-- Notepads: the conversation becomes a first-class, repeatable stream.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS accent text NOT NULL DEFAULT 'slate',
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_retention_days integer;

-- One notepad per user was the old assumption; drop it.
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_user_id_key;

-- Existing per-user retention setting moves onto the notepad.
UPDATE public.conversations c
SET completed_retention_days = p.completed_retention_days
FROM public.user_preferences p
WHERE p.user_id = c.user_id AND c.completed_retention_days IS NULL;

-- Everything organizational now belongs to exactly one notepad.
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public.tag_groups ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public.context_rules ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public.tag_suggestions ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE;

-- Backfill: attach existing rows to the user's oldest (original) notepad.
WITH primary_notepad AS (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.conversations
  ORDER BY user_id, created_at ASC
)
UPDATE public.tags t SET conversation_id = n.id
FROM primary_notepad n WHERE n.user_id = t.user_id AND t.conversation_id IS NULL;

WITH primary_notepad AS (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.conversations
  ORDER BY user_id, created_at ASC
)
UPDATE public.tag_groups g SET conversation_id = n.id
FROM primary_notepad n WHERE n.user_id = g.user_id AND g.conversation_id IS NULL;

WITH primary_notepad AS (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.conversations
  ORDER BY user_id, created_at ASC
)
UPDATE public.context_rules r SET conversation_id = n.id
FROM primary_notepad n WHERE n.user_id = r.user_id AND r.conversation_id IS NULL;

WITH primary_notepad AS (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.conversations
  ORDER BY user_id, created_at ASC
)
UPDATE public.tag_suggestions s SET conversation_id = n.id
FROM primary_notepad n WHERE n.user_id = s.user_id AND s.conversation_id IS NULL;

DELETE FROM public.tags WHERE conversation_id IS NULL;
DELETE FROM public.tag_groups WHERE conversation_id IS NULL;
DELETE FROM public.context_rules WHERE conversation_id IS NULL;
DELETE FROM public.tag_suggestions WHERE conversation_id IS NULL;

ALTER TABLE public.tags ALTER COLUMN conversation_id SET NOT NULL;
ALTER TABLE public.tag_groups ALTER COLUMN conversation_id SET NOT NULL;
ALTER TABLE public.context_rules ALTER COLUMN conversation_id SET NOT NULL;
ALTER TABLE public.tag_suggestions ALTER COLUMN conversation_id SET NOT NULL;

-- Tag names are unique inside a notepad, not across the account.
ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS tags_user_id_normalized_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS tags_notepad_normalized_name_key
  ON public.tags (conversation_id, normalized_name);

CREATE INDEX IF NOT EXISTS tags_conversation_idx ON public.tags (conversation_id);
CREATE INDEX IF NOT EXISTS tag_groups_conversation_idx ON public.tag_groups (conversation_id);
CREATE INDEX IF NOT EXISTS context_rules_conversation_idx ON public.context_rules (conversation_id);
CREATE INDEX IF NOT EXISTS tag_suggestions_conversation_idx ON public.tag_suggestions (conversation_id);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.messages (conversation_id, created_at DESC);

-- Counts are per notepad now.
DROP FUNCTION IF EXISTS public.tag_message_counts();
CREATE OR REPLACE FUNCTION public.tag_message_counts(p_conversation_id uuid)
RETURNS TABLE(tag_id uuid, message_count bigint)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT mt.tag_id, count(DISTINCT mt.message_id)
  FROM public.message_tags mt
  JOIN public.tags t ON t.id = mt.tag_id
  WHERE mt.user_id = auth.uid() AND t.conversation_id = p_conversation_id
  GROUP BY mt.tag_id
$function$;

DROP FUNCTION IF EXISTS public.group_message_counts();
CREATE OR REPLACE FUNCTION public.group_message_counts(p_conversation_id uuid)
RETURNS TABLE(group_id uuid, message_count bigint)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT t.group_id, count(DISTINCT mt.message_id)
  FROM public.message_tags mt
  JOIN public.tags t ON t.id = mt.tag_id
  WHERE mt.user_id = auth.uid()
    AND t.group_id IS NOT NULL
    AND t.conversation_id = p_conversation_id
  GROUP BY t.group_id
$function$;

GRANT EXECUTE ON FUNCTION public.tag_message_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.group_message_counts(uuid) TO authenticated;

-- New accounts start with one notepad plus its own starter tags.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_notepad uuid;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email, ''), '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.conversations (user_id, title, accent, sort_order, completed_retention_days)
  VALUES (NEW.id, 'Flow', 'slate', 0, 7)
  RETURNING id INTO v_notepad;

  INSERT INTO public.user_preferences (user_id, completed_retention_days) VALUES (NEW.id, 7)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.tags (user_id, conversation_id, name, normalized_name, color, context)
  VALUES
    (NEW.id, v_notepad, 'Ideas', 'ideas', 'purple', 'Apply this tag when the message captures an idea, a concept worth exploring, a possible direction, or brainstorming.'),
    (NEW.id, v_notepad, 'Tasks', 'tasks', 'orange', 'Apply this tag when the message describes something that needs to be done, a to-do, a reminder, or a follow-up action.'),
    (NEW.id, v_notepad, 'Personal', 'personal', 'teal', 'Apply this tag when the message is about personal life, health, family, friends, feelings, or anything outside of work.'),
    (NEW.id, v_notepad, 'Work', 'work', 'blue', 'Apply this tag when the message relates to work, business operations, projects, clients, or professional responsibilities.')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;