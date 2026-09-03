-- Statuts automatiques de la messagerie :
-- 1) une réponse CTA passe un ticket « ouvert » en « en cours » ;
--    un message du client rouvre un ticket résolu / fermé (comme avant).
create or replace function public.cta_touch_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.cta_tickets
     set updated_at = now(),
         status = case
           when new.author = 'partner' and status in ('resolu','ferme') then 'ouvert'
           when new.author = 'cta' and status = 'ouvert' then 'en_cours'
           else status end,
         archived = case when new.author = 'partner' then false else archived end
   where id = new.ticket_id;
  return new;
end $$;

-- 2) sans nouveau message pendant 72 h, un ticket ouvert ou en cours se
--    clôture automatiquement en « résolu » (vérification toutes les heures).
select cron.schedule(
  'cta-tickets-resolution-auto',
  '25 * * * *',
  $$update public.cta_tickets
      set status = 'resolu'
    where status in ('ouvert', 'en_cours')
      and updated_at < now() - interval '72 hours'$$
);
