-- Demandes de devis du site : coordonnées complètes du demandeur
-- (nom, prénom, téléphone, adresse en deux champs : adresse / code postal).

alter table public.quote_requests
  add column if not exists first_name  text,
  add column if not exists last_name   text,
  add column if not exists phone       text,
  add column if not exists address     text,
  add column if not exists postal_code text;
