-- Counts are derived from the message/tag links, never stored, so they can never
-- drift when messages are tagged, edited, untagged, or deleted. Distinct message
-- ids guarantee a message is never counted twice for the same tag.
CREATE OR REPLACE FUNCTION public.tag_message_counts()
RETURNS TABLE (tag_id uuid, message_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT mt.tag_id, count(DISTINCT mt.message_id)
  FROM public.message_tags mt
  WHERE mt.user_id = auth.uid()
  GROUP BY mt.tag_id
$$;

GRANT EXECUTE ON FUNCTION public.tag_message_counts() TO authenticated;