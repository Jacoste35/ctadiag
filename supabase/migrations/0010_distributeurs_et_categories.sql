-- 1) Catégorisation des interventions (lisibilité et filtres)
-- 2) Fiches clients finaux créées par les distributeurs
-- 3) Demandes d'intervention envoyées par les distributeurs au gérant

-- Catégories
alter table public.cta_interventions
  add column if not exists category text not null default 'autre'
  check (category in ('conseil','valise','atf','adas','distance','autre'));

update public.cta_interventions set category = case
  when type ilike '%adas%' then 'adas'
  when type ilike '%atf%' then 'atf'
  when type ilike '%valise%' or type ilike '%ms9%' or type ilike '%ultra%' then 'valise'
  when type ilike '%distance%' then 'distance'
  when type ilike '%conseil%' then 'conseil'
  else 'autre' end;

-- Fiches clients finaux (les clients des distributeurs : pas de compte de connexion)
create table if not exists public.cta_end_clients (
  id              uuid primary key default gen_random_uuid(),
  distributor_id  uuid not null references public.cta_partners(id) on delete cascade,
  company_name    text not null,
  contact_name    text,
  phone           text,
  email           text,
  address         text,
  notes           text,
  created_at      timestamptz not null default now()
);
alter table public.cta_end_clients enable row level security;
create policy "cta_end_clients_own_or_admin" on public.cta_end_clients
  for all to authenticated
  using (distributor_id = auth.uid() or public.cta_is_admin())
  with check (distributor_id = auth.uid() or public.cta_is_admin());

-- Lien intervention → client final (historique par fiche)
alter table public.cta_interventions
  add column if not exists end_client_id uuid references public.cta_end_clients(id) on delete set null;

-- Demandes d'intervention (envoyées par les distributeurs, planifiées par le gérant)
create table if not exists public.cta_intervention_requests (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.cta_partners(id) on delete cascade,
  end_client_id  uuid references public.cta_end_clients(id) on delete set null,
  category       text not null default 'autre'
                 check (category in ('conseil','valise','atf','adas','distance','autre')),
  desired_date   date,
  desired_slot   text,
  equipment      text,
  location       text,
  message        text,
  status         text not null default 'nouvelle'
                 check (status in ('nouvelle','acceptee','refusee')),
  created_at     timestamptz not null default now()
);
alter table public.cta_intervention_requests enable row level security;
create policy "cta_ireq_select_own" on public.cta_intervention_requests
  for select to authenticated using (partner_id = auth.uid() or public.cta_is_admin());
create policy "cta_ireq_insert_own" on public.cta_intervention_requests
  for insert to authenticated with check (partner_id = auth.uid());
create policy "cta_ireq_admin_update" on public.cta_intervention_requests
  for update to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());
create policy "cta_ireq_admin_delete" on public.cta_intervention_requests
  for delete to authenticated using (public.cta_is_admin());
