ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_one_per_user;

ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS tags_unique_per_user;
CREATE UNIQUE INDEX IF NOT EXISTS tags_unique_per_notepad
  ON public.tags (conversation_id, normalized_name);