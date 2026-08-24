ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS accept_count        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reject_count        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maturity            text    NOT NULL DEFAULT 'unproven',
  ADD COLUMN IF NOT EXISTS auto_apply_override boolean,
  ADD COLUMN IF NOT EXISTS last_decision_at    timestamptz,
  ADD COLUMN IF NOT EXISTS graduated_at        timestamptz,
  ADD COLUMN IF NOT EXISTS graduation_ack_at   timestamptz;

ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS tags_maturity_check;
ALTER TABLE public.tags ADD CONSTRAINT tags_maturity_check
  CHECK (maturity IN ('unproven','trusted','demoted'));

ALTER TABLE public.message_tags
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'applied';
ALTER TABLE public.message_tags DROP CONSTRAINT IF EXISTS message_tags_status_check;
ALTER TABLE public.message_tags ADD CONSTRAINT message_tags_status_check
  CHECK (status IN ('applied','suggested'));

CREATE TABLE IF NOT EXISTS public.tag_feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tag_id       uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  message_id   uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  action       text NOT NULL CHECK (action IN ('accept','reject','manual_add','manual_remove')),
  body_snippet text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.tag_feedback TO authenticated;
GRANT ALL ON public.tag_feedback TO service_role;

ALTER TABLE public.tag_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tag_feedback_own ON public.tag_feedback;
CREATE POLICY tag_feedback_own ON public.tag_feedback
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS tag_feedback_tag_created_idx
  ON public.tag_feedback (tag_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.recompute_tag_maturity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_acc int; v_rej int; v_rate numeric; v_recent numeric; v_mat text; v_prev text;
BEGIN
  IF NEW.action IN ('accept','manual_add') THEN
    UPDATE public.tags SET accept_count = accept_count + 1, last_decision_at = now() WHERE id = NEW.tag_id;
  ELSE
    UPDATE public.tags SET reject_count = reject_count + 1, last_decision_at = now() WHERE id = NEW.tag_id;
  END IF;

  SELECT accept_count, reject_count, maturity INTO v_acc, v_rej, v_prev
    FROM public.tags WHERE id = NEW.tag_id;
  v_rate := CASE WHEN (v_acc + v_rej) = 0 THEN 0 ELSE v_acc::numeric / (v_acc + v_rej) END;

  SELECT CASE WHEN COUNT(*) = 0 THEN 1
    ELSE SUM(CASE WHEN action IN ('accept','manual_add') THEN 1 ELSE 0 END)::numeric / COUNT(*) END
    INTO v_recent
    FROM (SELECT action FROM public.tag_feedback WHERE tag_id = NEW.tag_id ORDER BY created_at DESC LIMIT 5) r;

  IF v_acc >= 3 AND v_rate >= 0.70 AND v_recent >= 0.50 THEN v_mat := 'trusted';
  ELSIF v_acc >= 3 AND v_recent < 0.50 THEN v_mat := 'demoted';
  ELSE v_mat := 'unproven';
  END IF;

  UPDATE public.tags
     SET maturity = v_mat,
         auto_apply = COALESCE(auto_apply_override, v_mat = 'trusted'),
         graduated_at = CASE
           WHEN v_mat = 'trusted' AND v_prev <> 'trusted' AND graduated_at IS NULL THEN now()
           ELSE graduated_at END
   WHERE id = NEW.tag_id;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.recompute_tag_maturity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tag_feedback_recompute ON public.tag_feedback;
CREATE TRIGGER tag_feedback_recompute
  AFTER INSERT ON public.tag_feedback
  FOR EACH ROW EXECUTE FUNCTION public.recompute_tag_maturity();

UPDATE public.tags SET maturity = 'trusted', auto_apply_override = true, graduation_ack_at = now()
 WHERE auto_apply = true;

UPDATE public.tags t SET auto_apply_override = true, maturity = 'trusted', graduation_ack_at = now()
 FROM public.tag_groups g
 WHERE t.group_id = g.id AND g.name = 'Tasks';