-- Signature électronique des devis depuis l'espace client.
-- Dossier de preuve : horodatage serveur, nom saisi par le signataire,
-- adresse IP, navigateur et empreinte SHA-256 du contenu signé.

alter table public.cta_documents
  add column if not exists signed_at timestamptz,
  add column if not exists signed_name text,
  add column if not exists signed_ip text,
  add column if not exists signed_user_agent text,
  add column if not exists signature_hash text,
  add column if not exists refusal_reason text;
