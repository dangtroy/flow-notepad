-- Tag context/logic and enabled state live on the tag itself, so a tag is one
-- reusable entity: name + color + AI context + enabled.
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true;

-- Carry any existing standalone context rules onto their matching tag.
UPDATE public.tags t
SET context = r.context,
    is_enabled = r.is_enabled
FROM public.context_rules r
WHERE r.user_id = t.user_id
  AND lower(btrim(r.tag_name)) = lower(btrim(t.name))
  AND coalesce(t.context, '') = '';

-- Any rule without a tag becomes a tag so nothing is lost.
INSERT INTO public.tags (user_id, name, normalized_name, context, is_enabled)
SELECT r.user_id,
       btrim(r.tag_name),
       btrim(lower(regexp_replace(r.tag_name, '[^a-zA-Z0-9]+', ' ', 'g'))),
       r.context,
       r.is_enabled
FROM public.context_rules r
ON CONFLICT (user_id, normalized_name) DO NOTHING;

-- Deleting a tag must simply drop its links, never block.
ALTER TABLE public.message_tags DROP CONSTRAINT IF EXISTS message_tags_tag_id_fkey;
ALTER TABLE public.message_tags
  ADD CONSTRAINT message_tags_tag_id_fkey
  FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS message_tags_tag_idx ON public.message_tags (user_id, tag_id, message_id);

-- New accounts start with a few tags that behave exactly like custom ones.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email, ''), '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.conversations (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_preferences (user_id, completed_retention_days) VALUES (NEW.id, 7)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.tags (user_id, name, normalized_name, color, context)
  VALUES
    (NEW.id, 'Ideas', 'ideas', 'purple', 'Apply this tag when the message captures an idea, a concept worth exploring, a possible direction, or brainstorming.'),
    (NEW.id, 'Tasks', 'tasks', 'orange', 'Apply this tag when the message describes something that needs to be done, a to-do, a reminder, or a follow-up action.'),
    (NEW.id, 'Personal', 'personal', 'teal', 'Apply this tag when the message is about personal life, health, family, friends, feelings, or anything outside of work.'),
    (NEW.id, 'Work', 'work', 'blue', 'Apply this tag when the message relates to work, business operations, projects, clients, or professional responsibilities.')
  ON CONFLICT (user_id, normalized_name) DO NOTHING;

  RETURN NEW;
END;
$function$;