-- 1) Ville sur les demandes de devis ; code postal + ville sur les fiches clients finaux
-- 2) Suppression d'intervention ouverte aux distributeurs (en plus du gérant)
-- 3) Liste des appareils (noms seuls, sans prix) visible de tous les comptes
-- 4) Demandes de prêt / location de matériel
-- 5) Mise en service à distance : activation par client + guides du bot
-- 6) Notifications push (abonnements + envoi sur nouveau message de ticket)

-- ---------- Adresses ----------
alter table public.quote_requests
  add column if not exists city text;

alter table public.cta_end_clients
  add column if not exists postal_code text,
  add column if not exists city text;

-- ---------- Suppression d'intervention (gérant ou distributeur propriétaire) ----------
drop policy if exists "cta_interventions_delete_distrib" on public.cta_interventions;
create policy "cta_interventions_delete_distrib" on public.cta_interventions
  for delete to authenticated using (
    public.cta_is_admin()
    or (partner_id = auth.uid() and exists (
      select 1 from public.cta_partners p
      where p.id = auth.uid() and p.client_type = 'distributeur'))
  );

-- ---------- Liste des appareils (sans les prix) ----------
-- Vue possédée par postgres : elle contourne la RLS de cta_products et
-- n'expose que les colonnes sans tarif.
create or replace view public.cta_product_names
with (security_barrier) as
  select id, sort, category, name, reference from public.cta_products;
revoke all on public.cta_product_names from anon, authenticated;
grant select on public.cta_product_names to authenticated;

-- ---------- Prêt / location de matériel ----------
create table if not exists public.cta_equipment_requests (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.cta_partners(id) on delete cascade,
  product_name text not null,
  kind         text not null default 'pret' check (kind in ('pret','location')),
  duration     text,
  start_date   date,
  message      text,
  status       text not null default 'nouvelle'
               check (status in ('nouvelle','acceptee','refusee','terminee')),
  created_at   timestamptz not null default now()
);
alter table public.cta_equipment_requests enable row level security;
create policy "cta_eqreq_select_own_or_admin" on public.cta_equipment_requests
  for select to authenticated using (partner_id = auth.uid() or public.cta_is_admin());
create policy "cta_eqreq_insert_own" on public.cta_equipment_requests
  for insert to authenticated with check (partner_id = auth.uid());
create policy "cta_eqreq_admin_update" on public.cta_equipment_requests
  for update to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());
create policy "cta_eqreq_admin_delete" on public.cta_equipment_requests
  for delete to authenticated using (public.cta_is_admin());

-- ---------- Mise en service à distance ----------
alter table public.cta_partners
  add column if not exists remote_setup_enabled boolean not null default false;

create table if not exists public.cta_setup_guides (
  id         uuid primary key default gen_random_uuid(),
  device     text not null,
  steps      text not null,
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.cta_setup_guides enable row level security;
create policy "cta_setup_guides_select_auth" on public.cta_setup_guides
  for select to authenticated using (enabled = true or public.cta_is_admin());
create policy "cta_setup_guides_admin_write" on public.cta_setup_guides
  for all to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());

insert into public.cta_setup_guides (device, steps) values
  ('MS909',
   E'Chargez la valise sur secteur d''origine pendant au moins 30 minutes avant la première mise en route.\nMaintenez le bouton d''alimentation 5 secondes : le logo Autel apparaît.\nConnectez la valise au wifi de l''atelier (Réglages > Wi-Fi).\nCréez ou connectez votre compte Autel (e-mail de l''atelier).\nEnregistrez la valise : Réglages > Autel ID > Enregistrer, avec le numéro de série au dos.\nLancez la mise à jour complète depuis l''application Update (prévoir 45 min).\nBranchez le VCI sur la prise OBD d''un véhicule et vérifiez l''appairage (icône VCI verte).\nSi une étape bloque, ouvrez un ticket dans la messagerie : nous prenons la main à distance.');

-- ---------- Notifications push ----------
create table if not exists public.cta_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.cta_partners(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.cta_push_subscriptions enable row level security;
create policy "cta_push_own_all" on public.cta_push_subscriptions
  for all to authenticated
  using (partner_id = auth.uid() or public.cta_is_admin())
  with check (partner_id = auth.uid() or public.cta_is_admin());

-- Clés VAPID (la clé publique est aussi dans js/config.js côté site)
insert into public.cta_settings (key, value) values
  ('vapid_public_key',  'BGJqczrJWqP-5E5GVSK-GXw_ZFzZXId4SSsRxvNVHJm0B3rW2JXYFpBP-rKtmBnTkFaqtR-HuqZQIutT8LsLehE'),
  ('vapid_private_key', 'fOaBEBwspQwTxClpOPqNi0ItOJ-S6yujuKvyypS08ms'),
  ('vapid_subject',     'mailto:contact@cta-auto.fr')
on conflict (key) do nothing;

-- Chaque nouveau message de ticket déclenche l'envoi des notifications push
-- (la fonction Edge send-push décide des destinataires : client ou gérant).
create or replace function public.cta_notify_ticket_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://ooogbitnoqvrtwrpisnn.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Reminders-Key', (select value from public.cta_settings where key = 'reminders_key')
    ),
    body := jsonb_build_object(
      'event', 'ticket_message',
      'ticket_id', new.ticket_id,
      'author', new.author,
      'is_auto', new.is_auto
    )
  );
  return new;
end $$;
revoke execute on function public.cta_notify_ticket_message() from public, anon, authenticated;

drop trigger if exists cta_on_ticket_message_push on public.cta_ticket_messages;
create trigger cta_on_ticket_message_push
  after insert on public.cta_ticket_messages
  for each row execute function public.cta_notify_ticket_message();
