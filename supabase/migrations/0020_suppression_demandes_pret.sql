-- Les demandes de prêt / location peuvent être supprimées par leur auteur
-- (en plus de l'administrateur, déjà couvert par cta_eqreq_admin_delete).
drop policy if exists "cta_eqreq_delete_own" on public.cta_equipment_requests;
create policy "cta_eqreq_delete_own" on public.cta_equipment_requests
  for delete to authenticated using (partner_id = auth.uid());
