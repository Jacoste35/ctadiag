-- 1) Prêt / location : destinataire (fiche client final), tarif de location
--    dégressif et suivi de facturation.
-- 2) Catalogue valises : les prix nets importés du tarif 2026 étaient en réalité
--    les prix nets du gérant. On les bascule dans « mon prix net » et le prix
--    net distributeur devient ce prix + 20 %.

alter table public.cta_equipment_requests
  add column if not exists end_client_id uuid references public.cta_end_clients(id) on delete set null,
  add column if not exists price_ht numeric(10,2),
  add column if not exists invoiced boolean not null default false;

-- Bascule des prix (une seule fois : uniquement là où « mon prix net » est vide)
update public.cta_product_admin_costs c
   set admin_price_ht = p.distrib_price_ht
  from public.cta_products p
 where p.id = c.product_id
   and c.admin_price_ht is null;

update public.cta_products
   set distrib_price_ht = round(distrib_price_ht * 1.20, 2)
 where distrib_price_ht is not null;
