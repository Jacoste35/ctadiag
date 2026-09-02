-- Chiffre d'affaires : montant HT facturable porté par chaque intervention.
-- Le back-office affiche le CA réalisé (interventions terminées) jour / semaine / mois.

alter table public.cta_interventions
  add column if not exists amount_ht numeric(10,2);
