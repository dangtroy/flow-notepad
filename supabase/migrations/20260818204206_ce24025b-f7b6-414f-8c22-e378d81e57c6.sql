ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS original_content text,
  ADD COLUMN IF NOT EXISTS original_content_html text,
  ADD COLUMN IF NOT EXISTS cleaned_content text,
  ADD COLUMN IF NOT EXISTS cleaned_content_html text,
  ADD COLUMN IF NOT EXISTS ai_cleaned boolean NOT NULL DEFAULT false;