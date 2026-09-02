-- Livraison clé en main :
-- 1) rôle admin (le gérant) + type de client (direct / distributeur)
-- 2) droits d'administration sur toutes les tables cta_* et sur les demandes de devis
-- 3) gestion des jours bloqués depuis le back-office

alter table public.cta_partners
  add column if not exists role text not null default 'client' check (role in ('client','admin')),
  add column if not exists client_type text not null default 'direct' check (client_type in ('direct','distributeur'));

-- Vrai si l'utilisateur connecté est administrateur (security definer :
-- contourne la RLS de cta_partners pour éviter la récursion des policies).
create or replace function public.cta_is_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.cta_partners where id = auth.uid() and role = 'admin') $$;

-- Partenaires : l'admin voit et modifie tout le monde
create policy "cta_partners_admin_select" on public.cta_partners
  for select to authenticated using (public.cta_is_admin());
create policy "cta_partners_admin_update" on public.cta_partners
  for update to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());

-- Interventions / documents / grille : gestion complète par l'admin
create policy "cta_interventions_admin_all" on public.cta_interventions
  for all to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());
create policy "cta_documents_admin_all" on public.cta_documents
  for all to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());
create policy "cta_price_grid_admin_all" on public.cta_price_grid
  for all to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());

-- Tickets : l'admin voit tout, répond en tant que « cta », change les statuts
create policy "cta_tickets_admin_select" on public.cta_tickets
  for select to authenticated using (public.cta_is_admin());
create policy "cta_tickets_admin_update" on public.cta_tickets
  for update to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());
create policy "cta_ticket_messages_admin_select" on public.cta_ticket_messages
  for select to authenticated using (public.cta_is_admin());
create policy "cta_ticket_messages_admin_insert" on public.cta_ticket_messages
  for insert to authenticated with check (public.cta_is_admin() and author = 'cta');

-- Demandes de devis du site : consultation et traitement par l'admin
create policy "quote_requests_admin_select" on public.quote_requests
  for select to authenticated using (public.cta_is_admin());
create policy "quote_requests_admin_update" on public.quote_requests
  for update to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());
create policy "quote_requests_admin_delete" on public.quote_requests
  for delete to authenticated using (public.cta_is_admin());

-- Jours bloqués du calendrier : gérés par l'admin
create policy "blocked_dates_admin_all" on public.blocked_dates
  for all to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());

-- Statut « nouveau / traité » plus explicite sur les demandes de devis
alter table public.quote_requests
  drop constraint if exists quote_requests_status_check;
alter table public.quote_requests
  add constraint quote_requests_status_check check (status in ('new','traite','archive'));
