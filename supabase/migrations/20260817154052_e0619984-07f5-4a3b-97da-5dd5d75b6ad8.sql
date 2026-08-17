ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS content_html text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.messages
SET content_html = '<p>' || replace(replace(replace(content, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>'
WHERE content_html IS NULL;

CREATE INDEX IF NOT EXISTS messages_user_created_idx ON public.messages (user_id, created_at DESC, id DESC);