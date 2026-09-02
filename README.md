# CTA · Conseil Technique Auto — Site vitrine

Site one-page pour CTA (conseil, installation et mise en service d'outils de diagnostic
Autel, stations ATF et calibration ADAS — Grand Ouest), avec backend Supabase.

## Structure

| Fichier / dossier | Rôle |
|---|---|
| `index.html` | Page principale (one-page) |
| `mentions-legales.html` | Mentions légales, CGV, RGPD, cookies |
| `css/site.css` | Styles globaux, hover/focus, responsive, `prefers-reduced-motion` |
| `js/config.js` | **Configuration à adapter** : e-mail de contact, URL boutique, URL espace partenaires, jours bloqués, clés Supabase |
| `js/main.js` | Reveal au scroll, menu mobile, calendrier RDV, formulaire de devis, connexion partenaires |
| `assets/` | Images (logos, produits, carte, photo fondateur) |
| `supabase/` | Migrations SQL et fonction Edge `submit-quote` (miroir de ce qui est déployé) |
| `.github/workflows/deploy.yml` | Déploiement automatique sur GitHub Pages |

## Déploiement (frontend)

Le site est 100 % statique, déployé sur **GitHub Pages** via GitHub Actions à chaque
push sur `main` (ou la branche de développement). Première activation : si le workflow
échoue au premier passage, activer Pages dans *Settings → Pages → Source :
GitHub Actions*, puis relancer le workflow.

URL du site : `https://<utilisateur>.github.io/ctadiag/`
Pour un domaine personnalisé (ex. `cta-auto.fr`) : *Settings → Pages → Custom domain*,
puis mettre à jour la balise `<link rel="canonical">` de `index.html`.

## Backend (Supabase — projet `ooogbitnoqvrtwrpisnn`, région eu-central-1)

- **`quote_requests`** : demandes de devis. RLS activée sans policy publique — la table
  n'est lisible que depuis le dashboard Supabase (Table Editor) ou avec la clé service role.
- **`blocked_dates`** : jours indisponibles du calendrier (lecture publique). Ajouter une
  ligne (`day` au format `YYYY-MM-DD`) depuis le dashboard pour bloquer une date.
- **Fonction Edge `submit-quote`** : reçoit le formulaire, valide (champs obligatoires,
  consentement RGPD, honeypot anti-spam, listes blanches), insère en base et peut
  notifier par e-mail.
- **Espace partenaires** : Supabase Auth (e-mail + mot de passe). Créer les comptes
  clients depuis le dashboard (*Authentication → Users → Add user*).

### Notification e-mail des devis (optionnel, recommandé)

Créer un compte [Resend](https://resend.com) (gratuit) puis configurer les secrets de la
fonction Edge dans le dashboard Supabase (*Edge Functions → submit-quote → Secrets*) :

```
RESEND_API_KEY=re_xxx
QUOTE_NOTIFY_EMAIL=contact@cta-auto.fr
```

Sans ces secrets, les demandes restent consultables dans la table `quote_requests`.
Si l'appel au backend échoue côté navigateur, le site retombe automatiquement sur un
e-mail `mailto:` prérempli.

## Reste à faire avant la mise en production

1. Compléter les champs `[...]` des mentions légales (SIRET, RCS, TVA, assurance,
   médiateur) et le pied de page de `index.html` ; faire valider les CGV par un juriste.
2. Renseigner `boutiqueUrl` et éventuellement `espacePartenaireUrl` dans `js/config.js`.
3. Remplacer les témoignages d'exemple par de vrais retours clients.
4. Configurer la notification e-mail (voir ci-dessus).
5. Vérifier les droits d'usage des logos marques (Autel, Yacco, Igol, Autech Expert).
