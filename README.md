# CTA · Conseil Technique Auto — Site + back-office (livraison clé en main)

Site vitrine one-page, espace clients (directs et distributeurs) et back-office
d'administration complet, avec backend Supabase. Le gérant pilote toute l'activité
depuis le site, sans toucher à la technique.

## Les pages

| Page | Qui | Rôle |
|---|---|---|
| `index.html` | Public | Site vitrine : prestations, tarifs publics, RDV, demande de devis, boutique |
| `mentions-legales.html` | Public | Mentions légales, CGV, RGPD, cookies |
| `connexion.html` | Clients + gérant | Connexion (e-mail ou identifiant court) |
| `espace.html` | Clients connectés | Espace client : interventions, devis/factures, tarifs, messagerie |
| `admin.html` | Gérant uniquement | **Back-office** : demandes de devis, clients, interventions, facturation, tarifs, messagerie, agenda |

## Comptes de démonstration

| Identifiant | Mot de passe | Rôle |
|---|---|---|
| `admin` | `admin` | **Gérant** (accès back-office `admin.html`) |
| `distrib` | `distrib` | Client **distributeur** (grille remisée, marque blanche) |
| `client` | `client` | Client **direct** (tarifs publics) |

⚠️ **Changer ces mots de passe avant toute communication de l'adresse du site**
(back-office → Clients → « Mot de passe », ou dashboard Supabase → Authentication).

## Clients directs vs distributeurs

Le type se choisit à la création du compte (ou se change dans l'onglet Clients) :

- **Client direct** : voit « Vos tarifs » (colonne *Tarif public* de la grille),
  ses interventions, devis/factures et la messagerie.
- **Distributeur** : voit la « Grille distributeur » (tarif public barré + tarif
  remisé), ses interventions en marque blanche, devis/factures et messagerie.

Les deux tarifs de chaque prestation se gèrent dans le back-office, onglet **Tarifs**.

## Le back-office (`admin.html`) — guide du gérant

- **Demandes de devis** : chaque envoi du formulaire du site arrive ici (coordonnées,
  prestations cochées, créneau de RDV souhaité, message). Marquer traité / supprimer.
- **Clients** : créer un compte (e-mail + mot de passe provisoire + type), modifier
  société/contact/téléphone/type, réinitialiser un mot de passe, supprimer un compte.
- **Interventions** : planifier une intervention pour un client (date, heure, matériel,
  lieu) ; le client la voit immédiatement dans son espace. Statuts : planifiée → en
  cours → terminée / annulée.
- **Devis & factures** : enregistrer un devis ou une facture (référence, montant HT,
  lien PDF optionnel) et suivre son statut (en attente / accepté · à régler / payée).
- **Tarifs** : la grille à deux colonnes (public / distributeur), modifiable ligne à ligne.
- **Messagerie** : tous les tickets clients, réponse en tant que « Hotline CTA »,
  changement de statut. Un client qui répond à un ticket résolu le rouvre automatiquement.
- **Agenda** : bloquer des jours (congés, salons…) — ils deviennent instantanément
  indisponibles dans le calendrier de RDV du site public.

## Application installable (PWA)

Le site est une **application web installable** : sur téléphone ou tablette, elle
s'ajoute à l'écran d'accueil avec l'icône CTA et s'ouvre en plein écran, comme une
app native. La connexion est **mémorisée** (plus besoin de se reconnecter à chaque
ouverture) et les pages restent consultables hors connexion (les données, elles,
nécessitent le réseau).

**Installation** — à transmettre aux techniciens et clients :
- **iPhone / iPad** : ouvrir le site dans Safari → bouton Partager → « Sur l'écran d'accueil ».
- **Android** : ouvrir le site dans Chrome → menu ⋮ → « Installer l'application » (ou la bannière proposée).

L'app s'ouvre sur la page de connexion et bascule automatiquement sur l'espace si
une session existe. Toute l'interface est optimisée tactile (onglets défilants,
formulaires empilés, en-têtes compacts) du téléphone à la tablette.

## Architecture technique

**Frontend** : site 100 % statique (HTML/CSS/JS vanilla), déployé sur GitHub Pages
via GitHub Actions (branche `gh-pages`) à chaque push. Hébergeable tel quel sur
Vercel/Netlify (aucun build).

**Backend** : Supabase (projet `ooogbitnoqvrtwrpisnn`, région UE `eu-central-1`).

- Auth : comptes e-mail/mot de passe ; rôle `admin` ou `client` + type
  `direct`/`distributeur` dans `cta_partners` (profil auto-créé par trigger).
- Tables (préfixe `cta_` — le projet héberge une autre application) : `cta_partners`,
  `cta_interventions`, `cta_documents`, `cta_price_grid`, `cta_tickets`,
  `cta_ticket_messages`, plus `quote_requests` (formulaire public) et
  `blocked_dates` (calendrier).
- Sécurité : RLS partout — un client ne voit que ses données ; l'admin voit tout
  (fonction `cta_is_admin()`) ; les demandes de devis ne sont lisibles que par l'admin.
- Fonctions Edge : `submit-quote` (réception des devis : validation, consentement
  RGPD, honeypot anti-spam, e-mail optionnel) et `admin-users` (création/mot de
  passe/suppression de comptes, réservée à l'admin).
- Miroir du schéma dans `supabase/migrations/` et des fonctions dans
  `supabase/functions/`.

**Configuration** (`js/config.js`) : e-mail de contact, URL boutique
(`https://leqgmotorsport.fr/`), jours bloqués de secours, clés publiques Supabase.

### Notification e-mail des devis (optionnel, recommandé)

Compte [Resend](https://resend.com) gratuit, puis dans le dashboard Supabase
(*Edge Functions → submit-quote → Secrets*) :

```
RESEND_API_KEY=re_xxx
QUOTE_NOTIFY_EMAIL=contact@cta-auto.fr
```

Sans cela, les demandes restent visibles dans le back-office (onglet Demandes).

## Check-list avant remise au dirigeant

1. **Mots de passe** des 3 comptes de démonstration (ou suppression des comptes
   `distrib`/`client` de démo et de leurs données d'exemple).
2. **Mentions légales** : compléter les champs `[...]` (SIRET, RCS, TVA, assurance,
   médiateur) dans `mentions-legales.html` et le pied de page d'`index.html` ;
   faire valider les CGV.
3. **Tarifs distributeur** : ajuster la colonne distributeur (valeurs d'exemple à −15 %).
4. **Témoignages** : remplacer les exemples d'`index.html`.
5. **Notification e-mail** des devis (voir ci-dessus).
6. **Domaine** : brancher `cta-auto.fr` (Vercel ou GitHub Pages → Custom domain) et
   mettre à jour la balise `canonical` d'`index.html`.
7. Vérifier les droits d'usage des logos marques (Autel, Yacco, Igol, Autech Expert).
