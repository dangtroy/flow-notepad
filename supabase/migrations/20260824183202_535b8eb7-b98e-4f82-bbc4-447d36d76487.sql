REVOKE ALL ON FUNCTION public.capture_message_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revert_message(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_message(uuid, integer) TO authenticated;