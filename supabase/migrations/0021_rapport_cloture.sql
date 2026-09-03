-- Rapport de clôture d'intervention : cases cochées + note libre, rempli par
-- le gérant au moment de clôturer. Visible par le client dans son espace.
alter table public.cta_interventions
  add column if not exists closure_report jsonb,
  add column if not exists closed_at timestamptz;

-- Garde renforcée : les nouveaux champs (et les indemnités kilométriques,
-- oubliées jusqu'ici) ne sont modifiables que par l'administrateur.
create or replace function public.cta_guard_intervention_update()
returns trigger language plpgsql as $$
begin
  if public.cta_is_admin() then return new; end if;
  if new.partner_id        is distinct from old.partner_id
     or new.end_client_id  is distinct from old.end_client_id
     or new.date           is distinct from old.date
     or new.time_slot      is distinct from old.time_slot
     or new.type           is distinct from old.type
     or new.category       is distinct from old.category
     or new.equipment      is distinct from old.equipment
     or new.location       is distinct from old.location
     or new.status         is distinct from old.status
     or new.notes          is distinct from old.notes
     or new.amount_ht      is distinct from old.amount_ht
     or new.travel_ht      is distinct from old.travel_ht
     or new.closure_report is distinct from old.closure_report
     or new.closed_at      is distinct from old.closed_at
     or new.archived       is distinct from old.archived then
    raise exception 'Seul l''archivage de votre liste est modifiable';
  end if;
  return new;
end $$;
