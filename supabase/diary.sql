-- CINEJOY database, Phase 2 step a: Diary & Stats.
-- Ratings keep the title's details (genres, countries, creators, runtime) so the
-- diary and stats can be worked out without looking every title up again.
-- Safe to run more than once.

alter table public.ratings add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.ratings add column if not exists original_language text check (char_length(original_language) <= 10);
alter table public.ratings add column if not exists release_date date;
