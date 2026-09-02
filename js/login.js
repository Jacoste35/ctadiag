/* Page de connexion — authentification sur le backend Supabase (Auth).
   En cas de succès : redirection vers l'espace partenaires si une URL est
   configurée dans js/config.js, sinon message de confirmation. */
(function () {
  "use strict";

  var CFG = window.CTA_CONFIG || {};
  var API = (CFG.supabaseUrl || "").replace(/\/$/, "");
  var KEY = CFG.supabaseAnonKey || "";

  var form = document.getElementById("login-form");
  var msgEl = document.getElementById("l-msg");
  var btn = document.getElementById("l-submit");

  // Déjà connecté (application installée : la session persiste) → espace direct
  try {
    var saved = JSON.parse(localStorage.getItem("cta_session"));
    if (saved && saved.access_token) {
      window.location.replace((CFG.espacePartenaireUrl || "").trim() || "espace.html");
    }
  } catch (e) { /* pas de session enregistrée */ }

  function setMsg(msg, isError) {
    msgEl.hidden = !msg;
    msgEl.textContent = msg || "";
    msgEl.style.color = isError ? "#ff8c8c" : "#7fadff";
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = document.getElementById("l-email").value.trim();
    var pass = document.getElementById("l-pass").value;
    // Identifiant court accepté : « admin » devient « admin@cta-auto.fr »
    if (email && email.indexOf("@") === -1) email += "@cta-auto.fr";
    if (!email || !pass) {
      setMsg("Merci de renseigner votre e-mail et votre mot de passe.", true);
      return;
    }
    if (!API || !KEY) {
      setMsg("Espace partenaire en cours d'ouverture : contactez-nous pour votre accès.");
      return;
    }
    btn.disabled = true;
    setMsg("Connexion en cours…");
    fetch(API + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY },
      body: JSON.stringify({ email: email, password: pass })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j.access_token) {
          try {
            localStorage.setItem("cta_session", JSON.stringify({
              access_token: res.j.access_token,
              refresh_token: res.j.refresh_token,
              email: email
            }));
          } catch (e) { /* stockage indisponible : la connexion reste valable */ }
          setMsg("Connexion réussie ✓ Redirection vers votre espace…");
          window.location.href = (CFG.espacePartenaireUrl || "").trim() || "espace.html";
        } else {
          setMsg("Identifiants incorrects ou accès non encore activé. Demandez votre accès via le formulaire de devis.", true);
        }
      })
      .catch(function () {
        setMsg("Connexion impossible pour le moment, réessayez plus tard.", true);
      })
      .finally(function () { btn.disabled = false; });
  });
})();
