-- Archivage des tickets résolus : ils quittent la liste principale mais
-- restent consultables. Un nouveau message du client désarchive le ticket.

alter table public.cta_tickets
  add column if not exists archived boolean not null default false;

create or replace function public.cta_touch_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.cta_tickets
     set updated_at = now(),
         status = case when new.author = 'partner' and status in ('resolu','ferme')
                       then 'ouvert' else status end,
         archived = case when new.author = 'partner' then false else archived end
   where id = new.ticket_id;
  return new;
end $$;
