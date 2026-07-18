-- Add username and onboarding_completed columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Create unique index on username (only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles (username) WHERE username IS NOT NULL;

-- Migrate existing users: derive username from display_name
UPDATE public.profiles
SET username = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(display_name, '\s+', '_', 'g'), '[^a-zA-Z0-9_.]', '', 'g')),
    onboarding_completed = true
WHERE display_name IS NOT NULL AND display_name != '' AND username IS NULL;

-- Handle potential duplicates from migration by appending random suffix
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, username FROM public.profiles
    WHERE username IN (
      SELECT username FROM public.profiles GROUP BY username HAVING COUNT(*) > 1
    )
    ORDER BY created_at DESC
  LOOP
    UPDATE public.profiles
    SET username = r.username || '_' || SUBSTR(r.id::text, 1, 4)
    WHERE id = r.id;
  END LOOP;
END $$;
