// Configuration du site CTA · à adapter sans toucher au reste du code.
window.CTA_CONFIG = {
  // Adresse e-mail de réception des demandes de devis (utilisée par le repli mailto:)
  emailContact: "contact@cta-auto.fr",

  // URL de la boutique externe (société partenaire).
  boutiqueUrl: "https://leqgmotorsport.fr/",

  // URL du portail partenaires si un portail distinct existe. Laisser "" pour rester sur le site.
  espacePartenaireUrl: "",

  // Jours bloqués supplémentaires au format ISO, séparés par des virgules : "2026-09-15,2026-09-22".
  // S'ajoute aux dates de la table `blocked_dates` du backend.
  joursBloques: "",

  // Clé publique VAPID des notifications push (la clé privée reste côté serveur).
  vapidPublicKey: "BGJqczrJWqP-5E5GVSK-GXw_ZFzZXId4SSsRxvNVHJm0B3rW2JXYFpBP-rKtmBnTkFaqtR-HuqZQIutT8LsLehE",

  // Backend Supabase (formulaire de devis, jours bloqués, connexion partenaires).
  // La clé "anon" est publique par conception : les droits sont contrôlés côté serveur (RLS).
  supabaseUrl: "https://ooogbitnoqvrtwrpisnn.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vb2diaXRub3F2cnR3cnBpc25uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjkxNDAsImV4cCI6MjA5ODQwNTE0MH0.XWzXjSU0y18ndzgqwQydX0_9CF0yZKNKdoUrSjgU1Rw"
};

// Départements français : affichés après le code postal dans les plannings.
window.CTA_DEPTS = {
  "01": "Ain", "02": "Aisne", "03": "Allier", "04": "Alpes-de-Haute-Provence", "05": "Hautes-Alpes",
  "06": "Alpes-Maritimes", "07": "Ardèche", "08": "Ardennes", "09": "Ariège", "10": "Aube",
  "11": "Aude", "12": "Aveyron", "13": "Bouches-du-Rhône", "14": "Calvados", "15": "Cantal",
  "16": "Charente", "17": "Charente-Maritime", "18": "Cher", "19": "Corrèze", "20": "Corse",
  "21": "Côte-d'Or", "22": "Côtes-d'Armor", "23": "Creuse", "24": "Dordogne", "25": "Doubs",
  "26": "Drôme", "27": "Eure", "28": "Eure-et-Loir", "29": "Finistère", "30": "Gard",
  "31": "Haute-Garonne", "32": "Gers", "33": "Gironde", "34": "Hérault", "35": "Ille-et-Vilaine",
  "36": "Indre", "37": "Indre-et-Loire", "38": "Isère", "39": "Jura", "40": "Landes",
  "41": "Loir-et-Cher", "42": "Loire", "43": "Haute-Loire", "44": "Loire-Atlantique", "45": "Loiret",
  "46": "Lot", "47": "Lot-et-Garonne", "48": "Lozère", "49": "Maine-et-Loire", "50": "Manche",
  "51": "Marne", "52": "Haute-Marne", "53": "Mayenne", "54": "Meurthe-et-Moselle", "55": "Meuse",
  "56": "Morbihan", "57": "Moselle", "58": "Nièvre", "59": "Nord", "60": "Oise",
  "61": "Orne", "62": "Pas-de-Calais", "63": "Puy-de-Dôme", "64": "Pyrénées-Atlantiques", "65": "Hautes-Pyrénées",
  "66": "Pyrénées-Orientales", "67": "Bas-Rhin", "68": "Haut-Rhin", "69": "Rhône", "70": "Haute-Saône",
  "71": "Saône-et-Loire", "72": "Sarthe", "73": "Savoie", "74": "Haute-Savoie", "75": "Paris",
  "76": "Seine-Maritime", "77": "Seine-et-Marne", "78": "Yvelines", "79": "Deux-Sèvres", "80": "Somme",
  "81": "Tarn", "82": "Tarn-et-Garonne", "83": "Var", "84": "Vaucluse", "85": "Vendée",
  "86": "Vienne", "87": "Haute-Vienne", "88": "Vosges", "89": "Yonne", "90": "Territoire de Belfort",
  "91": "Essonne", "92": "Hauts-de-Seine", "93": "Seine-Saint-Denis", "94": "Val-de-Marne", "95": "Val-d'Oise",
  "97": "Outre-mer"
};
