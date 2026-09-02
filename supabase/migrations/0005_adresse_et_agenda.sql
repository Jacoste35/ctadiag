-- 1) Adresse postale des clients (déplacements, courriers)
-- 2) Jetons d'abonnement à l'agenda (flux iCalendar pour le téléphone du gérant)

alter table public.cta_partners
  add column if not exists address text;

create table if not exists public.cta_calendar_tokens (
  token       uuid primary key default gen_random_uuid(),
  partner_id  uuid references public.cta_partners(id) on delete cascade, -- null = agenda complet du gérant
  label       text,
  created_at  timestamptz not null default now()
);
alter table public.cta_calendar_tokens enable row level security;
create policy "cta_calendar_tokens_admin_all" on public.cta_calendar_tokens
  for all to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());
