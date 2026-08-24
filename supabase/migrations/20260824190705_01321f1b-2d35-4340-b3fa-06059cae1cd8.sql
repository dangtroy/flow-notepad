ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS exclusion_hint    text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS positive_examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS negative_examples jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.learn_tag_examples()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snippet text := btrim(coalesce(NEW.body_snippet, ''));
BEGIN
  IF snippet = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.action IN ('accept', 'manual_add') THEN
    UPDATE public.tags t
    SET positive_examples = (
      SELECT coalesce(jsonb_agg(value ORDER BY ord DESC), '[]'::jsonb)
      FROM (
        SELECT value, row_number() OVER () AS ord
        FROM jsonb_array_elements(
          jsonb_build_array(to_jsonb(snippet)) ||
          (SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
           FROM jsonb_array_elements(t.positive_examples) e
           WHERE e <> to_jsonb(snippet))
        ) WITH ORDINALITY AS x(value, ord)
        LIMIT 10
      ) kept
    )
    WHERE t.id = NEW.tag_id AND t.user_id = NEW.user_id;
  ELSIF NEW.action IN ('reject', 'manual_remove') THEN
    UPDATE public.tags t
    SET negative_examples = (
      SELECT coalesce(jsonb_agg(value ORDER BY ord DESC), '[]'::jsonb)
      FROM (
        SELECT value, row_number() OVER () AS ord
        FROM jsonb_array_elements(
          jsonb_build_array(to_jsonb(snippet)) ||
          (SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
           FROM jsonb_array_elements(t.negative_examples) e
           WHERE e <> to_jsonb(snippet))
        ) WITH ORDINALITY AS x(value, ord)
        LIMIT 10
      ) kept
    )
    WHERE t.id = NEW.tag_id AND t.user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tag_feedback_learn_examples ON public.tag_feedback;
CREATE TRIGGER tag_feedback_learn_examples
AFTER INSERT ON public.tag_feedback
FOR EACH ROW EXECUTE FUNCTION public.learn_tag_examples();