-- 1. Create missing tags for context rules
INSERT INTO public.tags (user_id, conversation_id, name, normalized_name, context)
SELECT DISTINCT ON (cr.conversation_id, lower(btrim(cr.tag_name)))
  cr.user_id, cr.conversation_id, btrim(cr.tag_name), lower(btrim(cr.tag_name)), cr.context
FROM public.context_rules cr
WHERE btrim(cr.tag_name) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.tags t
    WHERE t.user_id = cr.user_id
      AND t.conversation_id = cr.conversation_id
      AND t.normalized_name = lower(btrim(cr.tag_name))
  )
ORDER BY cr.conversation_id, lower(btrim(cr.tag_name)), cr.created_at ASC;

-- 2. Copy context into existing tags that have none
UPDATE public.tags t
SET context = src.context
FROM (
  SELECT DISTINCT ON (cr.conversation_id, lower(btrim(cr.tag_name)))
    cr.user_id, cr.conversation_id, lower(btrim(cr.tag_name)) AS normalized_name, cr.context
  FROM public.context_rules cr
  WHERE btrim(cr.tag_name) <> '' AND btrim(cr.context) <> ''
  ORDER BY cr.conversation_id, lower(btrim(cr.tag_name)), cr.created_at ASC
) src
WHERE t.user_id = src.user_id
  AND t.conversation_id = src.conversation_id
  AND t.normalized_name = src.normalized_name
  AND btrim(coalesce(t.context, '')) = '';

-- 3. Drop the orphaned table
DROP TABLE public.context_rules;