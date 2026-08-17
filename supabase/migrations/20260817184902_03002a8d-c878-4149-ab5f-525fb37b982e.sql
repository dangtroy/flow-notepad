-- Tag suggestions + group context + deterministic keywords
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS match_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auto_apply boolean NOT NULL DEFAULT true;

ALTER TABLE public.tag_groups
  ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT '';

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS ai_fingerprint text;

CREATE TABLE IF NOT EXISTS public.tag_suggestions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'new_tag',
  tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  reason text NOT NULL DEFAULT '',
  suggested_group_id uuid REFERENCES public.tag_groups(id) ON DELETE SET NULL,
  suggested_group_name text,
  message_ids uuid[] NOT NULL DEFAULT '{}',
  evidence_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_suggestions TO authenticated;
GRANT ALL ON public.tag_suggestions TO service_role;
ALTER TABLE public.tag_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tag_suggestions_own ON public.tag_suggestions;
CREATE POLICY tag_suggestions_own ON public.tag_suggestions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS tag_suggestions_unique_open
  ON public.tag_suggestions (user_id, kind, normalized_name);

CREATE INDEX IF NOT EXISTS tag_suggestions_status_idx
  ON public.tag_suggestions (user_id, status);

DROP TRIGGER IF EXISTS tag_suggestions_updated_at ON public.tag_suggestions;
CREATE TRIGGER tag_suggestions_updated_at BEFORE UPDATE ON public.tag_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Unique message counts per group (no double counting across child tags)
CREATE OR REPLACE FUNCTION public.group_message_counts()
RETURNS TABLE(group_id uuid, message_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT t.group_id, count(DISTINCT mt.message_id)
  FROM public.message_tags mt
  JOIN public.tags t ON t.id = mt.tag_id
  WHERE mt.user_id = auth.uid() AND t.group_id IS NOT NULL
  GROUP BY t.group_id
$$;