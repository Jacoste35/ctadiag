-- Archivage des interventions, indépendant de chaque côté :
--   archived         : archive du gérant (back-office)
--   client_archived  : archive du client (son espace)
-- Un client peut uniquement basculer client_archived sur ses propres
-- interventions ; un trigger bloque toute autre modification.

alter table public.cta_interventions
  add column if not exists archived boolean not null default false,
  add column if not exists client_archived boolean not null default false;

create or replace function public.cta_guard_intervention_update()
returns trigger language plpgsql as $$
begin
  if public.cta_is_admin() then return new; end if;
  if new.partner_id      is distinct from old.partner_id
     or new.end_client_id is distinct from old.end_client_id
     or new.date          is distinct from old.date
     or new.time_slot     is distinct from old.time_slot
     or new.type          is distinct from old.type
     or new.category      is distinct from old.category
     or new.equipment     is distinct from old.equipment
     or new.location      is distinct from old.location
     or new.status        is distinct from old.status
     or new.notes         is distinct from old.notes
     or new.amount_ht     is distinct from old.amount_ht
     or new.archived      is distinct from old.archived then
    raise exception 'Seul l''archivage de votre liste est modifiable';
  end if;
  return new;
end $$;

drop trigger if exists cta_guard_intervention_update on public.cta_interventions;
create trigger cta_guard_intervention_update
  before update on public.cta_interventions
  for each row execute function public.cta_guard_intervention_update();

create policy "cta_interventions_update_own_archive" on public.cta_interventions
  for update to authenticated
  using (partner_id = auth.uid())
  with check (partner_id = auth.uid());
