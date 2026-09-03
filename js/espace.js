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
      ["interventions", "documents", "grille", "clients", "materiel", "mes", "messagerie"].forEach(function (name) {
        document.getElementById("tab-" + name).hidden = name !== t.dataset.tab;
      });
      syncBottomNav(t.dataset.tab);
    });
  });

  /* ---------- Menu bas façon application (téléphone) ---------- */
  function syncBottomNav(name) {
    document.querySelectorAll("#bottom-nav [data-bn-tab]").forEach(function (b) {
      b.classList.toggle("active", b.dataset.bnTab === name);
    });
  }
  document.querySelectorAll("#bottom-nav [data-bn-tab]").forEach(function (b) {
    b.addEventListener("click", function () {
      var tab = document.querySelector('.tab[data-tab="' + b.dataset.bnTab + '"]');
      if (tab) tab.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
  document.getElementById("bn-profile").addEventListener("click", function () {
    document.getElementById("profile-btn").click();
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
  var me = null;
  api("cta_partners?select=*&id=eq." + uid).then(function (rows) {
    var p = rows && rows[0];
    if (!p) return;
    me = p;
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
    // Demande d'intervention : ouverte à tous les clients
    document.getElementById("ireq-btn").hidden = false;
    loadMyRequests();
    // Mise en service à distance : onglet activé par le gérant, fiche par fiche
    if (p.remote_setup_enabled) document.getElementById("tab-btn-mes").hidden = false;
    if (clientType === "distributeur") {
      document.getElementById("tab-btn-clients").hidden = false;
      // Distributeur : pas de devis / factures ici (gérés par la banque de CTA)
      document.getElementById("tab-btn-documents").hidden = true;
      document.getElementById("stat-devis-tile").hidden = true;
      document.getElementById("grid-col-public").textContent = "Tarif public conseillé";
      loadFiches();
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
      // Pas de fiche client final chez un client direct
      document.getElementById("ir-endclient").hidden = true;
    }
    renderGrid();
  }).catch(function () { /* non bloquant */ });

  /* ---------- Mon profil (coordonnées modifiables) ---------- */
  document.getElementById("profile-btn").addEventListener("click", function () {
    if (!me) return;
    document.getElementById("pf-company").value = me.company_name || "";
    document.getElementById("pf-contact").value = me.contact_name || "";
    document.getElementById("pf-phone").value = me.phone || "";
    document.getElementById("pf-email").value = me.email || "";
    document.getElementById("pf-address").value = me.address || "";
    document.getElementById("profile-msg").hidden = true;
    document.getElementById("profile-modal").hidden = false;
  });
  document.getElementById("profile-close").addEventListener("click", function () {
    document.getElementById("profile-modal").hidden = true;
  });
  document.getElementById("profile-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var msg = document.getElementById("profile-msg");
    var newEmail = document.getElementById("pf-email").value.trim();
    var body = {
      company_name: document.getElementById("pf-company").value.trim() || null,
      contact_name: document.getElementById("pf-contact").value.trim() || null,
      phone: document.getElementById("pf-phone").value.trim() || null,
      email: newEmail || null,
      address: document.getElementById("pf-address").value.trim() || null
    };
    var emailChanged = me && newEmail && newEmail !== me.email;
    api("cta_partners?id=eq." + uid, { method: "PATCH", body: body })
      .then(function () {
        Object.assign(me, body);
        profileName = me.contact_name || "";
        document.getElementById("p-name").textContent = me.contact_name || me.company_name || me.email || "";
        document.getElementById("p-company").textContent = me.company_name || me.email || "";
        if (emailChanged) {
          // Change aussi l'e-mail de connexion (une confirmation peut être demandée)
          return fetch(API + "/auth/v1/user", {
            method: "PUT",
            headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + session.access_token },
            body: JSON.stringify({ email: newEmail })
          }).then(function (r) {
            msg.hidden = false;
            msg.style.color = "#7fadff";
            msg.textContent = r.ok
              ? "Profil enregistré ✓ Un e-mail de confirmation peut vous être envoyé pour valider la nouvelle adresse de connexion."
              : "Coordonnées enregistrées ✓ (l'e-mail de connexion n'a pas pu être changé : contactez CTA)";
          });
        }
        msg.hidden = false;
        msg.style.color = "#7fadff";
        msg.textContent = "Profil enregistré ✓";
      })
      .catch(function () {
        msg.hidden = false;
        msg.style.color = "#ff8c8c";
        msg.textContent = "Enregistrement impossible, réessayez.";
      });
  });

  /* ---------- Notifications push ---------- */
  var notifBtn = document.getElementById("notif-btn");
  if ("Notification" in window && Notification.permission === "granted") notifBtn.textContent = "🔔✓";
  notifBtn.addEventListener("click", function () {
    window.ctaEnablePush(uid, function (body) {
      return api("cta_push_subscriptions?on_conflict=endpoint", {
        method: "POST", body: body, prefer: "resolution=merge-duplicates"
      });
    }).then(function () {
      notifBtn.textContent = "🔔✓";
      window.alert("Notifications activées sur cet appareil ✓\nVous serez prévenu des réponses à vos tickets.");
    }).catch(function (e) { window.alert("Notifications : " + e.message); });
  });

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
  // Une intervention passée et réalisée part automatiquement aux archives
  function isDoneIv(r) {
    return r.status === "terminee" && r.date && r.date < isoOfDay(new Date());
  }
  function ivArchived(r) { return r.client_archived || isDoneIv(r); }
  function renderMyInterventions() {
    var host = document.getElementById("interv-list");
    document.getElementById("stat-interv").textContent =
      myInterventions.filter(function (r) { return r.status === "planifiee" || r.status === "en_cours"; }).length;
    var rows = myInterventions
      .filter(function (r) { return showArchivedIv ? ivArchived(r) : !ivArchived(r); })
      .slice()
      .sort(function (a, b) { return ((b.date || "") + (b.time_slot || "")) < ((a.date || "") + (a.time_slot || "")) ? -1 : 1; });
    var archivedCount = myInterventions.filter(ivArchived).length;
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
        (isDoneIv(r) && !r.client_archived
          ? '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:10.5px;color:#5f6d84;" title="Réalisée : archivée automatiquement">auto</span>'
          : '<button type="button" data-iv-arch="' + r.id + '" title="' + (r.client_archived ? "Désarchiver" : "Archiver") + '" style="padding:7px 12px;border-radius:999px;border:1px solid rgba(120,150,200,.25);background:transparent;color:#8b98ae;font-weight:700;font-size:12px;cursor:pointer;font-family:\'Archivo\',sans-serif;">' +
            (r.client_archived ? "Désarchiver" : "🗄️") + "</button>") +
        (clientType === "distributeur"
          ? '<button type="button" data-iv-del="' + r.id + '" title="Supprimer" style="padding:7px 12px;border-radius:999px;border:1px solid rgba(255,110,110,.35);background:transparent;color:#ff8c8c;font-weight:700;font-size:12px;cursor:pointer;font-family:\'Archivo\',sans-serif;">✕</button>'
          : "") +
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
    host.querySelectorAll("[data-iv-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Supprimer définitivement cette intervention de votre suivi ? CTA ne la verra plus non plus.")) return;
        api("cta_interventions?id=eq." + b.dataset.ivDel, { method: "DELETE" })
          .then(function () {
            myInterventions = myInterventions.filter(function (x) { return x.id !== b.dataset.ivDel; });
            renderMyInterventions();
            renderPlanning();
          }).catch(function () { showError("Suppression impossible."); });
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
  /* Catalogue valises (distributeurs) : tarif public conseillé + prix net.
     Chaque gamme se déroule / se replie d'un clic. */
  var catalogRows = [];
  var openCats = {};
  function renderProducts() {
    if (!catalogRows.length) return;
    document.getElementById("prod-wrap").hidden = false;
    var byCat = {};
    var order = [];
    catalogRows.forEach(function (p) {
      if (!byCat[p.category]) { byCat[p.category] = []; order.push(p.category); }
      byCat[p.category].push(p);
    });
    document.getElementById("prod-list").innerHTML = order.map(function (cat) {
      var open = !!openCats[cat];
      return '<button type="button" data-cat-toggle="' + esc(cat) + '" style="display:flex;align-items:center;gap:10px;width:100%;padding:14px 24px;border:none;border-top:1px solid rgba(120,150,200,.08);background:transparent;cursor:pointer;font-family:\'IBM Plex Mono\',monospace;font-size:12px;letter-spacing:.14em;color:#7fadff;text-transform:uppercase;text-align:left;">' +
        "<span>" + (open ? "▾" : "▸") + "</span><span>" + esc(cat) + "</span>" +
        '<span style="color:#5f6d84;text-transform:none;letter-spacing:0;">(' + byCat[cat].length + ")</span></button>" +
        (open ? byCat[cat].map(function (p) {
          return '<div class="list-row price-row" style="display:grid;grid-template-columns:1fr 140px 140px;gap:10px;align-items:center;border-top:none;">' +
            '<span style="font-size:13.5px;font-weight:600;color:#dfe6f2;">' + esc(p.name) +
            (p.reference ? ' <span style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#5f6d84;">· ' + esc(p.reference) + "</span>" : "") + "</span>" +
            '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:13.5px;color:#8b98ae;">' + esc(eur(p.public_price_ht)) + "</span>" +
            '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:14.5px;font-weight:600;color:#7fadff;">' + esc(eur(p.distrib_price_ht)) + "</span>" +
            "</div>";
        }).join("") : "");
    }).join("");
    document.getElementById("prod-list").querySelectorAll("[data-cat-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        openCats[b.dataset.catToggle] = !openCats[b.dataset.catToggle];
        renderProducts();
      });
    });
  }
  function loadProducts() {
    api("cta_products?select=*&order=sort.asc").then(function (rows) {
      catalogRows = rows || [];
      if (catalogRows.length) openCats[catalogRows[0].category] = true;
      renderProducts();
    }).catch(function () { /* non bloquant */ });
  }

  /* ---------- Liste des appareils (noms, sans prix) : selects du site ---------- */
  var productNames = [];
  function fillDeviceSelects() {
    var opts = "";
    var lastCat = "";
    productNames.forEach(function (p) {
      if (p.category !== lastCat) {
        if (lastCat) opts += "</optgroup>";
        opts += '<optgroup label="' + esc(p.category) + '">';
        lastCat = p.category;
      }
      var short = p.name.split(" - ")[0];
      opts += '<option value="' + esc(short) + '">' + esc(short) + "</option>";
    });
    if (lastCat) opts += "</optgroup>";
    var eqrSel = document.getElementById("eqr-product");
    eqrSel.innerHTML = '<option value="">Quel appareil ? *</option>' + opts + '<option value="__autre">Autre…</option>';
    var irSel = document.getElementById("ir-equip");
    irSel.innerHTML = '<option value="">Matériel concerné (optionnel)</option>' + opts + '<option value="__autre">Autre…</option>';
    var mesSel = document.getElementById("mes-device");
    mesSel.innerHTML = '<option value="">Quel appareil mettez-vous en service ?</option>' + opts;
  }
  api("cta_product_names?select=*&order=sort.asc").then(function (rows) {
    productNames = rows || [];
    fillDeviceSelects();
  }).catch(function () { /* non bloquant */ });
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
      fillEqrEndclient();
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
        '<input class="input" data-f="address" value="' + esc(f.address || "") + '" placeholder="Adresse (n° et rue)" style="flex:1 1 100%;min-width:200px;padding:9px 12px;font-size:13px;">' +
        '<input class="input" data-f="postal_code" value="' + esc(f.postal_code || "") + '" placeholder="Code postal" style="width:110px;padding:9px 12px;font-size:13px;">' +
        '<input class="input" data-f="city" value="' + esc(f.city || "") + '" placeholder="Ville" style="flex:1;min-width:120px;padding:9px 12px;font-size:13px;">' +
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
      postal_code: document.getElementById("ec-zip").value.trim() || null,
      city: document.getElementById("ec-city").value.trim() || null,
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
    sel.innerHTML = '<option value="">Chez quel client final ? *</option>' +
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
    function fullAddr(f) {
      return [f.address, [f.postal_code, f.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    }
    document.getElementById("ir-endclient").addEventListener("change", function () {
      document.getElementById("ir-newclient").hidden = this.value !== "__new";
      var f = fiches.find(function (x) { return x.id === this.value; }.bind(this));
      var loc = document.getElementById("ir-loc");
      if (f && !loc.value.trim() && fullAddr(f)) loc.value = fullAddr(f);
    });
    // Matériel concerné : « Autre… » fait apparaître un champ libre
    document.getElementById("ir-equip").addEventListener("change", function () {
      document.getElementById("ir-equip-autre").hidden = this.value !== "__autre";
    });
    // Prix de la prestation sélectionnée (grille : prix distributeur ou tarif public)
    document.getElementById("ir-cat").addEventListener("change", function () {
      var hint = document.getElementById("ir-price");
      var cat = this.value;
      var distrib = clientType === "distributeur";
      var prices = (gridRows || [])
        .filter(function (g) { return g.category === cat && (distrib ? g.partner_price_ht : g.public_price_ht) != null; })
        .map(function (g) { return Number(distrib ? g.partner_price_ht : g.public_price_ht); });
      if (!cat || !prices.length) { hint.hidden = true; return; }
      var min = Math.min.apply(null, prices);
      hint.hidden = false;
      hint.textContent = "💶 " + (distrib ? "Tarif distributeur : " : "Tarif : ") + (prices.length > 1 ? "à partir de " : "") +
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
      var endChoice = clientType === "distributeur" ? document.getElementById("ir-endclient").value : "";
      // Distributeur : le client final est obligatoire (fiche existante ou créée, complète)
      if (clientType === "distributeur" && !endChoice) {
        fail("Choisissez le client final concerné, ou créez sa fiche.");
        return;
      }
      var ficheReady;
      if (endChoice === "__new") {
        var newFiche = {
          distributor_id: uid,
          company_name: document.getElementById("irn-company").value.trim(),
          contact_name: document.getElementById("irn-contact").value.trim(),
          phone: document.getElementById("irn-phone").value.trim(),
          email: document.getElementById("irn-email").value.trim() || null,
          address: document.getElementById("irn-address").value.trim(),
          postal_code: document.getElementById("irn-zip").value.trim(),
          city: document.getElementById("irn-city").value.trim()
        };
        if (!newFiche.company_name || !newFiche.contact_name || !newFiche.phone || !newFiche.address || !newFiche.postal_code || !newFiche.city) {
          fail("Complétez toute la fiche du client final (société, contact, téléphone, adresse, code postal, ville).");
          return;
        }
        ficheReady = api("cta_end_clients", {
          method: "POST",
          prefer: "return=representation",
          body: newFiche
        }).then(function (rows) {
          var f = rows && rows[0];
          var loc = document.getElementById("ir-loc");
          if (f && !loc.value.trim() && fullAddr(f)) loc.value = fullAddr(f);
          return f ? f.id : null;
        });
      } else {
        ficheReady = Promise.resolve(endChoice || null);
      }
      ficheReady.then(function (endClientId) {
        var equipVal = document.getElementById("ir-equip").value;
        if (equipVal === "__autre") equipVal = document.getElementById("ir-equip-autre").value.trim();
        var body = {
          partner_id: uid,
          end_client_id: endClientId,
          category: cat,
          desired_date: document.getElementById("ir-date").value || null,
          desired_slot: document.getElementById("ir-slot").value || null,
          equipment: equipVal || null,
          location: document.getElementById("ir-loc").value.trim() || null,
          message: document.getElementById("ir-msg").value.trim() || null
        };
        return api("cta_intervention_requests", { method: "POST", body: body });
      })
        .then(function () {
          document.getElementById("ireq-form").reset();
          document.getElementById("ir-newclient").hidden = true;
          document.getElementById("ir-price").hidden = true;
          document.getElementById("ir-equip-autre").hidden = true;
          document.getElementById("ireq-modal").hidden = true;
          if (endChoice === "__new") loadFiches();
          return loadMyRequests();
        })
        .catch(function () { fail("Envoi impossible, réessayez plus tard."); });
    });
  }

  /* ---------- Location / prêt de matériel ---------- */
  // Prêt : 24 h à 1 semaine maximum · Location : 24 h à longue durée,
  // au tarif dégressif ci-dessous (plus c'est long, moins c'est cher par jour).
  var EQR_DURATIONS = {
    pret: ["24 h", "48 h", "72 h", "1 semaine"],
    location: ["24 h", "48 h", "72 h", "1 semaine", "2 semaines", "1 mois", "Longue durée (plus d'un mois)"]
  };
  var RENTAL_PRICES = {
    "24 h": 150, "48 h": 220, "72 h": 270, "1 semaine": 320,
    "2 semaines": 335, "1 mois": 350, "Longue durée (plus d'un mois)": 350
  };
  function rentalPriceLabel(dur) {
    var p = RENTAL_PRICES[dur];
    if (p == null) return "";
    return p.toLocaleString("fr-FR") + " € HT";
  }
  var eqReqs = [];
  var EQR_STATUS = {
    nouvelle: ["Envoyée", "badge-blue"], acceptee: ["Acceptée ✓", "badge-green"],
    refusee: ["Refusée", "badge-grey"], terminee: ["Terminée", "badge-grey"]
  };
  function refreshEqrDurations() {
    var kind = document.getElementById("eqr-kind").value;
    var sel = document.getElementById("eqr-duration");
    var current = sel.value;
    sel.innerHTML = '<option value="">Durée souhaitée *</option>' +
      EQR_DURATIONS[kind].map(function (d) {
        return '<option value="' + esc(d) + '">' + esc(d) +
          (kind === "location" ? " · " + rentalPriceLabel(d) : "") + "</option>";
      }).join("");
    if (EQR_DURATIONS[kind].indexOf(current) !== -1) sel.value = current;
    refreshEqrPrice();
  }
  function refreshEqrPrice() {
    var hint = document.getElementById("eqr-price");
    var kind = document.getElementById("eqr-kind").value;
    var dur = document.getElementById("eqr-duration").value;
    if (kind !== "location" || !dur || RENTAL_PRICES[dur] == null) { hint.hidden = true; return; }
    hint.hidden = false;
    hint.textContent = "💶 Location " + dur + " : " + rentalPriceLabel(dur) +
      (dur === "Longue durée (plus d'un mois)" ? " le premier mois (conditions ajustées ensuite avec CTA)." :
       " (tarif dégressif : 1 mois complet = 350 € HT seulement).");
  }
  document.getElementById("eqr-kind").addEventListener("change", refreshEqrDurations);
  document.getElementById("eqr-duration").addEventListener("change", refreshEqrPrice);
  refreshEqrDurations();
  // Distributeur : la demande peut être pour sa société ou pour un client final
  function fillEqrEndclient() {
    var sel = document.getElementById("eqr-endclient");
    if (clientType !== "distributeur") { sel.hidden = true; return; }
    sel.hidden = false;
    var current = sel.value;
    sel.innerHTML = '<option value="">Pour qui ? Pour ma société</option>' +
      fiches.map(function (f) { return '<option value="' + f.id + '">🏁 Pour mon client : ' + esc(f.company_name) + "</option>"; }).join("") +
      '<option value="__new">➕ Pour un nouveau client final…</option>';
    if (current && sel.querySelector('option[value="' + current + '"]')) sel.value = current;
  }
  document.getElementById("eqr-endclient").addEventListener("change", function () {
    document.getElementById("eqr-newclient").hidden = this.value !== "__new";
  });
  function renderEqReqs() {
    var host = document.getElementById("eqr-list");
    if (!eqReqs.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucune demande pour le moment : choisissez un appareil ci-dessus.</p>';
      return;
    }
    host.innerHTML = eqReqs.map(function (r) {
      var st = EQR_STATUS[r.status] || [r.status, "badge-grey"];
      var endClient = r.cta_end_clients && r.cta_end_clients.company_name;
      var billing = "";
      if (r.kind === "location" && r.price_ht != null) {
        billing = '<div style="margin-top:4px;font-size:12.5px;">💶 <strong style="color:#dfe6f2;">' +
          Number(r.price_ht).toLocaleString("fr-FR") + " € HT</strong> · " +
          (r.invoiced
            ? '<span style="color:#38d47a;">Facturée ✓</span>'
            : '<span style="color:#ffbe50;">En attente de facturation</span>') + "</div>";
      }
      return '<div class="list-row">' +
        '<span class="badge ' + (r.kind === "location" ? "badge-amber" : "badge-blue") + '">' + (r.kind === "location" ? "💶 Location" : "🤝 Prêt") + "</span>" +
        '<div style="flex:1;min-width:200px;">' +
        '<div style="font-weight:800;font-size:14.5px;">' + esc(r.product_name) +
        (endClient ? ' <span style="font-weight:600;font-size:13px;color:#7fadff;">· 🏁 chez ' + esc(endClient) + "</span>" : "") + "</div>" +
        '<div style="margin-top:3px;font-size:12.5px;color:#93a0b5;">' +
        [r.duration ? "⏱️ " + r.duration : "", r.start_date ? "📅 à partir du " + fmtDate(r.start_date) : ""].filter(Boolean).map(esc).join(" · ") + "</div>" +
        billing +
        (r.message ? '<div style="margin-top:3px;font-size:12.5px;color:#8b98ae;">' + esc(r.message) + "</div>" : "") +
        '<div style="margin-top:3px;font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#5f6d84;">Envoyée le ' + esc(fmtDateTime(r.created_at)) + "</div></div>" +
        '<span class="badge ' + st[1] + '">' + st[0] + "</span></div>";
    }).join("");
  }
  function loadEqReqs() {
    return api("cta_equipment_requests?select=*,cta_end_clients(company_name)&order=created_at.desc").then(function (rows) {
      eqReqs = rows;
      renderEqReqs();
    }).catch(function () { /* non bloquant */ });
  }
  loadEqReqs();
  document.getElementById("eqr-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var err = document.getElementById("eqr-err");
    function fail(t) { err.hidden = false; err.textContent = t; }
    err.hidden = true;
    var product = document.getElementById("eqr-product").value;
    if (!product) { fail("Choisissez l'appareil souhaité."); return; }
    if (product === "__autre") {
      product = (window.prompt("Quel appareil souhaitez-vous emprunter ou louer ?") || "").trim();
      if (!product) return;
    }
    var kind = document.getElementById("eqr-kind").value;
    var duration = document.getElementById("eqr-duration").value;
    if (!duration) { fail("Indiquez la durée souhaitée" + (kind === "pret" ? " (1 semaine maximum pour un prêt)." : ".")); return; }
    var endChoice = clientType === "distributeur" ? document.getElementById("eqr-endclient").value : "";
    var ficheReady;
    if (endChoice === "__new") {
      var fiche = {
        distributor_id: uid,
        company_name: document.getElementById("ern-company").value.trim(),
        contact_name: document.getElementById("ern-contact").value.trim(),
        phone: document.getElementById("ern-phone").value.trim(),
        email: document.getElementById("ern-email").value.trim() || null,
        address: document.getElementById("ern-address").value.trim(),
        postal_code: document.getElementById("ern-zip").value.trim(),
        city: document.getElementById("ern-city").value.trim()
      };
      if (!fiche.company_name || !fiche.contact_name || !fiche.phone || !fiche.address || !fiche.postal_code || !fiche.city) {
        fail("Complétez toute la fiche du client final (société, contact, téléphone, adresse, code postal, ville).");
        return;
      }
      ficheReady = api("cta_end_clients", { method: "POST", prefer: "return=representation", body: fiche })
        .then(function (rows) { return rows && rows[0] ? rows[0].id : null; });
    } else {
      ficheReady = Promise.resolve(endChoice || null);
    }
    ficheReady.then(function (endClientId) {
      var body = {
        partner_id: uid,
        end_client_id: endClientId,
        product_name: product,
        kind: kind,
        duration: duration,
        price_ht: kind === "location" ? (RENTAL_PRICES[duration] != null ? RENTAL_PRICES[duration] : null) : null,
        start_date: document.getElementById("eqr-date").value || null,
        message: document.getElementById("eqr-msg").value.trim() || null
      };
      return api("cta_equipment_requests", { method: "POST", body: body });
    })
      .then(function () {
        ev.target.reset();
        document.getElementById("eqr-newclient").hidden = true;
        refreshEqrDurations();
        if (endChoice === "__new" && clientType === "distributeur") loadFiches();
        return loadEqReqs();
      })
      .catch(function () { fail("Envoi de la demande impossible, réessayez."); });
  });

  /* ---------- Mise en service à distance : assistant pas à pas ---------- */
  var setupGuides = [];
  var mesSteps = [];
  var mesStep = 0;
  var mesDevice = "";
  api("cta_setup_guides?select=*").then(function (rows) { setupGuides = rows || []; }).catch(function () { /* non bloquant */ });
  document.getElementById("mes-device").addEventListener("change", function () {
    mesDevice = this.value;
    var host = document.getElementById("mes-bot");
    if (!mesDevice) { host.innerHTML = ""; return; }
    var devNorm = mesDevice.toLowerCase();
    var g = setupGuides.find(function (x) {
      var d = String(x.device || "").toLowerCase();
      return d && (devNorm.indexOf(d) !== -1 || d.indexOf(devNorm) !== -1);
    });
    if (!g) {
      mesSteps = [];
      host.innerHTML = '<p style="margin:0;padding:16px;border-radius:12px;background:rgba(255,190,80,.08);border:1px solid rgba(255,190,80,.3);color:#ffbe50;font-size:13.5px;line-height:1.6;">Pas encore de guide pour cet appareil. Ouvrez un ticket dans la messagerie : CTA vous accompagne en direct (et le guide sera ajouté).</p>';
      return;
    }
    mesSteps = String(g.steps).split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    mesStep = 0;
    renderMesBot();
  });
  function renderMesBot() {
    var host = document.getElementById("mes-bot");
    var total = mesSteps.length;
    if (mesStep >= total) {
      host.innerHTML =
        '<div style="padding:22px;border-radius:14px;background:rgba(56,212,122,.08);border:1px solid rgba(56,212,122,.3);text-align:center;">' +
        '<div style="font-size:30px;">🎉</div>' +
        '<div style="margin-top:8px;font-weight:800;font-size:16px;color:#38d47a;">Mise en service terminée !</div>' +
        '<div style="margin-top:6px;font-size:13.5px;color:#9aa6ba;">Votre ' + esc(mesDevice) + ' est prêt. Un doute sur une étape ? Ouvrez un ticket, nous vérifions avec vous.</div>' +
        '<button type="button" id="mes-restart" style="margin-top:14px;padding:9px 18px;border-radius:999px;border:1px solid rgba(150,180,230,.3);background:transparent;color:#dfe6f2;font-weight:700;font-size:12.5px;cursor:pointer;font-family:\'Archivo\',sans-serif;">↺ Recommencer le guide</button>' +
        "</div>";
      host.querySelector("#mes-restart").addEventListener("click", function () { mesStep = 0; renderMesBot(); });
      return;
    }
    var pct = Math.round((mesStep / total) * 100);
    host.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">' +
      '<div style="flex:1;height:6px;border-radius:999px;background:rgba(120,150,200,.15);overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#2f7bff,#4d8dff);"></div></div>' +
      '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:12px;color:#7fadff;">Étape ' + (mesStep + 1) + "/" + total + "</span></div>" +
      '<div style="display:flex;gap:12px;align-items:flex-start;">' +
      '<span style="width:38px;height:38px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:17px;background:rgba(47,123,255,.15);border:1px solid rgba(77,141,255,.45);">🤖</span>' +
      '<div style="flex:1;padding:14px 18px;border-radius:4px 14px 14px 14px;background:rgba(47,123,255,.12);border:1px solid rgba(77,141,255,.3);font-size:14px;line-height:1.65;color:#dfe6f2;">' + esc(mesSteps[mesStep]) + "</div></div>" +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;">' +
      (mesStep > 0 ? '<button type="button" id="mes-prev" style="padding:11px 20px;border-radius:999px;border:1px solid rgba(150,180,230,.3);background:transparent;color:#dfe6f2;font-weight:700;font-size:13px;cursor:pointer;font-family:\'Archivo\',sans-serif;">← Étape précédente</button>' : "") +
      '<button type="button" id="mes-next" class="btn-primary" style="padding:11px 22px;border-radius:999px;border:none;background:linear-gradient(135deg,#2f7bff,#1c5bd6);color:#fff;font-weight:800;font-size:13.5px;cursor:pointer;box-shadow:0 6px 20px rgba(47,123,255,.35);">✅ C\'est fait, étape suivante</button>' +
      "</div>";
    var prev = host.querySelector("#mes-prev");
    if (prev) prev.addEventListener("click", function () { mesStep--; renderMesBot(); });
    host.querySelector("#mes-next").addEventListener("click", function () { mesStep++; renderMesBot(); });
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
