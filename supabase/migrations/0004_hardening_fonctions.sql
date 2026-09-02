-- Durcissement (audit de sécurité Supabase) : les fonctions internes ne doivent
-- pas être appelables via l'API RPC. Les triggers continuent de fonctionner
-- (le droit EXECUTE n'est pas revérifié au déclenchement d'un trigger).
revoke execute on function public.cta_handle_new_user() from public, anon, authenticated;
revoke execute on function public.cta_touch_ticket() from public, anon, authenticated;
-- cta_is_admin doit rester exécutable par les utilisateurs connectés (policies RLS),
-- mais pas par les visiteurs anonymes.
revoke execute on function public.cta_is_admin() from public, anon;
