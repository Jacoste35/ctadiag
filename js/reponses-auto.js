/* Réponses automatiques · page dédiée, réservée au compte administrateur.
   Gestion des réponses types servies instantanément par la fonction Edge
   auto-reply. Un « apprentissage » lancé depuis la messagerie (bouton 🧠)
   arrive ici prérempli via un brouillon déposé dans localStorage. */
(function () {
  "use strict";

  // Câblage défensif : si un élément attendu est absent (HTML et JS
  // désynchronisés par un cache), on ignore au lieu de planter tout le script.
  function ctaOn(id, ev, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  }


  var CFG = window.CTA_CONFIG || {};
  var API = (CFG.supabaseUrl || "").replace(/\/$/, "");
  var KEY = CFG.supabaseAnonKey || "";

  /* ---------- Session ---------- */
  function readSession() {
    try {
      return JSON.parse(localStorage.getItem("cta_session")) ||
             JSON.parse(sessionStorage.getItem("cta_session"));
    } catch (e) { return null; }
  }
  var session = readSession();
  if (!session || !session.access_token || !API || !KEY) {
    window.location.replace("connexion.html");
    return;
  }
  function logout() {
    try { localStorage.removeItem("cta_session"); sessionStorage.removeItem("cta_session"); } catch (e) { /* ignore */ }
    window.location.replace("connexion.html");
  }
  ctaOn("logout", "click", logout);

  // Menu bas façon application : mêmes raccourcis que le back-office,
  // chaque icône ramène à sa page (Messages reste la page courante).
  (function buildBottomNav() {
    var nav = document.getElementById("bottom-nav");
    if (!nav) return;
    var items = [
      ["admin.html#accueil", '<img src="assets/logo-cta-transparent.png" alt="" class="bn-logo">', "Accueil", false],
      ["admin.html#demandes", "\ud83d\udce5", "Contacts", false],
      ["admin.html#clients", "\ud83d\udc65", "Clients", false],
      ["admin.html#interventions", "\ud83d\udee0\ufe0f", "Interv.", false],
      ["admin.html#grille", "\ud83d\udcb6", "Tarifs", false],
      ["admin.html#materiel", "\ud83e\uddf0", "Pr\u00eat", false],
      ["admin.html#agenda", "\ud83d\udcc5", "Agenda", false],
      ["messagerie.html", "\ud83d\udcac", "Messages", true]
    ];
    nav.innerHTML = items.map(function (it) {
      return '<a class="bn-item' + (it[3] ? " active" : "") + '" href="' + it[0] + '" style="text-decoration:none;"><span class="bn-ico">' + it[1] + "</span><span>" + it[2] + "</span></a>";
    }).join("");
  })();


  function refreshSession() {
    return fetch(API + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.access_token) {
          session.access_token = j.access_token;
          if (j.refresh_token) session.refresh_token = j.refresh_token;
          try { localStorage.setItem("cta_session", JSON.stringify(session)); } catch (e) { /* ignore */ }
          return true;
        }
        return false;
      })
      .catch(function () { return false; });
  }

  function api(path, options, retried) {
    options = options || {};
    var headers = { apikey: KEY, Authorization: "Bearer " + session.access_token };
    if (options.body) headers["Content-Type"] = "application/json";
    if (options.prefer) headers.Prefer = options.prefer;
    return fetch(API + "/rest/v1/" + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (r) {
      if (r.status === 401 && !retried) {
        return refreshSession().then(function (ok) {
          if (ok) return api(path, options, true);
          logout();
          throw new Error("session expirée");
        });
      }
      if (!r.ok) throw new Error("HTTP " + r.status);
      if (r.status === 204) return null;
      // Une création (201) sans en-tête Prefer renvoie un corps vide : ne pas planter dessus
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }

  /* ---------- Utilitaires ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function showError(msg) {
    var el = document.getElementById("portal-error");
    el.hidden = false;
    el.textContent = msg;
  }
  var GHOST_BTN = 'style="padding:7px 14px;border-radius:999px;border:1px solid rgba(150,180,230,.3);background:transparent;color:#dfe6f2;font-weight:700;font-size:12px;cursor:pointer;font-family:\'Archivo\',sans-serif;"';
  var DANGER_BTN = 'style="padding:7px 14px;border-radius:999px;border:1px solid rgba(255,110,110,.35);background:transparent;color:#ff8c8c;font-weight:700;font-size:12px;cursor:pointer;font-family:\'Archivo\',sans-serif;"';

  /* ---------- Garde admin ---------- */
  var uid = null;
  try {
    var payload = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    uid = JSON.parse(atob(payload)).sub;
  } catch (e) { /* uid reste null */ }

  api("cta_partners?select=*&id=eq." + uid).then(function (rows) {
    var me = rows && rows[0];
    if (!me || me.role !== "admin") {
      window.location.replace("espace.html");
      return;
    }
    loadReplies();
    applyDraft();
  }).catch(function () { showError("Impossible de vérifier vos droits : reconnectez-vous."); });

  /* ---------- Brouillon déposé par la messagerie (bouton 🧠 Apprendre) ---------- */
  function applyDraft() {
    var draft = null;
    try {
      draft = JSON.parse(localStorage.getItem("cta_ar_draft"));
      localStorage.removeItem("cta_ar_draft");
    } catch (e) { /* pas de brouillon */ }
    if (!draft || !draft.reply) return;
    editingReply = null;
    document.getElementById("ar-mode").textContent = "🧠 Apprentissage depuis le ticket « " + (draft.title || "") + " »";
    document.getElementById("ar-title").value = draft.title || "";
    document.getElementById("ar-keywords").value = draft.keywords || "";
    document.getElementById("ar-reply").value = draft.reply || "";
    document.getElementById("ar-cancel").hidden = false;
    document.getElementById("ar-keywords").focus();
  }

  /* ---------- Réponses automatiques ---------- */
  var autoReplies = [];
  var editingReply = null;

  function loadReplies() {
    return api("cta_auto_replies?select=*&order=usage_count.desc,created_at.desc").then(function (rows) {
      autoReplies = rows;
      renderAutoReplies();
    }).catch(function () { showError("Chargement impossible : vérifiez votre connexion ou reconnectez-vous."); });
  }

  function renderAutoReplies() {
    var host = document.getElementById("ar-list");
    if (!autoReplies.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucune réponse automatique : enregistrez la première ci-dessus, ou apprenez-en une depuis un ticket de la messagerie (bouton 🧠).</p>';
      return;
    }
    host.innerHTML = autoReplies.map(function (r) {
      return '<div class="list-row" data-ar-row="' + r.id + '" style="align-items:flex-start;flex-direction:column;gap:8px;">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%;">' +
        '<span style="font-weight:800;font-size:14.5px;">' + esc(r.title) + "</span>" +
        '<span class="badge ' + (r.enabled ? "badge-green" : "badge-grey") + '">' + (r.enabled ? "Active" : "En pause") + "</span>" +
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#7fadff;">utilisée ' + (r.usage_count || 0) + " fois</span>" +
        '<span style="flex:1;"></span>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button ' + GHOST_BTN + ' data-ar-edit="' + r.id + '">Modifier</button>' +
        '<button ' + GHOST_BTN + ' data-ar-toggle="' + r.id + '">' + (r.enabled ? "Mettre en pause" : "Réactiver") + "</button>" +
        '<button ' + DANGER_BTN + ' data-ar-del="' + r.id + '">✕</button>' +
        "</div></div>" +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
        (r.keywords || []).map(function (k) {
          return '<span style="padding:3px 10px;border-radius:999px;border:1px solid rgba(120,150,200,.28);font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#9fb6d8;">' + esc(k) + "</span>";
        }).join("") + "</div>" +
        '<div style="font-size:13px;color:#93a0b5;line-height:1.55;white-space:pre-line;">' + esc(r.reply) + "</div>" +
        "</div>";
    }).join("");
    host.querySelectorAll("[data-ar-edit]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = autoReplies.find(function (x) { return x.id === b.dataset.arEdit; });
        if (!r) return;
        editingReply = r.id;
        document.getElementById("ar-mode").textContent = "Modification : " + r.title;
        document.getElementById("ar-title").value = r.title;
        document.getElementById("ar-keywords").value = (r.keywords || []).join(", ");
        document.getElementById("ar-reply").value = r.reply;
        document.getElementById("ar-cancel").hidden = false;
        document.getElementById("ar-form").scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    host.querySelectorAll("[data-ar-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = autoReplies.find(function (x) { return x.id === b.dataset.arToggle; });
        if (!r) return;
        api("cta_auto_replies?id=eq." + r.id, { method: "PATCH", body: { enabled: !r.enabled } })
          .then(function () { r.enabled = !r.enabled; renderAutoReplies(); })
          .catch(function () { showError("Mise à jour impossible."); });
      });
    });
    host.querySelectorAll("[data-ar-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Supprimer cette réponse automatique ?")) return;
        api("cta_auto_replies?id=eq." + b.dataset.arDel, { method: "DELETE" })
          .then(function () {
            autoReplies = autoReplies.filter(function (x) { return x.id !== b.dataset.arDel; });
            renderAutoReplies();
          }).catch(function () { showError("Suppression impossible."); });
      });
    });
  }

  function resetArForm() {
    editingReply = null;
    document.getElementById("ar-form").reset();
    document.getElementById("ar-mode").textContent = "Nouvelle réponse automatique";
    document.getElementById("ar-cancel").hidden = true;
  }
  ctaOn("ar-cancel", "click", resetArForm);

  ctaOn("ar-form", "submit", function (ev) {
    ev.preventDefault();
    var keywords = document.getElementById("ar-keywords").value
      .split(",")
      .map(function (k) { return k.trim(); })
      .filter(Boolean);
    var body = {
      title: document.getElementById("ar-title").value.trim(),
      keywords: keywords,
      reply: document.getElementById("ar-reply").value.trim()
    };
    if (!body.title || !body.reply || !keywords.length) return;
    var req = editingReply
      ? api("cta_auto_replies?id=eq." + editingReply, { method: "PATCH", body: body })
      : api("cta_auto_replies", { method: "POST", body: body });
    req.then(function () {
      resetArForm();
      return loadReplies();
    }).catch(function () { showError("Enregistrement impossible."); });
  });
})();
