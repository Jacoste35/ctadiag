-- Espace partenaires CTA : profils, interventions, devis/factures,
-- grille distributeur et messagerie de tickets.
-- Tables préfixées cta_ (le projet Supabase héberge une autre application).

-- Profil partenaire (1 ligne par utilisateur Supabase Auth)
create table if not exists public.cta_partners (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  company_name text,
  contact_name text,
  phone        text,
  created_at   timestamptz not null default now()
);
alter table public.cta_partners enable row level security;
create policy "cta_partners_select_own" on public.cta_partners
  for select to authenticated using (id = auth.uid());
create policy "cta_partners_update_own" on public.cta_partners
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Création automatique du profil à la création d'un utilisateur
create or replace function public.cta_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.cta_partners (id, email, company_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'company_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists cta_on_auth_user_created on auth.users;
create trigger cta_on_auth_user_created
  after insert on auth.users for each row execute function public.cta_handle_new_user();

-- Suivi des interventions
create table if not exists public.cta_interventions (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.cta_partners(id) on delete cascade,
  date        date,
  time_slot   text,
  type        text not null,
  equipment   text,
  location    text,
  status      text not null default 'planifiee'
              check (status in ('planifiee','en_cours','terminee','annulee')),
  notes       text,
  created_at  timestamptz not null default now()
);
alter table public.cta_interventions enable row level security;
create policy "cta_interventions_select_own" on public.cta_interventions
  for select to authenticated using (partner_id = auth.uid());

-- Devis et factures
create table if not exists public.cta_documents (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.cta_partners(id) on delete cascade,
  kind         text not null check (kind in ('devis','facture')),
  reference    text not null,
  label        text,
  amount_ht    numeric(10,2),
  status       text not null default 'en_attente'
               check (status in ('en_attente','accepte','refuse','a_regler','payee')),
  issued_on    date not null default current_date,
  file_url     text,
  created_at   timestamptz not null default now()
);
alter table public.cta_documents enable row level security;
create policy "cta_documents_select_own" on public.cta_documents
  for select to authenticated using (partner_id = auth.uid());

-- Grille distributeur (visible par tout partenaire connecté)
create table if not exists public.cta_price_grid (
  id               uuid primary key default gen_random_uuid(),
  sort             int not null default 0,
  label            text not null,
  public_price_ht  numeric(10,2),
  partner_price_ht numeric(10,2),
  note             text
);
alter table public.cta_price_grid enable row level security;
create policy "cta_price_grid_select_authenticated" on public.cta_price_grid
  for select to authenticated using (true);

-- Messagerie : tickets
create table if not exists public.cta_tickets (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.cta_partners(id) on delete cascade,
  subject     text not null,
  status      text not null default 'ouvert'
              check (status in ('ouvert','en_cours','resolu','ferme')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.cta_tickets enable row level security;
create policy "cta_tickets_select_own" on public.cta_tickets
  for select to authenticated using (partner_id = auth.uid());
create policy "cta_tickets_insert_own" on public.cta_tickets
  for insert to authenticated with check (partner_id = auth.uid());
create policy "cta_tickets_update_own" on public.cta_tickets
  for update to authenticated using (partner_id = auth.uid()) with check (partner_id = auth.uid());

-- Messagerie : messages d'un ticket
create table if not exists public.cta_ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.cta_tickets(id) on delete cascade,
  author      text not null default 'partner' check (author in ('partner','cta')),
  author_id   uuid,
  body        text not null,
  created_at  timestamptz not null default now()
);
alter table public.cta_ticket_messages enable row level security;
create policy "cta_ticket_messages_select_own" on public.cta_ticket_messages
  for select to authenticated using (
    exists (select 1 from public.cta_tickets t
            where t.id = ticket_id and t.partner_id = auth.uid())
  );
create policy "cta_ticket_messages_insert_own" on public.cta_ticket_messages
  for insert to authenticated with check (
    author = 'partner' and author_id = auth.uid()
    and exists (select 1 from public.cta_tickets t
                where t.id = ticket_id and t.partner_id = auth.uid())
  );

-- Un nouveau message met le ticket à jour (et le rouvre s'il était clos)
create or replace function public.cta_touch_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.cta_tickets
     set updated_at = now(),
         status = case when new.author = 'partner' and status in ('resolu','ferme')
                       then 'ouvert' else status end
   where id = new.ticket_id;
  return new;
end $$;
drop trigger if exists cta_on_ticket_message on public.cta_ticket_messages;
create trigger cta_on_ticket_message
  after insert on public.cta_ticket_messages for each row execute function public.cta_touch_ticket();

-- Grille distributeur : valeurs d'exemple (tarif partenaire à ajuster dans le dashboard)
insert into public.cta_price_grid (sort, label, public_price_ht, partner_price_ht, note) values
  (1, 'Mise en service à distance (tél / e-mail)', 50.00, 42.50, 'Tarif partenaire d''exemple — à ajuster'),
  (2, 'Installation valise diagnostic · petit outil', 175.00, 148.75, 'Tarif partenaire d''exemple — à ajuster'),
  (3, 'Installation Autel gamme Maxi (MS909 / MS908S)', 350.00, 297.50, 'Tarif partenaire d''exemple — à ajuster'),
  (4, 'Installation Autel gamme Maxi (MS919 / MS Ultra)', 425.00, 361.25, 'Tarif partenaire d''exemple — à ajuster'),
  (5, 'Mise en service station ATF', 380.00, 323.00, 'Tarif partenaire d''exemple — à ajuster'),
  (6, 'Conseil, installation & calibration ADAS', 550.00, 467.50, 'Tarif partenaire d''exemple — à ajuster');
