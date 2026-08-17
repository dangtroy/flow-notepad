CREATE TABLE public.tag_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT 'slate',
  sort_order integer NOT NULL DEFAULT 0,
  is_collapsed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_groups TO authenticated;
GRANT ALL ON public.tag_groups TO service_role;
ALTER TABLE public.tag_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY tag_groups_own ON public.tag_groups FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER tag_groups_set_updated_at BEFORE UPDATE ON public.tag_groups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tags
  ADD COLUMN group_id uuid REFERENCES public.tag_groups(id) ON DELETE SET NULL,
  ADD COLUMN is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX tags_group_idx ON public.tags(user_id, group_id);