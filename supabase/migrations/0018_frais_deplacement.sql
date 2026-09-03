-- Frais de déplacement des interventions :
--   aller-retour inclus jusqu'à included_km (70 km par défaut) depuis le point
--   de départ du gérant, puis price_per_km (0,12 €) par kilomètre parcouru
--   au-delà. Paramètres modifiables par le gérant (adresse, seuil, prix / km).
-- Lisible par tous les comptes connectés (le tarif est annoncé au client au
-- moment de la demande de rendez-vous), modifiable par le gérant seul.

create table if not exists public.cta_billing_settings (
  id           smallint primary key default 1 check (id = 1),
  base_address text not null,
  base_lat     double precision,
  base_lng     double precision,
  included_km  int not null default 70,
  price_per_km numeric(6,2) not null default 0.12
);
alter table public.cta_billing_settings enable row level security;
create policy "cta_billing_select_auth" on public.cta_billing_settings
  for select to authenticated using (true);
create policy "cta_billing_admin_write" on public.cta_billing_settings
  for all to authenticated using (public.cta_is_admin()) with check (public.cta_is_admin());

insert into public.cta_billing_settings (id, base_address, base_lat, base_lng, included_km, price_per_km)
values (1, 'Z.A de l''Intendance, 14930 Eterville', 49.1470, -0.4280, 70, 0.12)
on conflict (id) do nothing;
