CREATE TABLE IF NOT EXISTS public.message_revisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  message_id      uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  content         text NOT NULL,
  content_html    text,
  changed_by      text NOT NULL DEFAULT 'user',
  change_reason   text NOT NULL DEFAULT 'edit',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_revisions_unique UNIQUE (message_id, revision_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_revisions TO authenticated;
GRANT ALL ON public.message_revisions TO service_role;

ALTER TABLE public.message_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_revisions_own ON public.message_revisions;
CREATE POLICY message_revisions_own ON public.message_revisions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS message_revisions_lookup_idx
  ON public.message_revisions (message_id, revision_number DESC);

CREATE OR REPLACE FUNCTION public.capture_message_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_rev integer;
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    SELECT COALESCE(MAX(revision_number), 0) + 1 INTO next_rev
      FROM public.message_revisions WHERE message_id = OLD.id;
    INSERT INTO public.message_revisions
      (user_id, message_id, revision_number, content, content_html, changed_by, change_reason)
    VALUES (OLD.user_id, OLD.id, next_rev, OLD.content, OLD.content_html, 'user', 'edit');
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS messages_capture_revision ON public.messages;
CREATE TRIGGER messages_capture_revision
  BEFORE UPDATE OF content ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.capture_message_revision();

CREATE OR REPLACE FUNCTION public.revert_message(p_message_id uuid, p_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tgt_content text; tgt_html text;
BEGIN
  SELECT content, content_html INTO tgt_content, tgt_html
    FROM public.message_revisions
   WHERE message_id = p_message_id AND revision_number = p_revision AND user_id = auth.uid();
  IF tgt_content IS NULL THEN RAISE EXCEPTION 'Revision not found or not permitted'; END IF;
  UPDATE public.messages SET content = tgt_content, content_html = tgt_html
   WHERE id = p_message_id AND user_id = auth.uid();
END; $$;