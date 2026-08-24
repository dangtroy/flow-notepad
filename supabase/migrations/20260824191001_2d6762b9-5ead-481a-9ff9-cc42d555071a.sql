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
      SELECT coalesce(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
      FROM (
        SELECT value, ord
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
      SELECT coalesce(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
      FROM (
        SELECT value, ord
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

REVOKE ALL ON FUNCTION public.learn_tag_examples() FROM PUBLIC, anon, authenticated;