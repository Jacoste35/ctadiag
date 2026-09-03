/* Espace partenaires · page protégée.
   Session Supabase Auth requise (déposée par la page de connexion) ;
   données lues/écrites via l'API REST du backend, protégées par RLS. */
(function () {
  "use strict";

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
  function uidFromToken(token) {
    try {
      var payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(payload)).sub;
    } catch (e) { return null; }
  }
  var uid = uidFromToken(session.access_token);

  function logout() {
    try { localStorage.removeItem("cta_session"); sessionStorage.removeItem("cta_session"); } catch (e) { /* ignore */ }
    window.location.replace("connexion.html");
  }
  document.getElementById("logout").addEventListener("click", logout);

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
          uid = uidFromToken(session.access_token);
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
  function fmtDate(iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtDateTime(ts) {
    return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " " +
           new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  function eur(n) {
    return n == null ? "Sur devis" : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: Number(n) % 1 ? 2 : 0 }) + " € HT";
  }
  var CATS = {
    conseil: "💬 Conseil", valise: "🧰 Valise Autel", atf: "🛢️ Station ATF",
    adas: "🎯 ADAS", distance: "📞 À distance", autre: "🔧 Autre"
  };
  function catChip(c) {
    return '<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;border:1px solid rgba(120,150,200,.28);font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#9fb6d8;white-space:nowrap;">' +
      esc(CATS[c] || CATS.autre) + "</span>";
  }
  function mondayIso(dateIso) {
    var pa = dateIso.split("-").map(Number);
    var d = new Date(pa[0], pa[1] - 1, pa[2]);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function frMonth(ym) {
    var t = new Date(ym + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function weekLabel(mIso) {
    var pa = mIso.split("-").map(Number);
    var a = new Date(pa[0], pa[1] - 1, pa[2]);
    var b = new Date(a); b.setDate(a.getDate() + 6);
    var f = function (d) { return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }); };
    return "Semaine du " + f(a) + " au " + f(b);
  }
  var STATUS = {
    planifiee: ["Planifiée", "badge-blue"], en_cours: ["En cours", "badge-amber"],
    terminee: ["Terminée", "badge-green"], annulee: ["Annulée", "badge-grey"],
    en_attente: ["En attente", "badge-amber"], accepte: ["Accepté", "badge-green"],
    refuse: ["Refusé", "badge-grey"], a_regler: ["À régler", "badge-amber"], payee: ["Payée", "badge-green"],
    ouvert: ["Ouvert", "badge-blue"], resolu: ["Résolu", "badge-green"], ferme: ["Fermé", "badge-grey"]
  };
  function badge(status) {
    var s = STATUS[status] || [status, "badge-grey"];
    return '<span class="badge ' + s[1] + '">' + esc(s[0]) + "</span>";
  }
  function showError(msg) {
    var el = document.getElementById("portal-error");
    el.hidden = false;
    el.textContent = msg;
  }

  /* ---------- Onglets ---------- */
  var tabs = document.querySelectorAll(".tab");
  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      tabs.forEach(function (x) { x.classList.toggle("active", x === t); });
      ["interventions", "documents", "grille", "clients", "messagerie"].forEach(function (name) {
        document.getElementById("tab-" + name).hidden = name !== t.dataset.tab;
      });
    });
  });

  function fn(name, body, retried) {
    return fetch(API + "/functions/v1/" + name, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: "Bearer " + session.access_token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (r.status === 401 && !retried) {
        return refreshSession().then(function (ok) {
          if (ok) return fn(name, body, true);
          logout();
          throw new Error("session expirée");
        });
      }
      return r.json().then(function (j) {
        if (!r.ok || j.error) throw new Error(j.error || "HTTP " + r.status);
        return j;
      });
    });
  }

  /* ---------- Profil (type de client : direct / distributeur) ---------- */
  var clientType = "direct";
  var profileName = "";
  api("cta_partners?select=*&id=eq." + uid).then(function (rows) {
    var p = rows && rows[0];
    if (!p) return;
    clientType = p.client_type || "direct";
    var name = p.contact_name || p.company_name || p.email || "";
    profileName = p.contact_name || "";
    document.getElementById("p-name").textContent = name;
    document.getElementById("p-company").textContent = p.company_name || p.email || "";
    var typeEl = document.getElementById("p-type");
    typeEl.hidden = false;
    typeEl.className = "badge " + (clientType === "distributeur" ? "badge-green" : "badge-blue");
    typeEl.textContent = clientType === "distributeur" ? "Distributeur" : "Client direct";
    if (p.role === "admin") document.getElementById("admin-link").hidden = false;
    if (p.must_change_password) showPasswordModal();
    if (clientType === "distributeur") {
      document.getElementById("tab-btn-clients").hidden = false;
      document.getElementById("ireq-btn").hidden = false;
      // Distributeur : pas de devis / factures ici (gérés par la banque de CTA)
      document.getElementById("tab-btn-documents").hidden = true;
      document.getElementById("stat-devis-tile").hidden = true;
      document.getElementById("grid-col-public").textContent = "Tarif public conseillé";
      loadFiches();
      loadMyRequests();
      loadProducts();
      renderPlanning();
    }
    if (clientType !== "distributeur") {
      // Client direct : l'onglet devient « Vos tarifs » (tarifs publics, sans remise)
      document.querySelector('[data-tab="grille"]').textContent = "Vos tarifs";
      document.getElementById("grid-col-public").textContent = "";
      document.getElementById("grid-col-partner").textContent = "Tarif HT";
      document.getElementById("grid-note").textContent =
        "Tarifs HT, hors frais de déplacement. Devis personnalisé pour interventions multiples ; grille distributeur dédiée si vous revendez du matériel : parlez-en avec nous.";
    }
    renderGrid();
  }).catch(function () { /* non bloquant */ });

  /* ---------- Mot de passe provisoire : changement obligatoire ---------- */
  function showPasswordModal() {
    var modal = document.getElementById("pwd-modal");
    modal.hidden = false;
    document.getElementById("pwd-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var msg = document.getElementById("pwd-msg");
      var p1 = document.getElementById("pwd-new").value;
      var p2 = document.getElementById("pwd-confirm").value;
      msg.hidden = true;
      if (p1.length < 6) { msg.hidden = false; msg.textContent = "6 caractères minimum."; return; }
      if (p1 !== p2) { msg.hidden = false; msg.textContent = "Les deux mots de passe ne correspondent pas."; return; }
      fetch(API + "/auth/v1/user", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: KEY,
          Authorization: "Bearer " + session.access_token
        },
        body: JSON.stringify({ password: p1 })
      })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function () { return api("cta_partners?id=eq." + uid, { method: "PATCH", body: { must_change_password: false } }); })
        .then(function () { modal.hidden = true; })
        .catch(function () {
          msg.hidden = false;
          msg.textContent = "Changement impossible pour le moment, réessayez.";
        });
    });
  }

  /* ---------- Organisation de la journée (distributeurs) ---------- */
  function isoOfDay(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function secteurOf(loc) {
    if (!loc) return "";
    var parts = String(loc).split(",");
    return parts[parts.length - 1].trim();
  }
  function longDate(iso) {
    var t = new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function planLine(r, withDate) {
    var sep = ' <span style="color:#4d8dff;">→</span> ';
    var endClient = r.cta_end_clients && r.cta_end_clients.company_name;
    var secteur = secteurOf(r.location);
    return '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;padding:9px 14px;margin-bottom:6px;border-radius:12px;background:rgba(13,17,25,.7);border:1px solid rgba(120,150,200,.14);font-size:13.5px;line-height:1.5;">' +
      '<span style="font-family:\'IBM Plex Mono\',monospace;font-weight:700;color:#7fadff;">' +
      (withDate ? esc(longDate(r.date)) + (r.time_slot ? " · " + esc(r.time_slot) : "") : esc(r.time_slot || "Journée")) + "</span>" + sep +
      '<span style="font-weight:700;color:#dfe6f2;">' + esc(r.type) + "</span>" + sep +
      '<span style="color:#c9d4e6;">' + (endClient ? "🏁 " + esc(endClient) : "Chez vous") + "</span>" +
      (secteur ? sep + '<span style="color:#38d47a;">📍 ' + esc(secteur) + "</span>" : "") +
      " " + badge(r.status) +
      "</div>";
  }
  function renderPlanning() {
    if (clientType !== "distributeur") return;
    var wrap = document.getElementById("day-org");
    if (!wrap) return;
    wrap.hidden = false;
    var today = isoOfDay(new Date());
    var horizon = new Date();
    horizon.setDate(horizon.getDate() + 7);
    var maxIso = isoOfDay(horizon);
    document.getElementById("p-today-date").textContent =
      new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    var active = myInterventions.filter(function (r) { return r.date && r.status !== "annulee"; });
    var todays = active
      .filter(function (r) { return r.date === today; })
      .sort(function (a, b) { return (a.time_slot || "99") < (b.time_slot || "99") ? -1 : 1; });
    document.getElementById("p-today-list").innerHTML = todays.length
      ? todays.map(function (r) { return planLine(r, false); }).join("")
      : '<p style="margin:0;color:#8b98ae;font-size:14px;">Aucune intervention CTA chez vous ou vos clients aujourd\'hui.</p>';
    var week = active
      .filter(function (r) { return r.date > today && r.date <= maxIso && r.status !== "terminee"; })
      .sort(function (a, b) { return (a.date + (a.time_slot || "99")) < (b.date + (b.time_slot || "99")) ? -1 : 1; });
    document.getElementById("p-week-list").innerHTML = week.length
      ? week.map(function (r) { return planLine(r, true); }).join("")
      : '<p style="margin:0;color:#8b98ae;font-size:14px;">Rien de planifié sur les 7 prochains jours.</p>';
    var later = active
      .filter(function (r) { return r.date > maxIso && r.status !== "terminee"; })
      .sort(function (a, b) { return (a.date + (a.time_slot || "99")) < (b.date + (b.time_slot || "99")) ? -1 : 1; });
    document.getElementById("p-later-list").innerHTML = later.length
      ? later.map(function (r) { return planLine(r, true); }).join("")
      : '<p style="margin:0;color:#8b98ae;font-size:14px;">Rien de programmé au-delà de la semaine à venir : ces journées sont libres pour de nouveaux rendez-vous.</p>';
  }

  /* ---------- Interventions (groupées par mois et semaine, archivables) ---------- */
  var myInterventions = [];
  var showArchivedIv = false;
  function renderMyInterventions() {
    var host = document.getElementById("interv-list");
    document.getElementById("stat-interv").textContent =
      myInterventions.filter(function (r) { return r.status === "planifiee" || r.status === "en_cours"; }).length;
    var rows = myInterventions
      .filter(function (r) { return showArchivedIv ? r.client_archived : !r.client_archived; })
      .slice()
      .sort(function (a, b) { return ((b.date || "") + (b.time_slot || "")) < ((a.date || "") + (a.time_slot || "")) ? -1 : 1; });
    var archivedCount = myInterventions.filter(function (r) { return r.client_archived; }).length;
    var toggle = archivedCount
      ? '<div style="padding:12px 24px;"><button type="button" id="iv-toggle-archived" style="padding:9px 14px;border-radius:999px;border:1px dashed rgba(120,150,200,.3);background:transparent;color:#8b98ae;font-weight:700;font-size:12.5px;cursor:pointer;font-family:\'Archivo\',sans-serif;">' +
        (showArchivedIv ? "← Retour aux interventions" : "🗄️ Voir les archives (" + archivedCount + ")") + "</button></div>"
      : "";
    if (!rows.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">' +
        (showArchivedIv ? "Aucune intervention archivée." : "Aucune intervention pour le moment.") + "</p>" + toggle;
      bindIvControls(host);
      return;
    }
    var html = "";
    var lastMonth = "", lastWeek = "";
    rows.forEach(function (r) {
      var ym = (r.date || "").slice(0, 7);
      if (ym && ym !== lastMonth) {
        html += '<div style="padding:16px 24px 4px;font-family:\'IBM Plex Mono\',monospace;font-size:12.5px;letter-spacing:.14em;color:#7fadff;text-transform:uppercase;border-top:1px solid rgba(120,150,200,.08);">' + esc(frMonth(ym)) + "</div>";
        lastMonth = ym; lastWeek = "";
      }
      var wk = r.date ? mondayIso(r.date) : "";
      if (wk && wk !== lastWeek) {
        html += '<div style="padding:6px 24px 0;font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#5f6d84;">· ' + esc(weekLabel(wk)) + "</div>";
        lastWeek = wk;
      }
      var endClient = r.cta_end_clients && r.cta_end_clients.company_name;
      html += '<div class="list-row" style="border-top:none;">' +
        '<div style="min-width:120px;font-family:\'IBM Plex Mono\',monospace;font-size:13px;color:#c9d4e6;">' + esc(fmtDate(r.date)) + (r.time_slot ? " · " + esc(r.time_slot) : "") + "</div>" +
        '<div style="flex:1;min-width:220px;"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-weight:800;font-size:15px;">' + esc(r.type) + "</span>" + catChip(r.category) + "</div>" +
        (endClient ? '<div style="margin-top:3px;font-size:13px;color:#7fadff;">🏁 Chez ' + esc(endClient) + "</div>" : "") +
        '<div style="margin-top:3px;font-size:13px;color:#93a0b5;">' + esc(r.equipment || "") + (r.location ? " · " + esc(r.location) : "") + "</div>" +
        (r.notes ? '<div style="margin-top:4px;font-size:12.5px;color:#5f6d84;">' + esc(r.notes) + "</div>" : "") + "</div>" +
        badge(r.status) +
        '<button type="button" data-iv-arch="' + r.id + '" title="' + (r.client_archived ? "Désarchiver" : "Archiver") + '" style="padding:7px 12px;border-radius:999px;border:1px solid rgba(120,150,200,.25);background:transparent;color:#8b98ae;font-weight:700;font-size:12px;cursor:pointer;font-family:\'Archivo\',sans-serif;">' +
        (r.client_archived ? "Désarchiver" : "🗄️") + "</button>" +
        "</div>";
    });
    host.innerHTML = html + toggle;
    bindIvControls(host);
  }
  function bindIvControls(host) {
    var t = host.querySelector("#iv-toggle-archived");
    if (t) t.addEventListener("click", function () {
      showArchivedIv = !showArchivedIv;
      renderMyInterventions();
    });
    host.querySelectorAll("[data-iv-arch]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = myInterventions.find(function (x) { return x.id === b.dataset.ivArch; });
        if (!r) return;
        api("cta_interventions?id=eq." + r.id, { method: "PATCH", body: { client_archived: !r.client_archived } })
          .then(function () {
            r.client_archived = !r.client_archived;
            renderMyInterventions();
          }).catch(function () { showError("Archivage impossible : réessayez plus tard."); });
      });
    });
  }
  api("cta_interventions?select=*,cta_end_clients(company_name)&order=date.desc").then(function (rows) {
    myInterventions = rows;
    renderMyInterventions();
    renderFiches();
    renderPlanning();
  }).catch(function () { showError("Impossible de charger les interventions : reconnectez-vous ou réessayez plus tard."); });

  /* ---------- Devis & factures (lecture et signature en ligne) ---------- */
  var docs = [];
  function renderDocs() {
    var host = document.getElementById("docs-list");
    document.getElementById("stat-devis").textContent =
      docs.filter(function (r) { return r.kind === "devis" && r.status === "en_attente"; }).length;
    if (!docs.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucun document pour le moment.</p>';
      return;
    }
    host.innerHTML = docs.map(function (r) {
      var pending = r.kind === "devis" && r.status === "en_attente";
      var signInfo = "";
      if (r.signed_at && r.status === "accepte") {
        signInfo = '<div style="flex-basis:100%;margin-top:2px;font-size:12px;color:#38d47a;">✍️ Signé électroniquement le ' + esc(fmtDateTime(r.signed_at)) + (r.signed_name ? " par " + esc(r.signed_name) : "") + "</div>";
      } else if (r.signed_at && r.status === "refuse") {
        signInfo = '<div style="flex-basis:100%;margin-top:2px;font-size:12px;color:#8b98ae;">Refusé le ' + esc(fmtDateTime(r.signed_at)) + "</div>";
      }
      return '<div class="list-row">' +
        '<span class="badge ' + (r.kind === "devis" ? "badge-blue" : "badge-grey") + '">' + (r.kind === "devis" ? "Devis" : "Facture") + "</span>" +
        '<div style="flex:1;min-width:220px;"><div style="font-weight:800;font-size:15px;">' + esc(r.reference) + (r.label ? ' <span style="font-weight:600;color:#93a0b5;">· ' + esc(r.label) + "</span>" : "") + "</div>" +
        '<div style="margin-top:3px;font-size:12.5px;color:#5f6d84;">Émis le ' + esc(fmtDate(r.issued_on)) + "</div></div>" +
        '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:15px;color:#fff;min-width:110px;text-align:right;">' + esc(eur(r.amount_ht)) + "</div>" +
        badge(r.status) +
        (pending
          ? '<button type="button" class="btn-primary" data-sign="' + r.id + '" style="padding:9px 18px;border-radius:999px;border:none;background:linear-gradient(135deg,#2f7bff,#1c5bd6);color:#fff;font-weight:800;font-size:12.5px;cursor:pointer;box-shadow:0 4px 14px rgba(47,123,255,.35);">✍️ Lire &amp; signer</button>'
          : "") +
        (r.file_url ? '<a href="' + esc(r.file_url) + '" target="_blank" rel="noopener" style="font-size:13px;font-weight:700;">Télécharger ↗</a>' : "") +
        signInfo +
        "</div>";
    }).join("");
    host.querySelectorAll("[data-sign]").forEach(function (b) {
      b.addEventListener("click", function () { openSignModal(b.dataset.sign); });
    });
  }
  function loadDocuments() {
    return api("cta_documents?select=*&order=issued_on.desc").then(function (rows) {
      docs = rows;
      renderDocs();
    });
  }
  loadDocuments().catch(function () { showError("Impossible de charger les documents : reconnectez-vous ou réessayez plus tard."); });

  /* ---------- Signature d'un devis ---------- */
  var currentSignDoc = null;
  function openSignModal(id) {
    var r = docs.find(function (x) { return x.id === id; });
    if (!r) return;
    currentSignDoc = r;
    document.getElementById("sign-title").textContent = "Devis " + r.reference;
    document.getElementById("sign-details").innerHTML =
      (r.label ? "<strong>" + esc(r.label) + "</strong><br>" : "") +
      "Montant : <strong>" + esc(eur(r.amount_ht)) + "</strong><br>" +
      "Émis le " + esc(fmtDate(r.issued_on)) +
      '<br><span style="color:#8b98ae;font-size:12.5px;">Tarifs hors taxes, frais de déplacement éventuels précisés sur le devis.</span>';
    var pdf = document.getElementById("sign-pdf");
    pdf.hidden = !r.file_url;
    if (r.file_url) pdf.href = r.file_url;
    document.getElementById("sign-consent").checked = false;
    document.getElementById("sign-name").value = profileName;
    var msg = document.getElementById("sign-msg");
    msg.hidden = true;
    document.getElementById("sign-modal").hidden = false;
  }
  function signMsg(text) {
    var msg = document.getElementById("sign-msg");
    msg.hidden = false;
    msg.textContent = text;
  }
  document.getElementById("sign-close").addEventListener("click", function () {
    document.getElementById("sign-modal").hidden = true;
  });
  document.getElementById("sign-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!currentSignDoc) return;
    if (!document.getElementById("sign-consent").checked) {
      signMsg("Merci de cocher la case de lecture et d'acceptation.");
      return;
    }
    var name = document.getElementById("sign-name").value.trim();
    if (name.length < 2) {
      signMsg("Merci d'indiquer votre nom et prénom : c'est votre signature.");
      return;
    }
    fn("sign-quote", { document_id: currentSignDoc.id, action: "accept", signed_name: name })
      .then(function () {
        document.getElementById("sign-modal").hidden = true;
        return loadDocuments();
      })
      .catch(function (e) { signMsg("Signature impossible : " + e.message); });
  });
  document.getElementById("sign-refuse").addEventListener("click", function () {
    if (!currentSignDoc) return;
    if (!window.confirm("Refuser le devis " + currentSignDoc.reference + " ?")) return;
    var reason = window.prompt("Motif du refus (optionnel) :") || "";
    fn("sign-quote", { document_id: currentSignDoc.id, action: "refuse", refusal_reason: reason })
      .then(function () {
        document.getElementById("sign-modal").hidden = true;
        return loadDocuments();
      })
      .catch(function (e) { signMsg("Refus impossible : " + e.message); });
  });

  /* ---------- Grille tarifaire (distributeur : tarif remisé · direct : tarif public) ---------- */
  var gridRows = null;
  function renderGrid() {
    if (gridRows === null) return;
    var host = document.getElementById("grid-list");
    if (!gridRows.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Grille en cours de préparation : contactez-nous pour un devis.</p>';
      return;
    }
    var distrib = clientType === "distributeur";
    host.innerHTML = gridRows.map(function (r) {
      var myPrice = distrib ? r.partner_price_ht : r.public_price_ht;
      return '<div class="list-row price-row" style="display:grid;grid-template-columns:1fr 140px 140px;gap:10px;align-items:center;">' +
        '<span style="font-size:14.5px;font-weight:600;color:#dfe6f2;">' + esc(r.label) + "</span>" +
        (distrib
          ? '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:14px;color:#8b98ae;">' + esc(eur(r.public_price_ht)) + "</span>"
          : "<span></span>") +
        '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:15px;font-weight:600;color:#7fadff;">' + esc(eur(myPrice)) + "</span>" +
        "</div>";
    }).join("");
  }
  /* Catalogue valises (distributeurs) : tarif public conseillé + prix net */
  function loadProducts() {
    api("cta_products?select=*&order=sort.asc").then(function (rows) {
      if (!rows || !rows.length) return;
      document.getElementById("prod-wrap").hidden = false;
      var html = "";
      var lastCat = "";
      rows.forEach(function (p) {
        if (p.category !== lastCat) {
          html += '<div style="padding:14px 24px 4px;font-family:\'IBM Plex Mono\',monospace;font-size:12px;letter-spacing:.14em;color:#7fadff;text-transform:uppercase;border-top:1px solid rgba(120,150,200,.08);">' + esc(p.category) + "</div>";
          lastCat = p.category;
        }
        html += '<div class="list-row price-row" style="display:grid;grid-template-columns:1fr 140px 140px;gap:10px;align-items:center;border-top:none;">' +
          '<span style="font-size:13.5px;font-weight:600;color:#dfe6f2;">' + esc(p.name) +
          (p.reference ? ' <span style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#5f6d84;">· ' + esc(p.reference) + "</span>" : "") + "</span>" +
          '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:13.5px;color:#8b98ae;">' + esc(eur(p.public_price_ht)) + "</span>" +
          '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:14.5px;font-weight:600;color:#7fadff;">' + esc(eur(p.distrib_price_ht)) + "</span>" +
          "</div>";
      });
      document.getElementById("prod-list").innerHTML = html;
    }).catch(function () { /* non bloquant */ });
  }
  api("cta_price_grid?select=*&order=sort.asc").then(function (rows) {
    gridRows = rows;
    renderGrid();
  }).catch(function () { showError("Impossible de charger la grille tarifaire : reconnectez-vous ou réessayez plus tard."); });

  /* ---------- Mes clients (fiches clients finaux, distributeurs) ---------- */
  var fiches = [];
  function loadFiches() {
    return api("cta_end_clients?select=*&order=company_name.asc").then(function (rows) {
      fiches = rows;
      renderFiches();
      fillFicheSelect();
    }).catch(function () { showError("Impossible de charger vos fiches clients."); });
  }
  function renderFiches() {
    var host = document.getElementById("ec-list");
    if (!host) return;
    if (!fiches.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucune fiche client : créez la première ci-dessus.</p>';
      return;
    }
    host.innerHTML = fiches.map(function (f) {
      var nb = myInterventions.filter(function (i) { return i.end_client_id === f.id; }).length;
      return '<div class="list-row" data-ec-row="' + f.id + '" style="align-items:center;">' +
        '<div style="min-width:170px;">' +
        '<div style="font-weight:800;font-size:14.5px;">' + esc(f.company_name) + "</div>" +
        '<div style="margin-top:3px;font-size:12px;color:#5f6d84;">' + nb + " intervention" + (nb > 1 ? "s" : "") + " CTA</div></div>" +
        '<input class="input" data-f="contact_name" value="' + esc(f.contact_name || "") + '" placeholder="Contact" style="width:120px;padding:9px 12px;font-size:13px;">' +
        '<input class="input" data-f="phone" value="' + esc(f.phone || "") + '" placeholder="Téléphone" style="width:125px;padding:9px 12px;font-size:13px;">' +
        '<input class="input" data-f="email" value="' + esc(f.email || "") + '" placeholder="E-mail" style="flex:1;min-width:140px;padding:9px 12px;font-size:13px;">' +
        '<input class="input" data-f="address" value="' + esc(f.address || "") + '" placeholder="Adresse" style="flex:1 1 100%;min-width:200px;padding:9px 12px;font-size:13px;">' +
        '<div style="display:flex;gap:8px;">' +
        '<button style="padding:7px 14px;border-radius:999px;border:1px solid rgba(150,180,230,.3);background:transparent;color:#dfe6f2;font-weight:700;font-size:12px;cursor:pointer;font-family:\'Archivo\',sans-serif;" data-ec-save="' + f.id + '">Enregistrer</button>' +
        '<button style="padding:7px 14px;border-radius:999px;border:1px solid rgba(255,110,110,.35);background:transparent;color:#ff8c8c;font-weight:700;font-size:12px;cursor:pointer;font-family:\'Archivo\',sans-serif;" data-ec-del="' + f.id + '">✕</button>' +
        "</div></div>";
    }).join("");
    host.querySelectorAll("[data-ec-save]").forEach(function (b) {
      b.addEventListener("click", function () {
        var row = host.querySelector('[data-ec-row="' + b.dataset.ecSave + '"]');
        var body = {};
        row.querySelectorAll("[data-f]").forEach(function (inp) { body[inp.dataset.f] = inp.value.trim() || null; });
        api("cta_end_clients?id=eq." + b.dataset.ecSave, { method: "PATCH", body: body })
          .then(function () {
            Object.assign(fiches.find(function (x) { return x.id === b.dataset.ecSave; }), body);
            renderFiches(); fillFicheSelect();
          }).catch(function () { showError("Enregistrement impossible."); });
      });
    });
    host.querySelectorAll("[data-ec-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Supprimer cette fiche client ? (l'historique des interventions est conservé)")) return;
        api("cta_end_clients?id=eq." + b.dataset.ecDel, { method: "DELETE" })
          .then(function () {
            fiches = fiches.filter(function (x) { return x.id !== b.dataset.ecDel; });
            renderFiches(); fillFicheSelect();
          }).catch(function () { showError("Suppression impossible."); });
      });
    });
  }
  var ecForm = document.getElementById("ec-form");
  if (ecForm) ecForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var body = {
      distributor_id: uid,
      company_name: document.getElementById("ec-company").value.trim(),
      contact_name: document.getElementById("ec-contact").value.trim() || null,
      phone: document.getElementById("ec-phone").value.trim() || null,
      email: document.getElementById("ec-email").value.trim() || null,
      address: document.getElementById("ec-address").value.trim() || null,
      notes: document.getElementById("ec-notes").value.trim() || null
    };
    if (!body.company_name) return;
    api("cta_end_clients", { method: "POST", body: body })
      .then(function () { ecForm.reset(); return loadFiches(); })
      .catch(function () { showError("Création de la fiche impossible."); });
  });

  /* ---------- Demandes d'intervention (distributeurs) ---------- */
  var myRequests = [];
  var REQ_STATUS = { nouvelle: ["Envoyée", "badge-blue"], acceptee: ["Planifiée ✓", "badge-green"], refusee: ["Refusée", "badge-grey"] };
  function loadMyRequests() {
    return api("cta_intervention_requests?select=*,cta_end_clients(company_name)&order=created_at.desc").then(function (rows) {
      myRequests = rows;
      var wrap = document.getElementById("myreq-wrap");
      wrap.hidden = !rows.length;
      if (!rows.length) return;
      document.getElementById("myreq-list").innerHTML = rows.map(function (r) {
        var st = REQ_STATUS[r.status] || [r.status, "badge-grey"];
        return '<div class="list-row">' +
          catChip(r.category) +
          '<div style="flex:1;min-width:200px;">' +
          '<div style="font-size:13.5px;font-weight:700;">' +
          (r.cta_end_clients ? "Chez " + esc(r.cta_end_clients.company_name) : "Pour votre société") +
          (r.desired_date ? " · souhaité le " + esc(fmtDate(r.desired_date)) + (r.desired_slot ? " à " + esc(r.desired_slot) : "") : "") + "</div>" +
          (r.message ? '<div style="margin-top:3px;font-size:12.5px;color:#8b98ae;">' + esc(r.message) + "</div>" : "") +
          '<div style="margin-top:3px;font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#5f6d84;">Envoyée le ' + esc(fmtDateTime(r.created_at)) + "</div></div>" +
          '<span class="badge ' + st[1] + '">' + st[0] + "</span></div>";
      }).join("");
    }).catch(function () { /* non bloquant */ });
  }
  var ireqBtn = document.getElementById("ireq-btn");
  function fillFicheSelect() {
    var sel = document.getElementById("ir-endclient");
    if (!sel) return;
    sel.innerHTML = '<option value="">Chez quel client final ? (optionnel)</option>' +
      fiches.map(function (f) { return '<option value="' + f.id + '">' + esc(f.company_name) + "</option>"; }).join("") +
      '<option value="__new">➕ Créer un nouveau client final…</option>';
  }
  if (ireqBtn) {
    var slotSel = document.getElementById("ir-slot");
    var slotOpts = '<option value="">Heure souhaitée (indifférent)</option>';
    for (var h = 8; h <= 18; h++) {
      ["00", "30"].forEach(function (m) {
        if (h === 18 && m === "30") return;
        var t = String(h).padStart(2, "0") + ":" + m;
        slotOpts += '<option value="' + t + '">' + t + "</option>";
      });
    }
    slotSel.innerHTML = slotOpts;
    ireqBtn.addEventListener("click", function () {
      fillFicheSelect();
      document.getElementById("ireq-msg").hidden = true;
      document.getElementById("ireq-modal").hidden = false;
    });
    document.getElementById("ireq-close").addEventListener("click", function () {
      document.getElementById("ireq-modal").hidden = true;
    });
    document.getElementById("ir-endclient").addEventListener("change", function () {
      document.getElementById("ir-newclient").hidden = this.value !== "__new";
      var f = fiches.find(function (x) { return x.id === this.value; }.bind(this));
      var loc = document.getElementById("ir-loc");
      if (f && f.address && !loc.value.trim()) loc.value = f.address;
    });
    // Prix de la prestation sélectionnée (grille distributeur)
    document.getElementById("ir-cat").addEventListener("change", function () {
      var hint = document.getElementById("ir-price");
      var cat = this.value;
      var prices = (gridRows || [])
        .filter(function (g) { return g.category === cat && g.partner_price_ht != null; })
        .map(function (g) { return Number(g.partner_price_ht); });
      if (!cat || !prices.length) { hint.hidden = true; return; }
      var min = Math.min.apply(null, prices);
      hint.hidden = false;
      hint.textContent = "💶 Tarif distributeur : " + (prices.length > 1 ? "à partir de " : "") +
        min.toLocaleString("fr-FR", { minimumFractionDigits: min % 1 ? 2 : 0 }) + " € HT (facturé après intervention)";
    });
    document.getElementById("ireq-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var cat = document.getElementById("ir-cat").value;
      if (!cat) return;
      var msg = document.getElementById("ireq-msg");
      function fail(text) {
        msg.hidden = false;
        msg.style.color = "#ff8c8c";
        msg.textContent = text;
      }
      var endChoice = document.getElementById("ir-endclient").value;
      // « Créer un nouveau client final » : la fiche est créée d'abord, puis utilisée
      var ficheReady;
      if (endChoice === "__new") {
        var company = document.getElementById("irn-company").value.trim();
        if (!company) { fail("Indiquez le nom du nouveau client final."); return; }
        ficheReady = api("cta_end_clients", {
          method: "POST",
          prefer: "return=representation",
          body: {
            distributor_id: uid,
            company_name: company,
            contact_name: document.getElementById("irn-contact").value.trim() || null,
            phone: document.getElementById("irn-phone").value.trim() || null,
            email: document.getElementById("irn-email").value.trim() || null,
            address: document.getElementById("irn-address").value.trim() || null
          }
        }).then(function (rows) {
          var f = rows && rows[0];
          var loc = document.getElementById("ir-loc");
          if (f && f.address && !loc.value.trim()) loc.value = f.address;
          return f ? f.id : null;
        });
      } else {
        ficheReady = Promise.resolve(endChoice || null);
      }
      ficheReady.then(function (endClientId) {
        var body = {
          partner_id: uid,
          end_client_id: endClientId,
          category: cat,
          desired_date: document.getElementById("ir-date").value || null,
          desired_slot: document.getElementById("ir-slot").value || null,
          equipment: document.getElementById("ir-equip").value.trim() || null,
          location: document.getElementById("ir-loc").value.trim() || null,
          message: document.getElementById("ir-msg").value.trim() || null
        };
        return api("cta_intervention_requests", { method: "POST", body: body });
      })
        .then(function () {
          document.getElementById("ireq-form").reset();
          document.getElementById("ir-newclient").hidden = true;
          document.getElementById("ir-price").hidden = true;
          document.getElementById("ireq-modal").hidden = true;
          if (endChoice === "__new") loadFiches();
          return loadMyRequests();
        })
        .catch(function () { fail("Envoi impossible, réessayez plus tard."); });
    });
  }

  /* ---------- Messagerie / tickets ---------- */
  var tickets = [];
  var currentTicket = null;
  var showArchived = false;

  function ticketStats() {
    document.getElementById("stat-tickets").textContent =
      tickets.filter(function (t) { return t.status === "ouvert" || t.status === "en_cours"; }).length;
  }

  function renderTicketList() {
    var host = document.getElementById("ticket-list");
    var visible = tickets.filter(function (t) { return showArchived ? t.archived : !t.archived; });
    var archivedCount = tickets.filter(function (t) { return t.archived; }).length;
    var toggle = archivedCount
      ? '<button type="button" id="toggle-archived" style="margin-top:4px;padding:9px 14px;border-radius:999px;border:1px dashed rgba(120,150,200,.3);background:transparent;color:#8b98ae;font-weight:700;font-size:12.5px;cursor:pointer;font-family:\'Archivo\',sans-serif;">' +
        (showArchived ? "← Retour aux tickets actifs" : "🗄️ Voir les archives (" + archivedCount + ")") + "</button>"
      : "";
    if (!visible.length) {
      host.innerHTML = '<p style="margin:0;padding:6px;color:#5f6d84;font-size:14px;">' +
        (showArchived ? "Aucun ticket archivé." : "Aucun ticket : ouvrez-en un si besoin.") + "</p>" + toggle;
      bindToggleArchived(host);
      return;
    }
    host.innerHTML = visible.map(function (t) {
      return '<button type="button" class="ticket-item' + (currentTicket === t.id ? " active" : "") + '" data-id="' + t.id + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
        '<span style="font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(t.subject) + "</span>" + badge(t.status) + "</div>" +
        '<div style="margin-top:5px;font-family:\'IBM Plex Mono\',monospace;font-size:11.5px;color:#5f6d84;">Mis à jour le ' + esc(fmtDateTime(t.updated_at)) + "</div>" +
        "</button>";
    }).join("") + toggle;
    host.querySelectorAll(".ticket-item").forEach(function (b) {
      b.addEventListener("click", function () {
        currentTicket = b.dataset.id;
        renderTicketList();
        renderThread();
      });
    });
    bindToggleArchived(host);
  }
  function bindToggleArchived(host) {
    var t = host.querySelector("#toggle-archived");
    if (t) t.addEventListener("click", function () {
      showArchived = !showArchived;
      var pool = tickets.filter(function (x) { return showArchived ? x.archived : !x.archived; });
      currentTicket = pool.length ? pool[0].id : null;
      renderTicketList();
      renderThread();
    });
  }

  function renderThread() {
    var t = tickets.find(function (x) { return x.id === currentTicket; });
    document.getElementById("thread-empty").hidden = !!t;
    document.getElementById("thread-view").hidden = !t;
    if (!t) return;
    document.getElementById("thread-subject").textContent = t.subject;
    document.getElementById("thread-meta").textContent = "Ouvert le " + fmtDateTime(t.created_at);
    var s = STATUS[t.status] || [t.status, "badge-grey"];
    var st = document.getElementById("thread-status");
    st.className = "badge " + s[1];
    st.textContent = s[0];
    document.getElementById("thread-resolve").hidden = t.status === "resolu" || t.status === "ferme";
    var archBtn = document.getElementById("thread-archive");
    archBtn.hidden = !(t.status === "resolu" || t.status === "ferme");
    archBtn.textContent = t.archived ? "Désarchiver" : "Archiver";
    var msgs = (t.cta_ticket_messages || []).slice().sort(function (a, b) {
      return new Date(a.created_at) - new Date(b.created_at);
    });
    document.getElementById("thread-msgs").innerHTML = msgs.map(function (m) {
      var isCta = m.author === "cta";
      return '<div style="display:flex;gap:12px;align-items:flex-start;' + (isCta ? "" : "flex-direction:row-reverse;") + '">' +
        '<span style="width:36px;height:36px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px;' +
        (isCta ? "background:rgba(47,123,255,.15);border:1px solid rgba(77,141,255,.45);" : "background:rgba(120,150,200,.12);border:1px solid rgba(120,150,200,.3);font-family:'IBM Plex Mono',monospace;font-size:10px;color:#9fb6d8;") + '">' +
        (isCta ? "🎧" : "VOUS") + "</span>" +
        '<div style="max-width:80%;padding:12px 16px;font-size:13.5px;line-height:1.55;color:' + (isCta ? "#dfe6f2" : "#c9d4e6") + ";" +
        (isCta
          ? "border-radius:4px 14px 14px 14px;background:rgba(47,123,255,.12);border:1px solid rgba(77,141,255,.3);"
          : "border-radius:14px 4px 14px 14px;background:rgba(13,17,25,.9);border:1px solid rgba(120,150,200,.22);") + '">' +
        (isCta ? '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;letter-spacing:.12em;color:#7fadff;text-transform:uppercase;margin-bottom:4px;">' + (m.is_auto ? "🤖 Réponse automatique" : "Hotline CTA") + "</div>" : "") +
        esc(m.body).replace(/\n/g, "<br>") +
        '<div style="margin-top:6px;font-family:\'IBM Plex Mono\',monospace;font-size:10px;color:#5f6d84;">' + esc(fmtDateTime(m.created_at)) + "</div>" +
        "</div></div>";
    }).join("");
  }

  function loadTickets(keepSelection) {
    return api("cta_tickets?select=*,cta_ticket_messages(*)&order=updated_at.desc").then(function (rows) {
      tickets = rows;
      if (!keepSelection || !tickets.some(function (t) { return t.id === currentTicket; })) {
        var pool = tickets.filter(function (t) { return showArchived ? t.archived : !t.archived; });
        currentTicket = pool.length ? pool[0].id : null;
      }
      ticketStats();
      renderTicketList();
      renderThread();
    });
  }
  loadTickets(false).catch(function () { showError("Impossible de charger la messagerie : reconnectez-vous ou réessayez plus tard."); });

  // Nouveau ticket
  var ticketForm = document.getElementById("ticket-form");
  document.getElementById("new-ticket-btn").addEventListener("click", function () {
    ticketForm.hidden = !ticketForm.hidden;
    if (!ticketForm.hidden) document.getElementById("t-subject").focus();
  });
  document.getElementById("ticket-cancel").addEventListener("click", function () {
    ticketForm.hidden = true;
  });
  ticketForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var subject = document.getElementById("t-subject").value.trim();
    var body = document.getElementById("t-body").value.trim();
    if (!subject || !body) return;
    api("cta_tickets", { method: "POST", body: { partner_id: uid, subject: subject }, prefer: "return=representation" })
      .then(function (rows) {
        var ticket = rows[0];
        return api("cta_ticket_messages", {
          method: "POST",
          body: { ticket_id: ticket.id, author: "partner", author_id: uid, body: body }
        }).then(function () {
          // Réponse automatique instantanée si le cas est répertorié
          return fn("auto-reply", { ticket_id: ticket.id, message: subject + "\n" + body })
            .catch(function () { /* non bloquant */ });
        }).then(function () { return ticket.id; });
      })
      .then(function (id) {
        ticketForm.reset();
        ticketForm.hidden = true;
        currentTicket = id;
        return loadTickets(true);
      })
      .catch(function () { showError("L'envoi du ticket a échoué : réessayez ou écrivez-nous à " + (CFG.emailContact || "contact@cta-auto.fr") + "."); });
  });

  // Réponse dans un ticket
  document.getElementById("reply-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var body = document.getElementById("r-body").value.trim();
    if (!body || !currentTicket) return;
    api("cta_ticket_messages", {
      method: "POST",
      body: { ticket_id: currentTicket, author: "partner", author_id: uid, body: body }
    })
      .then(function () {
        return fn("auto-reply", { ticket_id: currentTicket, message: body })
          .catch(function () { /* non bloquant */ });
      })
      .then(function () {
        document.getElementById("r-body").value = "";
        return loadTickets(true);
      })
      .catch(function () { showError("L'envoi du message a échoué : réessayez plus tard."); });
  });

  // Archiver / désarchiver un ticket résolu
  document.getElementById("thread-archive").addEventListener("click", function () {
    var t = tickets.find(function (x) { return x.id === currentTicket; });
    if (!t) return;
    api("cta_tickets?id=eq." + currentTicket, { method: "PATCH", body: { archived: !t.archived } })
      .then(function () { return loadTickets(false); })
      .catch(function () { showError("Archivage impossible : réessayez plus tard."); });
  });

  // Marquer résolu
  document.getElementById("thread-resolve").addEventListener("click", function () {
    if (!currentTicket) return;
    api("cta_tickets?id=eq." + currentTicket, { method: "PATCH", body: { status: "resolu" } })
      .then(function () { return loadTickets(true); })
      .catch(function () { showError("Impossible de mettre à jour le ticket : réessayez plus tard."); });
  });
})();
