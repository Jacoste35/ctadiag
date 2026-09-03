-- 1) Les demandes d'intervention sont reliées à l'intervention planifiée :
--    leur statut peut alors suivre celui de l'intervention.
-- 2) Suppression d'une demande par son auteur (ou le gérant).
-- 3) Indemnités kilométriques séparées du prix de la prestation sur les
--    interventions (pour établir la facture en différenciant les deux).

alter table public.cta_intervention_requests
  add column if not exists intervention_id uuid references public.cta_interventions(id) on delete set null;

drop policy if exists "cta_ireq_delete_own" on public.cta_intervention_requests;
create policy "cta_ireq_delete_own" on public.cta_intervention_requests
  for delete to authenticated using (partner_id = auth.uid() or public.cta_is_admin());

alter table public.cta_interventions
  add column if not exists travel_ht numeric(10,2);
