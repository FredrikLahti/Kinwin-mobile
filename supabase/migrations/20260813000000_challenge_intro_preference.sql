-- The "How Kinwin works" explainer shown at the start of every challenge
-- creation now offers "Don't show this again". That preference belongs to
-- the person, not the device, so a reinstall or a second device honors it
-- too. A single boolean on profiles is enough: true means "show it" (the
-- default for every existing and new row, since no one has opted out
-- yet), false means the user explicitly turned it off and can turn it
-- back on from Account.
alter table public.profiles
  add column show_challenge_intro boolean not null default true;

grant update (show_challenge_intro) on table public.profiles to authenticated;
