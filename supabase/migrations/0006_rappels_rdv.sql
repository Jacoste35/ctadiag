-- Rappels automatiques de rendez-vous : J-7, J-3 (72 h), J-1 (24 h) et jour J.
-- Un planificateur (pg_cron) appelle chaque matin la fonction Edge `send-reminders`
-- qui envoie les e-mails et journalise chaque envoi dans cta_reminders.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Journal des rappels envoyés (évite les doublons)
create table if not exists public.cta_reminders (
  id               uuid primary key default gen_random_uuid(),
  intervention_id  uuid not null references public.cta_interventions(id) on delete cascade,
  stage            text not null check (stage in ('j7','j3','j1','j0')),
  recipient        text,
  sent_at          timestamptz not null default now(),
  unique (intervention_id, stage)
);
alter table public.cta_reminders enable row level security;
create policy "cta_reminders_admin_select" on public.cta_reminders
  for select to authenticated using (public.cta_is_admin());

-- Réglages internes (clé secrète du planificateur) — accès service role uniquement
create table if not exists public.cta_settings (
  key   text primary key,
  value text not null
);
alter table public.cta_settings enable row level security;

insert into public.cta_settings (key, value)
values ('reminders_key', gen_random_uuid()::text)
on conflict (key) do nothing;

-- Tâche quotidienne à 05:00 UTC (≈ 6-7 h en France) : la clé est lue au moment
-- de l'exécution dans cta_settings, elle n'est pas codée en dur dans la tâche.
select cron.schedule(
  'cta-rappels-quotidiens',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://ooogbitnoqvrtwrpisnn.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Reminders-Key', (select value from public.cta_settings where key = 'reminders_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
