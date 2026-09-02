// Configuration du site CTA — à adapter sans toucher au reste du code.
window.CTA_CONFIG = {
  // Adresse e-mail de réception des demandes de devis (utilisée par le repli mailto:)
  emailContact: "contact@cta-auto.fr",

  // URL de la boutique externe (société partenaire). Laisser "" tant qu'elle n'est pas connue.
  boutiqueUrl: "",

  // URL du portail partenaires si un portail distinct existe. Laisser "" pour rester sur le site.
  espacePartenaireUrl: "",

  // Jours bloqués supplémentaires au format ISO, séparés par des virgules : "2026-09-15,2026-09-22".
  // S'ajoute aux dates de la table `blocked_dates` du backend.
  joursBloques: "",

  // Backend Supabase (formulaire de devis, jours bloqués, connexion partenaires).
  // La clé "anon" est publique par conception : les droits sont contrôlés côté serveur (RLS).
  supabaseUrl: "https://ooogbitnoqvrtwrpisnn.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vb2diaXRub3F2cnR3cnBpc25uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjkxNDAsImV4cCI6MjA5ODQwNTE0MH0.XWzXjSU0y18ndzgqwQydX0_9CF0yZKNKdoUrSjgU1Rw"
};
