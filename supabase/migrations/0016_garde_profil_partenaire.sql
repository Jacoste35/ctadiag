-- Garde-fou sur la mise à jour du profil partenaire : un client ne peut
-- modifier que ses coordonnées (société, contact, téléphone, e-mail, adresse)
-- et son indicateur de mot de passe provisoire. Le rôle, le type de client et
-- l'activation de la mise en service à distance restent réservés au gérant.

create or replace function public.cta_guard_partner_update()
returns trigger language plpgsql as $$
begin
  if public.cta_is_admin() then return new; end if;
  if new.role                 is distinct from old.role
     or new.client_type          is distinct from old.client_type
     or new.remote_setup_enabled is distinct from old.remote_setup_enabled then
    raise exception 'Seules vos coordonnées sont modifiables';
  end if;
  return new;
end $$;
revoke execute on function public.cta_guard_partner_update() from public, anon, authenticated;

drop trigger if exists cta_guard_partner_update on public.cta_partners;
create trigger cta_guard_partner_update
  before update on public.cta_partners
  for each row execute function public.cta_guard_partner_update();
