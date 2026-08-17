ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS parent_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS messages_parent_idx ON public.messages(user_id, parent_message_id, created_at);
UPDATE public.tags SET color = 'slate' WHERE color IS NULL;
ALTER TABLE public.tags ALTER COLUMN color SET DEFAULT 'slate';