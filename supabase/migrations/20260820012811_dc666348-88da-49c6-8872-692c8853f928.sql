ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'stream';

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_type_check CHECK (type IN ('stream', 'pinned', 'reference'));

CREATE INDEX IF NOT EXISTS messages_user_conversation_type_idx
  ON public.messages (user_id, conversation_id, type);