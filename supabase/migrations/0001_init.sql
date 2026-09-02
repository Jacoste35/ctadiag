-- Backend CTA · Conseil Technique Auto
-- 1) Demandes de devis (écrites uniquement par la fonction Edge `submit-quote` via service role)
-- 2) Jours bloqués du calendrier de rendez-vous (lecture publique)

create table if not exists public.quote_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  contact     text not null,
  services    text[] not null default '{}',
  rdv_day     date,
  rdv_slot    text,
  message     text,
  consent     boolean not null default false,
  status      text not null default 'new' -- new | contacted | quoted | closed
);

alter table public.quote_requests enable row level security;
-- Aucune policy anon : la table n'est accessible qu'avec la clé service role
-- (fonction Edge) ou depuis le dashboard Supabase.

create table if not exists public.blocked_dates (
  day         date primary key,
  reason      text,
  created_at  timestamptz not null default now()
);

alter table public.blocked_dates enable row level security;

create policy "blocked_dates_lecture_publique"
  on public.blocked_dates for select
  to anon, authenticated
  using (true);
