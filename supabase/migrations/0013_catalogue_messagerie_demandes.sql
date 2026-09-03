-- 1) Catalogue des valises de diagnostic (tarif public conseillé + prix net distributeur),
--    avec le prix net du gérant dans une table séparée visible de lui seul.
-- 2) Réponses automatiques de la messagerie (apprentissage des cas récurrents).
-- 3) Catégorie sur la grille de prestations (affichage du prix facturé au distributeur
--    dans les demandes d'intervention).
-- 4) Type de demandeur (garage / distributeur) sur les demandes de devis du site.

-- ---------- Catalogue produits ----------
create table if not exists public.cta_products (
  id               uuid primary key default gen_random_uuid(),
  sort             int not null default 0,
  category         text not null default 'Autre',
  name             text not null,
  reference        text,
  public_price_ht  numeric(10,2),
  distrib_price_ht numeric(10,2),
  created_at       timestamptz not null default now()
);
alter table public.cta_products enable row level security;
-- Visible des distributeurs et du gérant uniquement (pas des clients directs)
create policy "cta_products_select_distrib_admin" on public.cta_products
  for select to authenticated using (
    public.cta_is_admin()
    or exists (select 1 from public.cta_partners p
               where p.id = auth.uid() and p.client_type = 'distributeur')
  );
create policy "cta_products_admin_write" on public.cta_products
  for all to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());

-- Prix net du gérant : table séparée, lisible et modifiable par le gérant seul
create table if not exists public.cta_product_admin_costs (
  product_id     uuid primary key references public.cta_products(id) on delete cascade,
  admin_price_ht numeric(10,2)
);
alter table public.cta_product_admin_costs enable row level security;
create policy "cta_product_admin_costs_admin_only" on public.cta_product_admin_costs
  for all to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());

-- Tarif 2026 (source : tarif Autel France applicable au 1er janvier 2026)
insert into public.cta_products (sort, category, name, reference, public_price_ht, distrib_price_ht) values
  (10,  'Gamme MaxiSYS', 'MS ULTRA S2 - Outil de diagnostic - 2 ans', '100003827', 6660.00, 4995.00),
  (20,  'Gamme MaxiSYS', 'MS906 PRO TS - Outil de diagnostic + TPMS - 2 ans', 'A100002321N2', 2620.00, 1965.00),
  (30,  'Gamme MaxiSYS', 'MS906 PRO TS 2 - Outil de diagnostic + TPMS - 2 ans (prise secteur non fournie)', '100004113', 2620.00, 1965.00),
  (40,  'Gamme MaxiSYS', 'MS906MAX - Outil de diagnostic - 2 ans', '100003850', 2450.00, 1837.50),
  (50,  'Gamme MaxiSYS', 'MS908S3 - Outil de diagnostic - 2 ans', '100003536', 2990.00, 2242.50),
  (60,  'Gamme MaxiSYS', 'MS909 - Outil de diagnostic - 2 ans', 'A100001624', 4950.00, 3712.50),
  (70,  'Gamme MaxiSYS', 'MS909 EV diag box - Outil de diagnostic - 2 ans', 'A100003193', 5670.00, 4252.50),
  (80,  'Gamme MaxiSYS', 'MS909 S2 - Outil de diagnostic - 2 ans', '100003959', 4990.00, 3742.50),
  (90,  'Gamme MaxiSYS', 'MS909 CV - Outil de diagnostic PL - 2 ans', '100004501', 4490.00, 3367.50),
  (100, 'Gamme MaxiSYS', 'MS919 - Outil de diagnostic - 2 ans', 'A100001623', 5950.00, 4462.50),
  (110, 'Gamme MaxiSYS', 'MS ULTRA - Outil de diagnostic - 2 ans', 'A100001626', 6200.00, 4650.00),
  (120, 'Gamme MaxiSYS', 'MS ULTRA EV - Outil de diagnostic - 2 ans', 'A100003189', 6510.00, 4882.50),
  (130, 'Gamme MaxiSYS', 'XLINK Technicien', 'A100003429', 1560.00, 1170.00),
  (140, 'Gamme MaxiSYS', 'Malette EV DIAG BOX UPGRADE 909/919/ULTRA en EV', 'A100003195', 1574.00, 1180.50),
  (150, 'Gamme MaxiDAS', 'DS900 - Outil de diagnostic filaire - 2 ans', 'A100003313A2', 990.00, 792.00),
  (160, 'Gamme MaxiDAS', 'DS900 BT - Outil de diagnostic bluetooth - 2 ans', 'A100003315A2', 1290.00, 1032.00),
  (170, 'Gamme MaxiDAS', 'DS900 TS - Outil de diagnostic, TPMS, bluetooth - 2 ans', 'A100003317A2', 1390.00, 1112.00),
  (180, 'Gamme MaxiCHECK / MaxiDIAG', 'MX900 - Outil de diagnostic filaire - 2 ans', 'A100003335A2', 570.00, 456.00),
  (190, 'Gamme MaxiCHECK / MaxiDIAG', 'MX900 TS - Outil de diagnostic, TPMS - 2 ans', 'A100003339A2', 990.00, 792.00),
  (200, 'Gamme MaxiCHECK / MaxiDIAG', 'MD909 PRO - Outil de diagnostic bluetooth (prise secteur non fournie)', '100003990', 359.00, 287.20),
  (210, 'Testeurs de batterie', 'BT506 - Testeur de batterie et circuits démarreur / alternateur (bluetooth MaxiSys)', 'A100002068', 239.00, 179.25),
  (220, 'Testeurs de batterie', 'BT508 - Testeur de batterie et circuits démarreur / alternateur, VCI fourni', 'A100002066', 329.00, 246.75),
  (230, 'Testeurs de batterie', 'BT608 - Testeur alternateur / démarreur et systèmes électriques, autonome, VCI fourni', 'A100002016', 790.00, 592.50),
  (240, 'Testeurs de batterie', 'BT609 - Testeur de batterie, démarreur / alternateur, VCI fourni - 1 an', 'A100002078', 990.00, 742.50),
  (250, 'Gamme MaxiTPMS', 'TS508WF avec 4 valves - Outil de maintenance TPMS (clonage et programmation), MAJ wifi', 'PACKDECOUVERTE', 390.00, 273.00),
  (260, 'Gamme MaxiTPMS', 'ITS600 - Outil de maintenance TPMS et services multiples (tactile)', 'A101000773', 580.00, 406.00),
  (270, 'Gamme MaxiTPMS', 'ITS600PRO - Outil de diagnostic, maintenance TPMS et services multiples', 'ITS600PRO', 650.00, 520.00),
  (280, 'Gamme MaxiTPMS', 'ITS600 CV - Outil de diagnostic, maintenance TPMS PL et services multiples', 'A101000877', 707.25, 565.80),
  (290, 'Programmation de clés', 'IM508 S - Outil de diagnostic et programmation des clés - 2 ans', 'A100002668', 1590.00, 1272.00),
  (300, 'Programmation de clés', 'IM608PRO2 - Diagnostic, programmation de clés et codage ECU - 2 ans', 'A100002888', 3950.00, 3160.00),
  (310, 'Programmation de clés', 'KM100 - Outil de programmation de clés', 'A100002607', 665.00, 532.00),
  (320, 'Gamme AutoLink', 'AL329 - Outil de diagnostic (protocole EOBD)', 'A100000504', 37.00, 27.00),
  (330, 'Gamme AutoLink', 'AL549 - Outil de diagnostic (EOBD, lecture de paramètres moteur)', '100003268', 99.00, 74.00);

-- Prix net gérant : lignes créées vides, à renseigner dans le back-office
insert into public.cta_product_admin_costs (product_id, admin_price_ht)
select id, null from public.cta_products
on conflict (product_id) do nothing;

-- Inventaire « Mon matériel » : une ligne par valise, il ne reste que le n° de série à saisir
insert into public.cta_equipment (name, ref, notes)
select split_part(p.name, ' - ', 1), null, 'Réf. constructeur : ' || coalesce(p.reference, '?')
from public.cta_products p
where not exists (
  select 1 from public.cta_equipment e where e.name = split_part(p.name, ' - ', 1)
);

-- ---------- Réponses automatiques de la messagerie ----------
create table if not exists public.cta_auto_replies (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  keywords    text[] not null default '{}',
  reply       text not null,
  enabled     boolean not null default true,
  usage_count int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.cta_auto_replies enable row level security;
create policy "cta_auto_replies_admin_only" on public.cta_auto_replies
  for all to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());

-- Exemple prêt à l'emploi (modifiable / supprimable dans la messagerie)
insert into public.cta_auto_replies (title, keywords, reply) values
  ('Valise qui ne s''allume pas',
   array['ne s''allume pas','allume plus','ne démarre pas','écran noir'],
   'Avez-vous bien vérifié que l''appareil est chargé ? Branchez la valise sur son chargeur d''origine pendant 30 minutes, puis maintenez le bouton d''alimentation appuyé 10 secondes. Si l''écran reste noir, tenez-nous informés dans ce ticket : un technicien prend le relais.');

-- Marquage des messages générés automatiquement
alter table public.cta_ticket_messages
  add column if not exists is_auto boolean not null default false;

-- ---------- Prix par catégorie de prestation ----------
alter table public.cta_price_grid
  add column if not exists category text
  check (category is null or category in ('conseil','valise','atf','adas','distance','autre'));

update public.cta_price_grid set category = case
  when label ilike '%adas%' then 'adas'
  when label ilike '%atf%' then 'atf'
  when label ilike '%distance%' then 'distance'
  when label ilike '%valise%' or label ilike '%maxi%' then 'valise'
  when label ilike '%conseil%' then 'conseil'
  else category end
where category is null;

-- ---------- Demandes de devis : garage ou distributeur ----------
alter table public.quote_requests
  add column if not exists client_kind text
  check (client_kind is null or client_kind in ('garage','distributeur'));
