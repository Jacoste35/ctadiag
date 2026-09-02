-- 1) Mot de passe provisoire : changement obligatoire à la première connexion
-- 2) Inventaire du matériel (valises, bancs, stations) avec suivi prêt / location

alter table public.cta_partners
  add column if not exists must_change_password boolean not null default false;

create table if not exists public.cta_equipment (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  ref                text,
  status             text not null default 'disponible'
                     check (status in ('disponible','prete','louee','en_intervention','indisponible')),
  holder_partner_id  uuid references public.cta_partners(id) on delete set null,
  holder_note        text,
  since              date,
  notes              text,
  created_at         timestamptz not null default now()
);
alter table public.cta_equipment enable row level security;
create policy "cta_equipment_admin_all" on public.cta_equipment
  for all to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());
