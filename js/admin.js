/* Back-office CTA · réservé au compte administrateur.
   Toutes les données passent par l'API REST du backend (RLS : policies admin)
   et par la fonction Edge admin-users pour la gestion des comptes. */
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
    return n == null ? "" : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: Number(n) % 1 ? 2 : 0 }) + " €";
  }
  var CATS = {
    conseil: "💬 Conseil", valise: "🧰 Valise Autel", atf: "🛢️ Station ATF",
    adas: "🎯 ADAS", distance: "📞 À distance", autre: "🔧 Autre"
  };
  function catChip(c) {
    return '<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;border:1px solid rgba(120,150,200,.28);font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#9fb6d8;white-space:nowrap;">' +
      esc(CATS[c] || CATS.autre) + "</span>";
  }
  function mondayIsoOf(dateIso) {
    var pa = dateIso.split("-").map(Number);
    var d = new Date(pa[0], pa[1] - 1, pa[2]);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function frMonth(ym) {
    var t = new Date(ym + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function weekLabelOf(mIso) {
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
    ouvert: ["Ouvert", "badge-blue"], resolu: ["Résolu", "badge-green"], ferme: ["Fermé", "badge-grey"],
    new: ["Nouveau", "badge-blue"], traite: ["Traité", "badge-green"], archive: ["Archivé", "badge-grey"]
  };
  function badge(status) {
    var s = STATUS[status] || [status, "badge-grey"];
    return '<span class="badge ' + s[1] + '">' + esc(s[0]) + "</span>";
  }
  function typeBadge(t) {
    return t === "distributeur"
      ? '<span class="badge badge-green">Distributeur</span>'
      : '<span class="badge badge-blue">Direct</span>';
  }
  function showError(msg) {
    var el = document.getElementById("portal-error");
    el.hidden = false;
    el.textContent = msg;
  }
  function statusSelect(current, options, cls) {
    return '<select class="input ' + cls + '" style="padding:8px 12px;width:auto;font-size:13px;">' +
      options.map(function (o) {
        var s = STATUS[o] || [o];
        return '<option value="' + o + '"' + (o === current ? " selected" : "") + ">" + esc(s[0]) + "</option>";
      }).join("") + "</select>";
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
    loadAll();
  }).catch(function () { showError("Impossible de vérifier vos droits : reconnectez-vous."); });

  /* ---------- Onglets ---------- */
  var TAB_NAMES = ["accueil", "demandes", "clients", "interventions", "grille", "materiel", "agenda"];
  var tabs = document.querySelectorAll(".tab");
  function activateTab(name) {
    if (TAB_NAMES.indexOf(name) === -1) name = "accueil";
    tabs.forEach(function (x) { x.classList.toggle("active", x.dataset.tab === name); });
    TAB_NAMES.forEach(function (n) {
      document.getElementById("tab-" + n).hidden = n !== name;
    });
    document.querySelectorAll("#bottom-nav [data-bn-tab]").forEach(function (b) {
      b.classList.toggle("active", b.dataset.bnTab === name);
    });
  }
  function showTab(name) {
    if (("#" + name) === window.location.hash) activateTab(name);
    else window.location.hash = name;
  }
  tabs.forEach(function (t) {
    if (!t.dataset.tab) return; // lien (messagerie dédiée)
    t.addEventListener("click", function () { showTab(t.dataset.tab); });
  });
  window.addEventListener("hashchange", function () {
    activateTab(window.location.hash.replace("#", ""));
  });
  if (window.location.hash) activateTab(window.location.hash.replace("#", ""));

  // Menu bas façon application (téléphone) : une page par icône
  (function buildBottomNav() {
    var items = [
      ["accueil", '<img src="assets/logo-cta-transparent.png" alt="" class="bn-logo">', "Accueil"],
      ["demandes", "📥", "Contacts"],
      ["clients", "👥", "Clients"],
      ["interventions", "🛠️", "Interv."],
      ["grille", "💶", "Tarifs"],
      ["materiel", "🧰", "Prêt"],
      ["agenda", "📅", "Agenda"]
    ];
    var nav = document.getElementById("bottom-nav");
    nav.innerHTML = items.map(function (it) {
      return '<button type="button" class="bn-item' + (it[0] === "accueil" ? " active" : "") + '" data-bn-tab="' + it[0] + '"><span class="bn-ico">' + it[1] + "</span><span>" + it[2] + "</span></button>";
    }).join("") +
      '<a class="bn-item" id="bn-messages" href="messagerie.html" style="text-decoration:none;"><span class="bn-ico">💬</span><span>Messages</span></a>';
    nav.querySelectorAll("[data-bn-tab]").forEach(function (b) {
      b.addEventListener("click", function () {
        showTab(b.dataset.bnTab);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  })();

  // Tuiles de l'accueil cliquables : chacune ouvre directement sa page
  document.querySelectorAll("[data-go]").forEach(function (t) {
    t.addEventListener("click", function () { showTab(t.dataset.go); });
    t.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showTab(t.dataset.go); } });
  });
  document.querySelectorAll("[data-href]").forEach(function (t) {
    t.addEventListener("click", function () { window.location.href = t.dataset.href; });
    t.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.location.href = t.dataset.href; } });
  });
  // Pastille rouge avec compteur sur les menus qui demandent un contrôle
  function setNavBadge(tab, count) {
    var sels = tab === "messages"
      ? ["#bottom-nav #bn-messages", '.tabs-row a[href="messagerie.html"]']
      : ["#bottom-nav [data-bn-tab='" + tab + "']", ".tabs-row .tab[data-tab='" + tab + "']"];
    sels.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      var b = el.querySelector(".nav-badge");
      if (!count) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement("span"); b.className = "nav-badge"; el.appendChild(b); }
      b.textContent = count > 99 ? "99+" : count;
    });
  }

  /* ---------- Données ---------- */
  var clients = [], quotes = [], interventions = [], grid = [], tickets = [], blockedDates = [], equipment = [], endClients = [], iReqs = [], products = [], eqReqs = [], setupGuides = [];
  var catFilter = "";
  var typeFilter = "";   // "" | "direct" | "distributeur"
  var clientFilter = ""; // "" ou id d'un client
  var pendingRequestId = null;
  var showArchivedIv = false;

  function clientName(id) {
    var c = clients.find(function (x) { return x.id === id; });
    return c ? (c.company_name || c.email || "?") : "?";
  }

  /* ---------- Planning du jour ---------- */
  function isoToday() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function renderToday() {
    var host = document.getElementById("today-list");
    document.getElementById("today-date").textContent =
      new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    var today = isoToday();
    var rows = interventions
      .filter(function (r) { return r.date === today && r.status !== "annulee"; })
      .sort(function (a, b) { return (a.time_slot || "99") < (b.time_slot || "99") ? -1 : 1; });
    if (!rows.length) {
      var next = interventions
        .filter(function (r) { return r.date > today && r.status === "planifiee"; })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
      host.innerHTML = '<p style="margin:0;color:#8b98ae;font-size:14px;line-height:1.6;">Aucune intervention aujourd\'hui : profitez-en pour souffler 😌' +
        (next ? '<br><span style="color:#5f6d84;font-size:13px;">Prochaine intervention : <strong style="color:#7fadff;">' + esc(fmtDate(next.date)) + (next.time_slot ? " à " + esc(next.time_slot) : "") + "</strong> · " + esc(next.type) + " (" + esc(clientName(next.partner_id)) + ")</span>" : "") + "</p>";
      return;
    }
    host.innerHTML = rows.map(function (r) {
      var c = clients.find(function (x) { return x.id === r.partner_id; }) || {};
      var addr = r.location || c.address || "";
      return '<div data-today-row="' + r.id + '" style="border-radius:16px;background:rgba(47,123,255,.07);border:1px solid rgba(77,141,255,.3);padding:18px;display:flex;flex-direction:column;gap:10px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:20px;font-weight:700;color:#7fadff;">' + esc(r.time_slot || "Journée") + "</span>" + badge(r.status) + "</div>" +
        '<div><div style="font-weight:800;font-size:15.5px;line-height:1.3;">' + esc(r.type) + "</div>" +
        (r.equipment ? '<div style="margin-top:3px;font-size:12.5px;color:#93a0b5;">' + esc(r.equipment) + "</div>" : "") + "</div>" +
        '<div style="padding:12px 14px;border-radius:12px;background:rgba(10,13,19,.6);border:1px solid rgba(120,150,200,.15);display:flex;flex-direction:column;gap:5px;">' +
        '<div style="font-weight:700;font-size:14px;">' + esc(c.company_name || "Client inconnu") + (c.contact_name ? ' <span style="font-weight:600;color:#8b98ae;">· ' + esc(c.contact_name) + "</span>" : "") + "</div>" +
        (r.cta_end_clients ? '<div style="font-size:12.5px;color:#7fadff;">🚗 Client final : ' + esc(r.cta_end_clients.company_name) + "</div>" : "") +
        (c.phone ? '<div style="font-size:13px;color:#9aa6ba;">📞 ' + esc(c.phone) + "</div>" : "") +
        (addr ? '<div style="font-size:13px;color:#9aa6ba;line-height:1.45;">📍 ' + esc(addr) + "</div>" : "") +
        (r.notes ? '<div style="font-size:12.5px;color:#5f6d84;">📝 ' + esc(r.notes) + "</div>" : "") + "</div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:auto;">' +
        (c.phone ? '<a href="tel:' + esc(c.phone.replace(/\s/g, "")) + '" class="btn-primary" style="padding:9px 16px;border-radius:999px;background:linear-gradient(135deg,#2f7bff,#1c5bd6);color:#fff;font-weight:800;font-size:12.5px;box-shadow:0 4px 14px rgba(47,123,255,.35);">📞 Appeler</a>' : "") +
        (addr ? '<a href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr) + '" target="_blank" rel="noopener" ' + GHOST_BTN.replace("cursor:pointer;", "") + ">🗺️ Itinéraire</a>" : "") +
        statusSelect(r.status, ["planifiee", "en_cours", "terminee", "annulee"], "today-status") +
        rdvButtons(r.id) +
        "</div></div>";
    }).join("");
    bindRdvActions(host);
    host.querySelectorAll(".today-status").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var id = sel.closest("[data-today-row]").dataset.todayRow;
        api("cta_interventions?id=eq." + id, { method: "PATCH", body: { status: sel.value } })
          .then(function () {
            interventions.find(function (x) { return x.id === id; }).status = sel.value;
            refreshStats(); renderToday(); renderInterventions();
          }).catch(function () { showError("Mise à jour impossible."); });
      });
    });
  }

  /* ---------- Semaine à venir ---------- */
  function renderWeek() {
    renderLater();
    var host = document.getElementById("week-list");
    var today = isoToday();
    var rows = interventions
      .filter(function (r) { return r.date && r.date > today && r.status !== "annulee"; })
      .sort(function (a, b) {
        return (a.date + (a.time_slot || "99")) < (b.date + (b.time_slot || "99")) ? -1 : 1;
      });
    var horizon = new Date();
    horizon.setDate(horizon.getDate() + 7);
    var maxIso = horizon.getFullYear() + "-" + String(horizon.getMonth() + 1).padStart(2, "0") + "-" + String(horizon.getDate()).padStart(2, "0");
    rows = rows.filter(function (r) { return r.date <= maxIso; });
    if (!rows.length) {
      host.innerHTML = '<p style="margin:0;color:#8b98ae;font-size:14px;">Aucune intervention planifiée sur les 7 prochains jours.</p>';
      return;
    }
    var byDay = {};
    rows.forEach(function (r) { (byDay[r.date] = byDay[r.date] || []).push(r); });
    host.innerHTML = Object.keys(byDay).sort().map(function (day) {
      var label = new Date(day + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
      return '<div style="margin-bottom:14px;">' +
        '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:12px;letter-spacing:.1em;color:#7fadff;text-transform:capitalize;margin-bottom:8px;">' + esc(label) + "</div>" +
        byDay[day].map(function (r) {
          var c = clients.find(function (x) { return x.id === r.partner_id; }) || {};
          var addr = r.location || c.address || "";
          return '<div style="display:flex;gap:12px;align-items:flex-start;padding:10px 14px;margin-bottom:6px;border-radius:12px;background:rgba(13,17,25,.7);border:1px solid rgba(120,150,200,.14);flex-wrap:wrap;">' +
            '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:13.5px;font-weight:700;color:#c9d4e6;min-width:52px;">' + esc(r.time_slot || "Journée") + "</span>" +
            '<div style="flex:1;min-width:200px;">' +
            '<div style="font-weight:700;font-size:13.5px;">' + esc(r.type) + ' <span style="font-weight:600;color:#7fadff;">· ' + esc(c.company_name || "?") + (r.cta_end_clients ? " → 🚗 " + esc(r.cta_end_clients.company_name) : "") + "</span></div>" +
            '<div style="margin-top:2px;font-size:12px;color:#8b98ae;">' +
            [c.phone ? "📞 " + esc(c.phone) : "", addr ? "📍 " + esc(addr) : ""].filter(Boolean).join(" &nbsp; ") + "</div>" +
            (r.notes ? '<div style="margin-top:3px;font-size:12px;color:#9fb6d8;">📝 ' + esc(r.notes) + "</div>" : "") +
            "</div>" + badge(r.status) +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;flex-basis:100%;">' + rdvButtons(r.id) + "</div>" +
            "</div>";
        }).join("") + "</div>";
    }).join("");
    bindRdvActions(host);
  }

  /* ---------- Actions rendez-vous : relance, report, annulation ---------- */
  function afterIvChange() {
    refreshStats(); renderToday(); renderWeek(); renderCA(); renderInterventions();
  }
  var RDV_BTN = 'style="padding:6px 12px;border-radius:999px;border:1px solid rgba(120,150,200,.28);background:transparent;color:#9fb6d8;font-weight:700;font-size:11.5px;cursor:pointer;font-family:\'Archivo\',sans-serif;white-space:nowrap;"';
  function rdvButtons(id) {
    return '<button type="button" ' + RDV_BTN + ' data-rdv-remind="' + id + '">📧 Relancer</button>' +
      '<button type="button" ' + RDV_BTN + ' data-rdv-move="' + id + '">📅 Reporter</button>' +
      '<button type="button" ' + DANGER_BTN.replace('style="', 'style="white-space:nowrap;') + ' data-rdv-cancel="' + id + '">✕ Annuler</button>';
  }
  function bindRdvActions(host) {
    host.querySelectorAll("[data-rdv-remind]").forEach(function (b) {
      b.addEventListener("click", function () { remindIv(b.dataset.rdvRemind); });
    });
    host.querySelectorAll("[data-rdv-move]").forEach(function (b) {
      b.addEventListener("click", function () { rescheduleIv(b.dataset.rdvMove); });
    });
    host.querySelectorAll("[data-rdv-cancel]").forEach(function (b) {
      b.addEventListener("click", function () { cancelIv(b.dataset.rdvCancel); });
    });
  }
  function noticeResult(res, okText) {
    window.alert(res && res.sent ? okText + (res.to ? "\nDestinataire : " + res.to : "")
      : "E-mail non envoyé : " + ((res && res.reason) || "erreur inconnue"));
  }
  function remindIv(id) {
    var r = interventions.find(function (x) { return x.id === id; });
    if (!r) return;
    if (!window.confirm("Envoyer une relance par e-mail à " + clientName(r.partner_id) + " pour le rendez-vous du " + fmtDate(r.date) + (r.time_slot ? " à " + r.time_slot : "") + " ?")) return;
    fn("send-notice", { intervention_id: id, kind: "relance" })
      .then(function (res) { noticeResult(res, "Relance envoyée ✓"); })
      .catch(function (e) { showError("Relance impossible : " + e.message); });
  }
  // Report de rendez-vous : petit formulaire avec vrais sélecteurs date / heure
  // (plus simple sur téléphone que les anciennes fenêtres de saisie).
  var reschedId = null;
  function closeResched() {
    var m = document.getElementById("resched-modal");
    if (m) m.hidden = true;
    reschedId = null;
  }
  function rescheduleIv(id) {
    var r = interventions.find(function (x) { return x.id === id; });
    var modal = document.getElementById("resched-modal");
    if (!r || !modal) return;
    reschedId = id;
    document.getElementById("rs-info").textContent =
      clientName(r.partner_id) + (r.type ? " · " + r.type : "") +
      " · actuellement le " + fmtDate(r.date) + (r.time_slot ? " à " + r.time_slot.slice(0, 5) : "");
    document.getElementById("rs-date").value = r.date || "";
    document.getElementById("rs-time").value = r.time_slot ? r.time_slot.slice(0, 5) : "";
    document.getElementById("rs-notify").checked = true;
    modal.hidden = false;
    document.getElementById("rs-date").focus();
  }
  ctaOn("rs-cancel", "click", closeResched);
  ctaOn("resched-modal", "click", function (e) { if (e.target === this) closeResched(); });
  ctaOn("resched-form", "submit", function (ev) {
    ev.preventDefault();
    var r = interventions.find(function (x) { return x.id === reschedId; });
    if (!r) { closeResched(); return; }
    var id = reschedId;
    var nd = document.getElementById("rs-date").value;
    var ns = document.getElementById("rs-time").value;
    var notify = document.getElementById("rs-notify").checked;
    if (!nd) return;
    var oldDate = r.date;
    api("cta_interventions?id=eq." + id, { method: "PATCH", body: { date: nd, time_slot: ns || null } })
      .then(function () {
        r.date = nd;
        r.time_slot = ns || null;
        closeResched();
        afterIvChange();
        if (notify) {
          return fn("send-notice", { intervention_id: id, kind: "report", new_date: nd, new_slot: ns || null, old_date: oldDate })
            .then(function (res) { noticeResult(res, "Rendez-vous reporté ✓ Client prévenu par e-mail."); })
            .catch(function (e) { showError("Rendez-vous reporté, mais e-mail impossible : " + e.message); });
        }
      })
      .catch(function () { showError("Report impossible."); });
  });
  function cancelIv(id) {
    var r = interventions.find(function (x) { return x.id === id; });
    if (!r) return;
    if (!window.confirm("Annuler le rendez-vous de " + clientName(r.partner_id) + " du " + fmtDate(r.date) + (r.time_slot ? " à " + r.time_slot : "") + " ?")) return;
    api("cta_interventions?id=eq." + id, { method: "PATCH", body: { status: "annulee" } })
      .then(function () {
        r.status = "annulee";
        afterIvChange();
        if (window.confirm("Rendez-vous annulé ✓\n\nPrévenir le client par e-mail ?")) {
          return fn("send-notice", { intervention_id: id, kind: "annulation", old_date: r.date })
            .then(function (res) { noticeResult(res, "Client prévenu de l'annulation ✓"); })
            .catch(function (e) { showError("E-mail d'annulation impossible : " + e.message); });
        }
      })
      .catch(function () { showError("Annulation impossible."); });
  }

  /* ---------- Programmé plus loin (au-delà de 7 jours) ---------- */
  function secteurOf(loc) {
    if (!loc) return "";
    var seg = String(loc).split(",").pop().trim();
    // Un code postal seul (ou CP + ville) : le département est ajouté derrière
    var m = seg.match(/\b(\d{5})\b/);
    if (m) {
      var dept = (window.CTA_DEPTS || {})[m[1].slice(0, 2)];
      if (dept && seg.toLowerCase().indexOf(dept.toLowerCase()) === -1) return seg + " · " + dept;
    }
    return seg;
  }
  function longDate(iso) {
    var t = new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function renderLater() {
    var host = document.getElementById("later-list");
    if (!host) return;
    var horizon = new Date();
    horizon.setDate(horizon.getDate() + 7);
    var maxIso = isoOf(horizon);
    var rows = interventions
      .filter(function (r) { return r.date && r.date > maxIso && r.status !== "annulee" && r.status !== "terminee"; })
      .sort(function (a, b) { return (a.date + (a.time_slot || "99")) < (b.date + (b.time_slot || "99")) ? -1 : 1; });
    if (!rows.length) {
      host.innerHTML = '<p style="margin:0;color:#8b98ae;font-size:14px;">Rien de programmé au-delà de la semaine à venir : le planning est libre.</p>';
      return;
    }
    var sep = ' <span style="color:#4d8dff;">→</span> ';
    host.innerHTML = rows.map(function (r) {
      var c = clients.find(function (x) { return x.id === r.partner_id; }) || {};
      var secteur = secteurOf(r.location || c.address);
      return '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;padding:9px 14px;margin-bottom:6px;border-radius:12px;background:rgba(13,17,25,.7);border:1px solid rgba(120,150,200,.14);font-size:13.5px;line-height:1.5;">' +
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-weight:700;color:#7fadff;">' + esc(longDate(r.date)) + (r.time_slot ? " · " + esc(r.time_slot) : "") + "</span>" + sep +
        '<span style="font-weight:700;color:#dfe6f2;">' + esc(r.type) + "</span>" + sep +
        '<span style="color:#c9d4e6;">' + esc(c.company_name || "?") + (r.cta_end_clients ? " 🚗 " + esc(r.cta_end_clients.company_name) : "") + "</span>" +
        (secteur ? sep + '<span style="color:#38d47a;">📍 ' + esc(secteur) + "</span>" : "") +
        '<span style="flex:1;"></span><span style="display:flex;gap:6px;flex-wrap:wrap;">' + rdvButtons(r.id) + "</span>" +
        "</div>";
    }).join("");
    bindRdvActions(host);
  }

  /* ---------- Menus du formulaire de planification ---------- */
  function renderIntervFormOptions() {
    var slotSel = document.getElementById("iv-slot");
    if (!slotSel.options.length) {
      var opts = '<option value="">Heure (journée)</option>';
      for (var h = 8; h <= 18; h++) {
        ["00", "30"].forEach(function (m) {
          if (h === 18 && m === "30") return;
          var t = String(h).padStart(2, "0") + ":" + m;
          opts += '<option value="' + t + '">' + t + "</option>";
        });
      }
      slotSel.innerHTML = opts;
    }
    var eqSel = document.getElementById("iv-equip");
    var current = eqSel.value;
    eqSel.innerHTML = '<option value="">Matériel (aucun)</option>' +
      equipment.map(function (e) {
        var label = e.name + (e.ref ? " · " + e.ref : "");
        return '<option value="' + esc(label) + '">' + esc(label) + (e.status !== "disponible" ? " (" + (EQ_STATUS[e.status] || [e.status])[0].toLowerCase() + ")" : "") + "</option>";
      }).join("") +
      '<option value="__autre">Autre…</option>';
    if (current) eqSel.value = current;
  }

  /* ---------- Chiffre d'affaires (interventions terminées) ---------- */
  function isoOf(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function renderCA() {
    var now = new Date();
    var today = isoOf(now);
    var monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // lundi de la semaine en cours
    var weekStart = isoOf(monday);
    var monthPrefix = today.slice(0, 7);
    var done = interventions.filter(function (r) { return r.status === "terminee" && (r.amount_ht != null || r.travel_ht != null) && r.date; });
    function sum(rows) {
      var t = 0;
      rows.forEach(function (r) { t += (Number(r.amount_ht) || 0) + (Number(r.travel_ht) || 0); });
      return t.toLocaleString("fr-FR", { minimumFractionDigits: t % 1 ? 2 : 0 }) + " €";
    }
    document.getElementById("ca-day").textContent = sum(done.filter(function (r) { return r.date === today; }));
    document.getElementById("ca-week").textContent = sum(done.filter(function (r) { return r.date >= weekStart && r.date <= today; }));
    document.getElementById("ca-month").textContent = sum(done.filter(function (r) { return r.date.slice(0, 7) === monthPrefix; }));
    var missing = interventions.filter(function (r) { return r.status === "terminee" && r.amount_ht == null; }).length;
    var note = document.getElementById("ca-note");
    note.hidden = !missing;
    if (missing) note.textContent = "⚠️ " + missing + " intervention" + (missing > 1 ? "s" : "") +
      " terminée" + (missing > 1 ? "s" : "") + " sans montant HT : renseignez-le dans l'onglet Interventions pour un CA exact.";
  }

  function refreshStats() {
    var toTreat = quotes.filter(function (q) { return q.status === "new"; }).length +
      iReqs.filter(function (r) { return r.status === "nouvelle"; }).length;
    var openTickets = tickets.filter(function (t) { return t.status === "ouvert" || t.status === "en_cours"; }).length;
    var upcoming = interventions.filter(function (i) { return i.status === "planifiee" || i.status === "en_cours"; }).length;
    var eqrNew = eqReqs.filter(function (r) { return r.status === "nouvelle"; }).length;
    document.getElementById("stat-quotes").textContent = toTreat;
    document.getElementById("stat-tickets").textContent = openTickets;
    document.getElementById("stat-interv").textContent = upcoming;
    setNavBadge("demandes", toTreat);
    setNavBadge("messages", openTickets);
    setNavBadge("interventions", upcoming);
    setNavBadge("materiel", eqrNew);
  }

  function loadAll() {
    Promise.all([
      api("cta_partners?select=*&order=created_at.asc"),
      api("quote_requests?select=*&order=created_at.desc"),
      api("cta_interventions?select=*,cta_end_clients(company_name)&order=date.desc"),
      api("cta_price_grid?select=*&order=sort.asc"),
      api("cta_tickets?select=id,status&order=updated_at.desc"),
      api("blocked_dates?select=*&order=day.asc"),
      api("cta_equipment?select=*&order=name.asc"),
      api("cta_end_clients?select=*&order=company_name.asc"),
      api("cta_intervention_requests?select=*,cta_end_clients(company_name,address,postal_code,city)&order=created_at.desc"),
      api("cta_products?select=*,cta_product_admin_costs(admin_price_ht)&order=sort.asc"),
      api("cta_equipment_requests?select=*,cta_end_clients(company_name,contact_name,phone,address,postal_code,city)&order=created_at.desc"),
      api("cta_setup_guides?select=*&order=created_at.asc")
    ]).then(function (res) {
      clients = res[0]; quotes = res[1]; interventions = res[2];
      grid = res[3]; tickets = res[4]; blockedDates = res[5];
      equipment = res[6]; endClients = res[7]; iReqs = res[8]; products = res[9];
      eqReqs = res[10]; setupGuides = res[11];
      refreshStats(); renderToday(); renderWeek(); renderCA();
      renderQuotes(); renderClients(); renderClientSelects();
      renderInterventions(); renderGrid(); renderBlocked();
      renderEquipment(); renderIntervFormOptions(); renderProductsAdmin();
      renderIReqs(); renderClientFilter(); renderCatFilter(); renderEndClientsAdmin();
      renderEqReqsAdmin(); renderSetupGuides(); renderCalendar();
    }).catch(function () {
      showError("Chargement impossible : vérifiez votre connexion ou reconnectez-vous.");
    });
  }

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
      window.alert("Notifications activées sur cet appareil ✓\nVous serez prévenu des nouveaux messages clients.");
    }).catch(function (e) { window.alert("Notifications : " + e.message); });
  });

  /* ---------- Demandes de devis (deux tableaux : garages / distributeurs) ---------- */
  var showArchQ = { garage: false, distrib: false };
  var pendingQuoteAccessId = null;
  function quoteRow(q) {
    var archived = q.status === "archive";
    var actions = archived
      ? '<button ' + GHOST_BTN + ' data-quote-reopen="' + q.id + '">Rouvrir</button>' +
        '<button ' + DANGER_BTN + ' data-quote-del="' + q.id + '">Supprimer</button>'
      : '<button class="btn-primary" data-quote-access="' + q.id + '" style="padding:8px 16px;border-radius:999px;border:none;background:linear-gradient(135deg,#2f7bff,#1c5bd6);color:#fff;font-weight:800;font-size:12px;cursor:pointer;">Créer l\'accès →</button>' +
        (q.status === "new"
          ? '<button ' + GHOST_BTN + ' data-quote-done="' + q.id + '">✓ Marquer traitée</button>'
          : '<button ' + GHOST_BTN + ' data-quote-reopen="' + q.id + '">Rouvrir</button>') +
        '<button ' + GHOST_BTN + ' data-quote-arch="' + q.id + '" title="Archiver la demande">🗄️</button>' +
        '<button ' + DANGER_BTN + ' data-quote-del="' + q.id + '">Supprimer</button>';
    return quoteRowBody(q, archived, actions);
  }
  function quoteRowBody(q, archived, actions) {
    var services = (q.services || []).map(function (s) {
      return '<span class="badge badge-grey">' + esc(s) + "</span>";
    }).join(" ");
    return '<div class="list-row" style="align-items:flex-start;' + (archived ? "opacity:.72;" : "") + '">' +
      '<div style="flex:1;min-width:260px;">' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><span style="font-weight:800;font-size:15px;">' + esc(q.name) + "</span>" + badge(q.status) +
      (!q.client_kind ? ' <span class="badge badge-grey">type non précisé</span>' : "") + "</div>" +
      '<div style="margin-top:4px;font-size:13px;color:#7fadff;">' +
      [[q.first_name, q.last_name].filter(Boolean).join(" ") ? "👤 " + [q.first_name, q.last_name].filter(Boolean).join(" ") : "",
       q.phone ? "📞 " + q.phone : "",
       "✉️ " + q.contact,
       [q.address, q.postal_code, q.city].filter(Boolean).length ? "📍 " + [q.address, q.postal_code, q.city].filter(Boolean).join(", ") : ""
      ].filter(Boolean).map(esc).join(" · ") + "</div>" +
      (services ? '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">' + services + "</div>" : "") +
      (q.rdv_day ? '<div style="margin-top:8px;font-size:13px;color:#c9d4e6;">📅 RDV souhaité : <strong>' + esc(fmtDate(q.rdv_day)) + (q.rdv_slot ? " à " + esc(q.rdv_slot) : "") + "</strong></div>" : "") +
      (q.message ? '<div style="margin-top:8px;font-size:13px;color:#93a0b5;line-height:1.55;">' + esc(q.message).replace(/\n/g, "<br>") + "</div>" : "") +
      '<div style="margin-top:6px;font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#5f6d84;">Reçue le ' + esc(fmtDateTime(q.created_at)) + "</div>" +
      "</div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + actions + "</div></div>";
  }
  function quoteTable(list, hostId, key, emptyMsg) {
    var host = document.getElementById(hostId);
    var actives = list.filter(function (q) { return q.status !== "archive"; });
    var archives = list.filter(function (q) { return q.status === "archive"; });
    var html = actives.length ? actives.map(quoteRow).join("")
      : '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">' + emptyMsg + "</p>";
    if (archives.length) {
      html += '<div style="padding:12px 24px;"><button type="button" data-quote-toggle="' + key + '" style="padding:9px 14px;border-radius:999px;border:1px dashed rgba(120,150,200,.3);background:transparent;color:#8b98ae;font-weight:700;font-size:12.5px;cursor:pointer;font-family:\'Archivo\',sans-serif;">' +
        (showArchQ[key] ? "▾ 🗄️ Archives (" + archives.length + ") : replier" : "▸ 🗄️ Archives (" + archives.length + ") : dérouler") + "</button></div>";
      if (showArchQ[key]) html += archives.map(quoteRow).join("");
    }
    host.innerHTML = html;
    return host;
  }
  function renderQuotes() {
    var hostG = quoteTable(
      quotes.filter(function (q) { return q.client_kind !== "distributeur"; }),
      "quotes-list-garage", "garage", "Aucune demande de garage pour le moment.");
    var hostD = quoteTable(
      quotes.filter(function (q) { return q.client_kind === "distributeur"; }),
      "quotes-list-distrib", "distrib", "Aucune demande de distributeur pour le moment.");
    [hostG, hostD].forEach(function (host) {
      host.querySelectorAll("[data-quote-toggle]").forEach(function (b) {
        b.addEventListener("click", function () {
          showArchQ[b.dataset.quoteToggle] = !showArchQ[b.dataset.quoteToggle];
          renderQuotes();
        });
      });
      host.querySelectorAll("[data-quote-access]").forEach(function (b) {
        b.addEventListener("click", function () { openClientFormFromQuote(b.dataset.quoteAccess); });
      });
      host.querySelectorAll("[data-quote-done]").forEach(function (b) {
        b.addEventListener("click", function () { setQuoteStatus(b.dataset.quoteDone, "traite"); });
      });
      host.querySelectorAll("[data-quote-arch]").forEach(function (b) {
        b.addEventListener("click", function () { setQuoteStatus(b.dataset.quoteArch, "archive"); });
      });
      host.querySelectorAll("[data-quote-reopen]").forEach(function (b) {
        b.addEventListener("click", function () { setQuoteStatus(b.dataset.quoteReopen, "new"); });
      });
      host.querySelectorAll("[data-quote-del]").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!window.confirm("Supprimer définitivement cette demande ?")) return;
          api("quote_requests?id=eq." + b.dataset.quoteDel, { method: "DELETE" })
            .then(function () {
              quotes = quotes.filter(function (q) { return q.id !== b.dataset.quoteDel; });
              refreshStats(); renderQuotes();
            }).catch(function () { showError("Suppression impossible."); });
        });
      });
    });
  }
  // Depuis une demande : ouvre le formulaire client prérempli avec le bon type d'accès
  function openClientFormFromQuote(id) {
    var q = quotes.find(function (x) { return x.id === id; });
    if (!q) return;
    pendingQuoteAccessId = id; // la demande sera archivée une fois le compte créé
    showTab("clients");
    clientForm.hidden = false;
    document.getElementById("c-email").value = /\S+@\S+\.\S+/.test(q.contact) ? q.contact : "";
    document.getElementById("c-company").value = q.name || "";
    document.getElementById("c-contact").value = [q.first_name, q.last_name].filter(Boolean).join(" ");
    document.getElementById("c-phone").value = q.phone || "";
    document.getElementById("c-address").value = [q.address, [q.postal_code, q.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    document.getElementById("c-type").value = q.client_kind === "distributeur" ? "distributeur" : "direct";
    clientForm.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("c-email").focus();
  }
  function setQuoteStatus(id, status) {
    api("quote_requests?id=eq." + id, { method: "PATCH", body: { status: status } })
      .then(function () {
        var q = quotes.find(function (x) { return x.id === id; });
        if (q) q.status = status;
        refreshStats(); renderQuotes();
      }).catch(function () { showError("Mise à jour impossible."); });
  }

  /* ---------- Clients (une fiche-carte par client) ---------- */
  function fieldBlock(label, inner) {
    return '<div style="display:flex;flex-direction:column;gap:4px;">' +
      '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;letter-spacing:.12em;color:#5f6d84;text-transform:uppercase;">' + label + "</span>" + inner + "</div>";
  }
  function renderClients() {
    var host = document.getElementById("clients-list");
    if (!clients.length) {
      host.style.cssText = "";
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucun client.</p>';
      return;
    }
    host.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;padding:18px;align-items:stretch;";
    host.innerHTML = clients.map(function (c) {
      var isAdmin = c.role === "admin";
      var nb = interventions.filter(function (i) { return i.partner_id === c.id; }).length;
      return '<div data-client-row="' + c.id + '" style="border-radius:16px;background:rgba(13,17,25,.75);border:1px solid rgba(120,150,200,.18);padding:20px;display:flex;flex-direction:column;gap:12px;">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
        '<div><div style="font-weight:900;font-size:16px;">' + esc(c.company_name || c.email || "?") + "</div>" +
        '<a href="mailto:' + esc(c.email || "") + '" style="font-size:12.5px;color:#7fadff;">' + esc(c.email || "") + "</a></div>" +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' + typeBadge(c.client_type) +
        (isAdmin ? ' <span class="badge badge-amber">Admin</span>' : "") + "</div></div>" +
        '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#5f6d84;">' + nb + " intervention" + (nb > 1 ? "s" : "") +
        (c.address ? ' · <a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.address) + '" target="_blank" rel="noopener" style="font-size:12px;">🗺️ Itinéraire</a>' : "") + "</div>" +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
        fieldBlock("Société", '<input class="input" data-f="company_name" value="' + esc(c.company_name || "") + '" style="padding:9px 12px;font-size:13px;">') +
        fieldBlock("Contact", '<input class="input" data-f="contact_name" value="' + esc(c.contact_name || "") + '" style="padding:9px 12px;font-size:13px;">') +
        fieldBlock("Téléphone", '<input class="input" data-f="phone" value="' + esc(c.phone || "") + '" style="padding:9px 12px;font-size:13px;">') +
        fieldBlock("Type de client", '<select class="input" data-f="client_type" style="padding:9px 12px;font-size:13px;">' +
          '<option value="direct"' + (c.client_type === "direct" ? " selected" : "") + ">Direct</option>" +
          '<option value="distributeur"' + (c.client_type === "distributeur" ? " selected" : "") + ">Distributeur</option></select>") +
        "</div>" +
        fieldBlock("Adresse postale", '<input class="input" data-f="address" value="' + esc(c.address || "") + '" placeholder="Rue, CP, ville" style="padding:9px 12px;font-size:13px;">') +
        '<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:#c9d4e6;cursor:pointer;padding:10px 12px;border-radius:10px;background:rgba(47,123,255,.06);border:1px solid rgba(77,141,255,.2);">' +
        '<input type="checkbox" class="client-remote"' + (c.remote_setup_enabled ? " checked" : "") + ' style="accent-color:#2f7bff;">' +
        "🛰️ Mise en service à distance activée</label>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;">' +
        '<button class="btn-primary" data-client-save="' + c.id + '" style="padding:9px 18px;border-radius:999px;border:none;background:linear-gradient(135deg,#2f7bff,#1c5bd6);color:#fff;font-weight:800;font-size:12.5px;cursor:pointer;">Enregistrer</button>' +
        '<button ' + GHOST_BTN + ' data-client-pass="' + c.id + '">Mot de passe</button>' +
        (isAdmin ? "" : '<button ' + DANGER_BTN + ' data-client-del="' + c.id + '">Supprimer</button>') +
        "</div></div>";
    }).join("");
    host.querySelectorAll("[data-client-save]").forEach(function (b) {
      b.addEventListener("click", function () {
        var row = host.querySelector('[data-client-row="' + b.dataset.clientSave + '"]');
        var body = {};
        row.querySelectorAll("[data-f]").forEach(function (inp) { body[inp.dataset.f] = inp.value.trim() || null; });
        body.remote_setup_enabled = row.querySelector(".client-remote").checked;
        api("cta_partners?id=eq." + b.dataset.clientSave, { method: "PATCH", body: body })
          .then(function () {
            var c = clients.find(function (x) { return x.id === b.dataset.clientSave; });
            Object.assign(c, body);
            renderClients(); renderClientSelects();
          }).catch(function () { showError("Enregistrement impossible."); });
      });
    });
    host.querySelectorAll("[data-client-pass]").forEach(function (b) {
      b.addEventListener("click", function () {
        var pass = window.prompt("Nouveau mot de passe (6 caractères minimum) :");
        if (!pass) return;
        fn("admin-users", { action: "set_password", user_id: b.dataset.clientPass, password: pass })
          .then(function () { window.alert("Mot de passe mis à jour ✓"); })
          .catch(function (e) { showError("Mot de passe : " + e.message); });
      });
    });
    host.querySelectorAll("[data-client-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Supprimer ce compte client et toutes ses données (interventions, documents, tickets) ?")) return;
        fn("admin-users", { action: "delete", user_id: b.dataset.clientDel })
          .then(function () { loadAll(); })
          .catch(function (e) { showError("Suppression : " + e.message); });
      });
    });
  }

  function renderClientSelects() {
    var opts = clients.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.company_name || c.email) + "</option>";
    }).join("");
    document.getElementById("iv-client").innerHTML = '<option value="">Choisir un client</option>' + opts;
  }

  var clientForm = document.getElementById("client-form");
  ctaOn("new-client-btn", "click", function () {
    clientForm.hidden = !clientForm.hidden;
    if (!clientForm.hidden) document.getElementById("c-email").focus();
  });
  clientForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    fn("admin-users", {
      action: "create",
      email: document.getElementById("c-email").value.trim(),
      password: document.getElementById("c-pass").value,
      company_name: document.getElementById("c-company").value.trim(),
      contact_name: document.getElementById("c-contact").value.trim(),
      phone: document.getElementById("c-phone").value.trim(),
      address: document.getElementById("c-address").value.trim(),
      client_type: document.getElementById("c-type").value
    }).then(function (res) {
      clientForm.reset();
      clientForm.hidden = true;
      if (res && res.password) {
        window.alert("Compte créé ✓\n\nMot de passe provisoire : " + res.password +
          "\n\nCommuniquez-le au client : il devra le changer à sa première connexion.");
      }
      // Compte ouvert depuis une demande de devis : la demande est archivée
      if (pendingQuoteAccessId) {
        var qid = pendingQuoteAccessId;
        pendingQuoteAccessId = null;
        return api("quote_requests?id=eq." + qid, { method: "PATCH", body: { status: "archive" } })
          .catch(function () { /* la demande restera à archiver à la main */ })
          .then(function () { loadAll(); });
      }
      loadAll();
    }).catch(function (e) { showError("Création du compte : " + e.message); });
  });

  /* ---------- Interventions ---------- */
  function typeOfPartner(id) {
    var c = clients.find(function (x) { return x.id === id; });
    return c && c.client_type === "distributeur" ? "distributeur" : "direct";
  }
  function renderClientFilter() {
    var host = document.getElementById("client-filter");
    if (!host) return;
    var countBy = function (t) {
      return interventions.filter(function (r) { return typeOfPartner(r.partner_id) === t; }).length;
    };
    var chips = [
      ["", "👥 Tous clients (" + interventions.length + ")"],
      ["direct", "🔧 Clients directs (" + countBy("direct") + ")"],
      ["distributeur", "📦 Distributeurs (" + countBy("distributeur") + ")"]
    ];
    var pool = clients
      .filter(function (c) { return c.role !== "admin" && (!typeFilter || (c.client_type === "distributeur" ? "distributeur" : "direct") === typeFilter); })
      .sort(function (a, b) { return String(a.company_name || a.email).localeCompare(String(b.company_name || b.email), "fr"); });
    host.innerHTML = chips.map(function (c) {
      var active = typeFilter === c[0];
      return '<button type="button" data-tf="' + c[0] + '" style="padding:7px 14px;border-radius:999px;font-family:\'IBM Plex Mono\',monospace;font-size:11.5px;cursor:pointer;white-space:nowrap;' +
        (active
          ? "border:1px solid transparent;background:linear-gradient(135deg,#2f7bff,#1c5bd6);color:#fff;"
          : "border:1px solid rgba(120,150,200,.28);background:transparent;color:#9fb6d8;") + '">' +
        esc(c[1]) + "</button>";
    }).join("") +
      '<select id="cf-client" class="input" style="padding:8px 12px;width:auto;max-width:230px;font-size:12.5px;">' +
      '<option value="">Un client en particulier…</option>' +
      pool.map(function (c) {
        return '<option value="' + c.id + '"' + (clientFilter === c.id ? " selected" : "") + ">" +
          (c.client_type === "distributeur" ? "📦 " : "🔧 ") + esc(c.company_name || c.email) + "</option>";
      }).join("") + "</select>";
    host.querySelectorAll("[data-tf]").forEach(function (b) {
      b.addEventListener("click", function () {
        typeFilter = b.dataset.tf;
        var c = clients.find(function (x) { return x.id === clientFilter; });
        if (typeFilter && c && (c.client_type === "distributeur" ? "distributeur" : "direct") !== typeFilter) clientFilter = "";
        renderClientFilter(); renderCatFilter(); renderInterventions();
      });
    });
    host.querySelector("#cf-client").addEventListener("change", function () {
      clientFilter = this.value;
      renderInterventions();
    });
  }
  function renderCatFilter() {
    var host = document.getElementById("cat-filter");
    if (!host) return;
    var counts = {};
    interventions.forEach(function (r) { counts[r.category || "autre"] = (counts[r.category || "autre"] || 0) + 1; });
    var chips = [["", "Toutes (" + interventions.length + ")"]];
    Object.keys(CATS).forEach(function (k) {
      if (counts[k]) chips.push([k, CATS[k] + " (" + counts[k] + ")"]);
    });
    host.innerHTML = chips.map(function (c) {
      var active = catFilter === c[0];
      return '<button type="button" data-cat="' + c[0] + '" style="padding:7px 14px;border-radius:999px;font-family:\'IBM Plex Mono\',monospace;font-size:11.5px;cursor:pointer;white-space:nowrap;' +
        (active
          ? "border:1px solid transparent;background:linear-gradient(135deg,#2f7bff,#1c5bd6);color:#fff;"
          : "border:1px solid rgba(120,150,200,.28);background:transparent;color:#9fb6d8;") + '">' +
        esc(c[1]) + "</button>";
    }).join("");
    host.querySelectorAll("[data-cat]").forEach(function (b) {
      b.addEventListener("click", function () {
        catFilter = b.dataset.cat;
        renderCatFilter(); renderInterventions();
      });
    });
  }

  // Une intervention passée et réalisée part automatiquement aux archives
  function isDoneIvA(r) {
    return r.status === "terminee" && r.date && r.date < isoToday();
  }
  function ivArchivedA(r) { return r.archived || isDoneIvA(r); }
  function renderInterventions() {
    var host = document.getElementById("ai-list");
    var rows = interventions
      .filter(function (r) { return showArchivedIv ? ivArchivedA(r) : !ivArchivedA(r); })
      .filter(function (r) { return !catFilter || (r.category || "autre") === catFilter; })
      .filter(function (r) { return !typeFilter || typeOfPartner(r.partner_id) === typeFilter; })
      .filter(function (r) { return !clientFilter || r.partner_id === clientFilter; })
      .slice()
      .sort(function (a, b) { return ((b.date || "") + (b.time_slot || "")) < ((a.date || "") + (a.time_slot || "")) ? -1 : 1; });
    var archivedCount = interventions.filter(ivArchivedA).length;
    var toggle = archivedCount
      ? '<div style="padding:12px 24px;"><button type="button" id="ai-toggle-archived" style="padding:9px 14px;border-radius:999px;border:1px dashed rgba(120,150,200,.3);background:transparent;color:#8b98ae;font-weight:700;font-size:12.5px;cursor:pointer;font-family:\'Archivo\',sans-serif;">' +
        (showArchivedIv ? "← Retour aux interventions" : "🗄️ Voir les archives (" + archivedCount + ")") + "</button></div>"
      : "";
    if (!rows.length) {
      var filtered = catFilter || typeFilter || clientFilter;
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">' +
        (showArchivedIv ? "Aucune intervention archivée" + (filtered ? " avec ces filtres" : "") + "." :
         filtered ? "Aucune intervention avec ces filtres." : "Aucune intervention.") + "</p>" + toggle;
      bindAiToggle(host);
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
      var wk = r.date ? mondayIsoOf(r.date) : "";
      if (wk && wk !== lastWeek) {
        html += '<div style="padding:6px 24px 0;font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#5f6d84;">· ' + esc(weekLabelOf(wk)) + "</div>";
        lastWeek = wk;
      }
      var endClient = r.cta_end_clients && r.cta_end_clients.company_name;
      html += '<div class="list-row" data-iv-row="' + r.id + '" style="border-top:none;">' +
        '<div style="min-width:120px;font-family:\'IBM Plex Mono\',monospace;font-size:13px;color:#c9d4e6;">' + esc(fmtDate(r.date)) + (r.time_slot ? " · " + esc(r.time_slot) : "") + "</div>" +
        '<div style="flex:1;min-width:220px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-weight:800;font-size:14.5px;">' + esc(r.type) + '</span>' + catChip(r.category) + ' <span style="font-weight:600;font-size:13.5px;color:#7fadff;">· ' + esc(clientName(r.partner_id)) + (endClient ? " → 🚗 " + esc(endClient) : "") + "</span></div>" +
        '<div style="margin-top:3px;font-size:13px;color:#93a0b5;">' + esc(r.equipment || "") + (r.location ? " · " + esc(r.location) : "") + (r.notes ? " · " + esc(r.notes) : "") + "</div></div>" +
        '<span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;">' +
        '<input class="input iv-amount" type="number" step="0.01" min="0" value="' + (r.amount_ht == null ? "" : r.amount_ht) + '" placeholder="Presta €" title="Prix de la prestation HT" style="width:86px;padding:8px 10px;font-size:13px;text-align:right;">' +
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:9.5px;letter-spacing:.08em;color:#5f6d84;text-transform:uppercase;">Forfait</span></span>' +
        '<span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;">' +
        '<input class="input iv-travel" type="number" step="0.01" min="0" value="' + (r.travel_ht == null ? "" : r.travel_ht) + '" placeholder="Km €" title="Indemnités kilométriques HT" style="width:76px;padding:8px 10px;font-size:13px;text-align:right;border-color:rgba(56,212,122,.3);">' +
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:9.5px;letter-spacing:.08em;color:#38d47a;text-transform:uppercase;">Indemnité km</span></span>' +
        statusSelect(r.status, ["planifiee", "en_cours", "terminee", "annulee"], "iv-status") +
        (isDoneIvA(r) && !r.archived
          ? '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:10.5px;color:#5f6d84;" title="Réalisée : archivée automatiquement">auto</span>'
          : '<button type="button" data-iv-arch="' + r.id + '" title="' + (r.archived ? "Désarchiver" : "Archiver") + '" style="padding:7px 12px;border-radius:999px;border:1px solid rgba(120,150,200,.25);background:transparent;color:#8b98ae;font-weight:700;font-size:12px;cursor:pointer;font-family:\'Archivo\',sans-serif;">' +
            (r.archived ? "Désarchiver" : "🗄️") + "</button>") +
        '<button ' + DANGER_BTN + ' data-iv-del="' + r.id + '">✕</button>' +
        "</div>";
    });
    host.innerHTML = html + toggle;
    bindAiToggle(host);
    host.querySelectorAll("[data-iv-arch]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = interventions.find(function (x) { return x.id === b.dataset.ivArch; });
        if (!r) return;
        api("cta_interventions?id=eq." + r.id, { method: "PATCH", body: { archived: !r.archived } })
          .then(function () {
            r.archived = !r.archived;
            renderInterventions();
          }).catch(function () { showError("Archivage impossible."); });
      });
    });
    host.querySelectorAll(".iv-amount").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var id = inp.closest("[data-iv-row]").dataset.ivRow;
        var val = inp.value === "" ? null : Number(inp.value);
        api("cta_interventions?id=eq." + id, { method: "PATCH", body: { amount_ht: val } })
          .then(function () {
            interventions.find(function (x) { return x.id === id; }).amount_ht = val;
            renderCA();
          }).catch(function () { showError("Montant non enregistré."); });
      });
    });
    host.querySelectorAll(".iv-travel").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var id = inp.closest("[data-iv-row]").dataset.ivRow;
        var val = inp.value === "" ? null : Number(inp.value);
        api("cta_interventions?id=eq." + id, { method: "PATCH", body: { travel_ht: val } })
          .then(function () {
            interventions.find(function (x) { return x.id === id; }).travel_ht = val;
            renderCA();
          }).catch(function () { showError("Indemnités non enregistrées."); });
      });
    });
    host.querySelectorAll(".iv-status").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var id = sel.closest("[data-iv-row]").dataset.ivRow;
        api("cta_interventions?id=eq." + id, { method: "PATCH", body: { status: sel.value } })
          .then(function () {
            interventions.find(function (x) { return x.id === id; }).status = sel.value;
            refreshStats(); renderToday(); renderWeek(); renderCA();
          }).catch(function () { showError("Mise à jour impossible."); });
      });
    });
    host.querySelectorAll("[data-iv-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Supprimer cette intervention ?")) return;
        api("cta_interventions?id=eq." + b.dataset.ivDel, { method: "DELETE" })
          .then(function () {
            interventions = interventions.filter(function (x) { return x.id !== b.dataset.ivDel; });
            refreshStats(); renderToday(); renderWeek(); renderCA(); renderInterventions();
          }).catch(function () { showError("Suppression impossible."); });
      });
    });
  }
  /* ---------- Frais de déplacement ---------- */
  var billing = null;
  function loadBilling() {
    return api("cta_billing_settings?select=*").then(function (rows) {
      billing = (rows && rows[0]) || null;
      if (billing) {
        document.getElementById("bs-address").value = billing.base_address || "";
        document.getElementById("bs-included").value = billing.included_km == null ? 70 : billing.included_km;
        document.getElementById("bs-price").value = billing.price_per_km == null ? 0.12 : billing.price_per_km;
      }
    }).catch(function () { /* non bloquant */ });
  }
  loadBilling();
  function geocodeAddr(q) {
    return fetch("https://api-adresse.data.gouv.fr/search/?q=" + encodeURIComponent(q) + "&limit=1")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var f = j.features && j.features[0];
        return f ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] } : null;
      })
      .catch(function () { return null; });
  }
  function haversineKm(lat1, lng1, lat2, lng2) {
    var rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad;
    var dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  // Estimation routière : vol d'oiseau x 1,3 puis aller-retour
  function travelFeeFor(address) {
    if (!billing || billing.base_lat == null || !address) return Promise.resolve(null);
    return geocodeAddr(address).then(function (pt) {
      if (!pt) return null;
      var roundTrip = Math.round(haversineKm(billing.base_lat, billing.base_lng, pt.lat, pt.lng) * 1.3 * 2);
      var extraKm = Math.max(0, roundTrip - (billing.included_km || 70));
      var fee = Math.round(extraKm * Number(billing.price_per_km || 0.12) * 100) / 100;
      return { km: roundTrip, extraKm: extraKm, fee: fee };
    });
  }
  ctaOn("bs-form", "submit", function (ev) {
    ev.preventDefault();
    var msg = document.getElementById("bs-msg");
    var addr = document.getElementById("bs-address").value.trim();
    var included = document.getElementById("bs-included").value;
    var price = document.getElementById("bs-price").value;
    if (!addr) return;
    msg.hidden = false;
    msg.style.color = "#7fadff";
    msg.textContent = "Localisation de l'adresse…";
    geocodeAddr(addr).then(function (pt) {
      var body = {
        base_address: addr,
        included_km: included === "" ? 70 : Number(included),
        price_per_km: price === "" ? 0.12 : Number(price)
      };
      if (pt) { body.base_lat = pt.lat; body.base_lng = pt.lng; }
      return api("cta_billing_settings?id=eq.1", { method: "PATCH", body: body }).then(function () {
        billing = Object.assign(billing || { id: 1 }, body);
        msg.textContent = pt
          ? "Enregistré ✓ Point de départ localisé (" + pt.lat.toFixed(4) + ", " + pt.lng.toFixed(4) + ")."
          : "Enregistré ✓ mais l'adresse n'a pas pu être localisée : les distances gardent l'ancien point de départ.";
        if (!pt) msg.style.color = "#ffbe50";
      });
    }).catch(function () {
      msg.style.color = "#ff8c8c";
      msg.textContent = "Enregistrement impossible, réessayez.";
    });
  });

  // Type sélectionné : le prix préconfiguré de la grille s'applique automatiquement
  // (prix distributeur ou tarif public selon le client choisi) + frais de
  // déplacement estimés selon le lieu ; modifiable ensuite.
  var lastTravel = null;
  function basePresetPrice() {
    var cat = document.getElementById("iv-type").value;
    if (!cat || cat === "__autre") return null;
    var distrib = typeOfPartner(document.getElementById("iv-client").value) === "distributeur";
    var prices = grid
      .filter(function (g) { return g.category === cat && (distrib ? g.partner_price_ht : g.public_price_ht) != null; })
      .map(function (g) { return Number(distrib ? g.partner_price_ht : g.public_price_ht); });
    return prices.length ? Math.min.apply(null, prices) : null;
  }
  function applyPresetPrice() {
    // Prestation seule : les indemnités kilométriques ont leur propre champ
    var amount = document.getElementById("iv-amount");
    if (amount.value === "" || amount.dataset.auto === "1") {
      var base = basePresetPrice();
      if (base != null) {
        amount.value = base;
        amount.dataset.auto = "1";
      }
    }
    applyKmPreset();
  }
  function applyKmPreset() {
    var km = document.getElementById("iv-km");
    if (km.value !== "" && km.dataset.auto !== "1") return;
    if (lastTravel && lastTravel.fee > 0) {
      km.value = lastTravel.fee;
      km.dataset.auto = "1";
    } else if (km.dataset.auto === "1") {
      km.value = "";
    }
  }
  var travelSeq = 0;
  function updateTravelHint() {
    var hint = document.getElementById("iv-travel");
    var loc = document.getElementById("iv-loc").value.trim();
    lastTravel = null;
    if (!loc || !billing) { hint.hidden = true; applyPresetPrice(); return; }
    var seq = ++travelSeq;
    hint.hidden = false;
    hint.textContent = "🚗 Déplacement : calcul en cours…";
    travelFeeFor(loc).then(function (t) {
      if (seq !== travelSeq) return;
      lastTravel = t;
      if (!t) {
        hint.textContent = "🚗 Déplacement : adresse non localisée (frais à ajouter à la main si besoin).";
      } else if (t.fee <= 0) {
        hint.textContent = "🚗 Déplacement : inclus (" + t.km + " km A/R estimés).";
      } else {
        hint.textContent = "🚗 Déplacement : + " + t.fee.toLocaleString("fr-FR") + " € HT (" + t.km +
          " km A/R estimés · " + (billing.included_km || 70) + " km inclus puis " +
          Number(billing.price_per_km || 0.12).toLocaleString("fr-FR") + " €/km), reporté dans « Indemnités km ».";
      }
      applyKmPreset();
    });
  }
  var ivLocTimer = null;
  ctaOn("iv-loc", "input", function () {
    clearTimeout(ivLocTimer);
    ivLocTimer = setTimeout(updateTravelHint, 700);
  });
  ctaOn("iv-amount", "input", function () { this.dataset.auto = "0"; });
  ctaOn("iv-km", "input", function () { this.dataset.auto = "0"; });
  // Type / matériel : « Autre… » fait apparaître un champ libre
  ctaOn("iv-type", "change", function () {
    document.getElementById("iv-type-autre").hidden = this.value !== "__autre";
    applyPresetPrice();
  });
  ctaOn("iv-equip", "change", function () {
    document.getElementById("iv-equip-autre").hidden = this.value !== "__autre";
  });
  // Client sélectionné : options de client final (fiches du distributeur) + lieu pré-rempli
  function updateEndClientOptions() {
    var partnerId = document.getElementById("iv-client").value;
    var sel = document.getElementById("iv-endclient");
    var ecs = endClients.filter(function (e) { return e.distributor_id === partnerId; });
    sel.hidden = !ecs.length;
    sel.innerHTML = '<option value="">Client final (optionnel)</option>' +
      ecs.map(function (e) { return '<option value="' + e.id + '">🚗 ' + esc(e.company_name) + "</option>"; }).join("");
  }
  ctaOn("iv-client", "change", function () {
    updateEndClientOptions();
    applyPresetPrice();
    var c = clients.find(function (x) { return x.id === document.getElementById("iv-client").value; });
    var loc = document.getElementById("iv-loc");
    if (c && c.address && (!loc.value.trim() || loc.dataset.auto === "1")) {
      loc.value = c.address;
      loc.dataset.auto = "1";
    }
    updateTravelHint();
  });
  ctaOn("iv-endclient", "change", function () {
    var e = endClients.find(function (x) { return x.id === document.getElementById("iv-endclient").value; });
    var loc = document.getElementById("iv-loc");
    if (e && e.address && (!loc.value.trim() || loc.dataset.auto === "1")) {
      loc.value = e.address;
      loc.dataset.auto = "1";
    }
    updateTravelHint();
  });
  ctaOn("iv-loc", "input", function () { this.dataset.auto = "0"; });

  function bindAiToggle(host) {
    var t = host.querySelector("#ai-toggle-archived");
    if (t) t.addEventListener("click", function () {
      showArchivedIv = !showArchivedIv;
      renderInterventions();
    });
  }

  ctaOn("interv-form", "submit", function (ev) {
    ev.preventDefault();
    var typeSel = document.getElementById("iv-type");
    var catVal = typeSel.value;
    var typeVal;
    if (catVal === "__autre") {
      typeVal = document.getElementById("iv-type-autre").value.trim();
      catVal = "autre";
    } else {
      typeVal = catVal ? typeSel.options[typeSel.selectedIndex].text : "";
    }
    var equipVal = document.getElementById("iv-equip").value;
    if (equipVal === "__autre") equipVal = document.getElementById("iv-equip-autre").value.trim();
    var body = {
      partner_id: document.getElementById("iv-client").value,
      end_client_id: document.getElementById("iv-endclient").value || null,
      date: document.getElementById("iv-date").value,
      time_slot: document.getElementById("iv-slot").value || null,
      type: typeVal,
      category: catVal || "autre",
      equipment: equipVal || null,
      location: document.getElementById("iv-loc").value.trim() || null,
      notes: document.getElementById("iv-notes").value.trim() || null,
      amount_ht: document.getElementById("iv-amount").value === "" ? null : Number(document.getElementById("iv-amount").value),
      travel_ht: document.getElementById("iv-km").value === "" ? null : Number(document.getElementById("iv-km").value)
    };
    if (!body.partner_id || !body.date || !body.type) return;
    var createdId = null;
    api("cta_interventions", { method: "POST", body: body, prefer: "return=representation" })
      .then(function (rows) {
        createdId = rows && rows[0] ? rows[0].id : null;
        ev.target.reset();
        return api("cta_interventions?select=*,cta_end_clients(company_name)&order=date.desc");
      })
      .then(function (rows) {
        interventions = rows;
        document.getElementById("iv-type-autre").hidden = true;
        document.getElementById("iv-equip-autre").hidden = true;
        var loc = document.getElementById("iv-loc"); loc.dataset.auto = "0";
        updateEndClientOptions();
        if (pendingRequestId) {
          var reqId = pendingRequestId;
          pendingRequestId = null;
          // La demande suit désormais l'intervention planifiée (statut synchronisé)
          api("cta_intervention_requests?id=eq." + reqId, { method: "PATCH", body: { status: "acceptee", intervention_id: createdId } })
            .then(function () {
              var req = iReqs.find(function (x) { return x.id === reqId; });
              if (req) req.status = "acceptee";
              renderIReqs(); refreshStats();
            }).catch(function () { /* la demande restera à traiter */ });
        }
        refreshStats(); renderToday(); renderWeek(); renderCA(); renderInterventions(); renderClientFilter(); renderCatFilter(); renderEndClientsAdmin();
      })
      .catch(function () { showError("Création impossible."); });
  });

  /* ---------- Demandes d'intervention des distributeurs ---------- */
  // Prix distributeur de la grille pour une catégorie (le plus bas si plusieurs lignes)
  function distribPriceFor(cat) {
    var prices = grid
      .filter(function (g) { return g.category === cat && g.partner_price_ht != null; })
      .map(function (g) { return Number(g.partner_price_ht); });
    return prices.length ? { min: Math.min.apply(null, prices), several: prices.length > 1 } : null;
  }
  function renderIReqs() {
    var panel = document.getElementById("ireq-panel");
    var pending = iReqs.filter(function (r) { return r.status === "nouvelle"; });
    panel.hidden = !pending.length;
    if (!pending.length) return;
    document.getElementById("ireq-list").innerHTML = pending.map(function (r) {
      return '<div class="list-row" style="align-items:flex-start;">' +
        catChip(r.category) +
        '<div style="flex:1;min-width:220px;">' +
        '<div style="font-weight:800;font-size:14px;">' + esc(clientName(r.partner_id)) +
        (r.cta_end_clients ? ' <span style="font-weight:600;color:#7fadff;">→ 🚗 ' + esc(r.cta_end_clients.company_name) + "</span>" : "") + "</div>" +
        '<div style="margin-top:3px;font-size:12.5px;color:#93a0b5;">' +
        [r.desired_date ? "📅 Souhaité : " + fmtDate(r.desired_date) + (r.desired_slot ? " à " + r.desired_slot : "") : "",
         r.equipment ? "🧰 " + r.equipment : "",
         r.location ? "📍 " + r.location : ""].filter(Boolean).map(esc).join(" · ") + "</div>" +
        (r.message ? '<div style="margin-top:3px;font-size:12.5px;color:#8b98ae;">💬 ' + esc(r.message) + "</div>" : "") +
        (function () {
          var p = distribPriceFor(r.category);
          return p
            ? '<div style="margin-top:3px;font-size:12.5px;color:#38d47a;">💶 À facturer au distributeur : ' + (p.several ? "à partir de " : "") + esc(eur(p.min)) + " HT (grille)</div>"
            : "";
        })() +
        '<div style="margin-top:3px;font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#5f6d84;">Reçue le ' + esc(fmtDateTime(r.created_at)) + "</div></div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button class="btn-primary" data-ireq-plan="' + r.id + '" style="padding:8px 16px;border-radius:999px;border:none;background:linear-gradient(135deg,#2f7bff,#1c5bd6);color:#fff;font-weight:800;font-size:12px;cursor:pointer;">Planifier →</button>' +
        '<button ' + DANGER_BTN + ' data-ireq-refuse="' + r.id + '">Refuser</button>' +
        "</div></div>";
    }).join("");
    document.getElementById("ireq-list").querySelectorAll("[data-ireq-plan]").forEach(function (b) {
      b.addEventListener("click", function () { planFromRequest(b.dataset.ireqPlan); });
    });
    document.getElementById("ireq-list").querySelectorAll("[data-ireq-refuse]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Refuser cette demande d'intervention ? Le distributeur verra le refus dans son espace.")) return;
        api("cta_intervention_requests?id=eq." + b.dataset.ireqRefuse, { method: "PATCH", body: { status: "refusee" } })
          .then(function () {
            iReqs.find(function (x) { return x.id === b.dataset.ireqRefuse; }).status = "refusee";
            renderIReqs(); refreshStats();
          }).catch(function () { showError("Refus impossible."); });
      });
    });
  }
  function planFromRequest(id) {
    var r = iReqs.find(function (x) { return x.id === id; });
    if (!r) return;
    pendingRequestId = id;
    document.getElementById("iv-client").value = r.partner_id;
    updateEndClientOptions();
    document.getElementById("iv-endclient").value = r.end_client_id || "";
    document.getElementById("iv-date").value = r.desired_date || "";
    document.getElementById("iv-slot").value = r.desired_slot || "";
    var typeSel = document.getElementById("iv-type");
    if (r.category && r.category !== "autre" && CATS[r.category]) {
      typeSel.value = r.category;
      document.getElementById("iv-type-autre").hidden = true;
    } else {
      typeSel.value = "__autre";
      document.getElementById("iv-type-autre").hidden = false;
      document.getElementById("iv-type-autre").value = "";
    }
    var equipSel = document.getElementById("iv-equip");
    if (r.equipment) {
      equipSel.value = "__autre";
      document.getElementById("iv-equip-autre").hidden = false;
      document.getElementById("iv-equip-autre").value = r.equipment;
    } else {
      equipSel.value = "";
      document.getElementById("iv-equip-autre").hidden = true;
    }
    var fiche = r.end_client_id ? endClients.find(function (e) { return e.id === r.end_client_id; }) : null;
    var partner = clients.find(function (c) { return c.id === r.partner_id; });
    var ficheAddr = fiche ? [fiche.address, [fiche.postal_code, fiche.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
    var loc = document.getElementById("iv-loc");
    loc.value = r.location || ficheAddr || (partner && partner.address) || "";
    loc.dataset.auto = "0";
    document.getElementById("iv-notes").value = r.message || "";
    var p = distribPriceFor(r.category);
    if (p && document.getElementById("iv-amount").value === "") {
      document.getElementById("iv-amount").value = p.min;
      document.getElementById("iv-amount").dataset.auto = "1";
    }
    updateTravelHint();
    showTab("interventions");
    document.getElementById("interv-form").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---------- Fiches clients finaux (créées par les distributeurs) ---------- */
  var openHistory = null;
  function renderEndClientsAdmin() {
    var host = document.getElementById("ec-admin-list");
    if (!host) return;
    if (!endClients.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucune fiche pour le moment : elles apparaîtront ici dès qu\'un distributeur créera un client final depuis son espace.</p>';
      return;
    }
    // Rangées par distributeur (ordre alphabétique), fiches triées par nom
    var byDistrib = {};
    endClients.forEach(function (e) { (byDistrib[e.distributor_id] = byDistrib[e.distributor_id] || []).push(e); });
    var sorted = [];
    Object.keys(byDistrib)
      .sort(function (a, b) { return clientName(a).localeCompare(clientName(b), "fr"); })
      .forEach(function (did) {
        sorted.push({ header: did, count: byDistrib[did].length });
        byDistrib[did]
          .sort(function (a, b) { return String(a.company_name).localeCompare(String(b.company_name), "fr"); })
          .forEach(function (e) { sorted.push(e); });
      });
    host.innerHTML = sorted.map(function (e) {
      if (e.header) {
        return '<div style="padding:14px 24px 4px;font-family:\'IBM Plex Mono\',monospace;font-size:12px;letter-spacing:.14em;color:#38d47a;text-transform:uppercase;border-top:1px solid rgba(120,150,200,.08);">📦 ' +
          esc(clientName(e.header)) + " (" + e.count + ")</div>";
      }
      return endClientRow(e);
    }).join("");
    bindEndClientHistory(host);
  }
  function endClientRow(e) {
      var history = interventions.filter(function (i) { return i.end_client_id === e.id; });
      var isOpen = openHistory === e.id;
      return '<div class="list-row" style="align-items:flex-start;flex-direction:column;gap:8px;border-top:none;">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%;">' +
        '<span style="font-weight:800;font-size:14.5px;">🚗 ' + esc(e.company_name) + "</span>" +
        '<span style="flex:1;"></span>' +
        '<button ' + GHOST_BTN + ' data-ec-history="' + e.id + '">' + (isOpen ? "Masquer l\'historique" : "Historique (" + history.length + ")") + "</button>" +
        "</div>" +
        '<div style="font-size:12.5px;color:#93a0b5;">' +
        [e.contact_name ? "👤 " + e.contact_name : "", e.phone ? "📞 " + e.phone : "", e.email ? "✉️ " + e.email : "",
         [e.address, [e.postal_code, e.city].filter(Boolean).join(" ")].filter(Boolean).length ? "📍 " + [e.address, [e.postal_code, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : ""].filter(Boolean).map(esc).join(" · ") +
        (e.notes ? ' · 📝 ' + esc(e.notes) : "") + "</div>" +
        (isOpen
          ? '<div style="width:100%;padding:10px 14px;border-radius:12px;background:rgba(10,13,19,.6);border:1px solid rgba(120,150,200,.15);">' +
            (history.length
              ? history.map(function (i) {
                  return '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:6px 0;font-size:12.5px;color:#c9d4e6;">' +
                    '<span style="font-family:\'IBM Plex Mono\',monospace;color:#8b98ae;min-width:96px;">' + esc(fmtDate(i.date)) + (i.time_slot ? " " + esc(i.time_slot) : "") + "</span>" +
                    catChip(i.category) + '<span style="flex:1;">' + esc(i.type) + (i.equipment ? " · " + esc(i.equipment) : "") + "</span>" + badge(i.status) + "</div>";
                }).join("")
              : '<span style="font-size:12.5px;color:#5f6d84;">Aucune intervention enregistrée chez ce client.</span>') +
            "</div>"
          : "") +
        "</div>";
  }
  function bindEndClientHistory(host) {
    host.querySelectorAll("[data-ec-history]").forEach(function (b) {
      b.addEventListener("click", function () {
        openHistory = openHistory === b.dataset.ecHistory ? null : b.dataset.ecHistory;
        renderEndClientsAdmin();
      });
    });
  }

  /* ---------- Grille tarifaire ---------- */
  function renderGrid() {
    var host = document.getElementById("ag-list");
    if (!grid.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Grille vide.</p>';
      return;
    }
    host.innerHTML = grid.map(function (r) {
      return '<div class="list-row ag-row" data-grid-row="' + r.id + '" style="display:grid;grid-template-columns:2fr 1fr 1fr auto auto;gap:10px;align-items:center;">' +
        '<input class="input" data-f="label" value="' + esc(r.label) + '" style="padding:10px 12px;font-size:13.5px;">' +
        '<input class="input" data-f="public_price_ht" type="number" step="0.01" min="0" value="' + (r.public_price_ht == null ? "" : r.public_price_ht) + '" placeholder="Public" style="padding:10px 12px;font-size:13.5px;text-align:right;">' +
        '<input class="input" data-f="partner_price_ht" type="number" step="0.01" min="0" value="' + (r.partner_price_ht == null ? "" : r.partner_price_ht) + '" placeholder="Distributeur" style="padding:10px 12px;font-size:13.5px;text-align:right;">' +
        '<button ' + GHOST_BTN + ' data-grid-save="' + r.id + '">Enregistrer</button>' +
        '<button ' + DANGER_BTN + ' data-grid-del="' + r.id + '">✕</button>' +
        "</div>";
    }).join("");
    host.querySelectorAll("[data-grid-save]").forEach(function (b) {
      b.addEventListener("click", function () {
        var row = host.querySelector('[data-grid-row="' + b.dataset.gridSave + '"]');
        var body = {};
        row.querySelectorAll("[data-f]").forEach(function (inp) {
          body[inp.dataset.f] = inp.type === "number" ? (inp.value === "" ? null : Number(inp.value)) : inp.value.trim();
        });
        api("cta_price_grid?id=eq." + b.dataset.gridSave, { method: "PATCH", body: body })
          .then(function () { Object.assign(grid.find(function (x) { return x.id === b.dataset.gridSave; }), body); })
          .catch(function () { showError("Enregistrement impossible."); });
      });
    });
    host.querySelectorAll("[data-grid-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Supprimer cette ligne de la grille ?")) return;
        api("cta_price_grid?id=eq." + b.dataset.gridDel, { method: "DELETE" })
          .then(function () {
            grid = grid.filter(function (x) { return x.id !== b.dataset.gridDel; });
            renderGrid();
          }).catch(function () { showError("Suppression impossible."); });
      });
    });
  }
  ctaOn("grid-add", "submit", function (ev) {
    ev.preventDefault();
    var pub = document.getElementById("g-public").value;
    var part = document.getElementById("g-partner").value;
    var body = {
      sort: grid.length ? Math.max.apply(null, grid.map(function (g) { return g.sort || 0; })) + 1 : 1,
      label: document.getElementById("g-label").value.trim(),
      public_price_ht: pub === "" ? null : Number(pub),
      partner_price_ht: part === "" ? null : Number(part)
    };
    if (!body.label) return;
    api("cta_price_grid", { method: "POST", body: body })
      .then(function () {
        ev.target.reset();
        return api("cta_price_grid?select=*&order=sort.asc");
      })
      .then(function (rows) { grid = rows; renderGrid(); })
      .catch(function () { showError("Ajout impossible."); });
  });

  /* ---------- Matériel (inventaire, prêts et locations) ---------- */
  var EQ_STATUS = {
    disponible: ["Disponible", "badge-green"],
    prete: ["En prêt", "badge-amber"],
    louee: ["En location", "badge-blue"],
    en_intervention: ["En intervention", "badge-amber"],
    indisponible: ["Indisponible", "badge-grey"]
  };
  // Gamme d'un équipement : retrouvée depuis le catalogue (sinon « Autre matériel »)
  function gammeOf(name) {
    var n = String(name || "").toLowerCase();
    var p = products.find(function (x) {
      var short = x.name.split(" - ")[0].toLowerCase();
      return n === short || n.indexOf(short) === 0 || short.indexOf(n) === 0;
    });
    return p ? p.category : "Autre matériel";
  }
  var eqOpenCats = {};
  function eqRow(e) {
      var st = EQ_STATUS[e.status] || [e.status, "badge-grey"];
      var holderOpts = '<option value="">Chez CTA / personne</option>' +
        clients.filter(function (c) { return c.role !== "admin"; }).map(function (c) {
          return '<option value="' + c.id + '"' + (e.holder_partner_id === c.id ? " selected" : "") + ">" + esc(c.company_name || c.email) + "</option>";
        }).join("");
      return '<div class="list-row" data-eq-row="' + e.id + '" style="align-items:center;">' +
        '<div style="min-width:170px;">' +
        '<div style="font-weight:800;font-size:14.5px;">' + esc(e.name) + "</div>" +
        '<div style="margin-top:3px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
        '<span class="badge ' + st[1] + '">' + esc(st[0]) + "</span>" +
        (e.ref ? '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:11.5px;color:#5f6d84;">' + esc(e.ref) + "</span>" : "") +
        (e.since ? '<span style="font-size:11.5px;color:#5f6d84;">depuis le ' + esc(fmtDate(e.since)) + "</span>" : "") +
        "</div></div>" +
        '<select class="input" data-f="status" style="padding:9px 12px;width:auto;font-size:13px;">' +
        Object.keys(EQ_STATUS).map(function (k) {
          return '<option value="' + k + '"' + (e.status === k ? " selected" : "") + ">" + EQ_STATUS[k][0] + "</option>";
        }).join("") + "</select>" +
        '<select class="input" data-f="holder_partner_id" style="padding:9px 12px;width:auto;max-width:180px;font-size:13px;">' + holderOpts + "</select>" +
        '<input class="input" data-f="holder_note" value="' + esc(e.holder_note || "") + '" placeholder="Ou : autre détenteur / précision" style="flex:1;min-width:140px;padding:9px 12px;font-size:13px;">' +
        '<input class="input" data-f="notes" value="' + esc(e.notes || "") + '" placeholder="Notes" style="flex:1;min-width:120px;padding:9px 12px;font-size:13px;">' +
        '<div style="display:flex;gap:8px;">' +
        '<button ' + GHOST_BTN + ' data-eq-save="' + e.id + '">Enregistrer</button>' +
        '<button ' + DANGER_BTN + ' data-eq-del="' + e.id + '">✕</button>' +
        "</div></div>";
  }
  function renderEquipment() {
    var host = document.getElementById("eq-list");
    if (!equipment.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucun matériel enregistré. Ajoutez vos valises, bancs et stations ci-dessus pour suivre leurs prêts et locations.</p>';
      return;
    }
    // Regroupé par gamme, chaque gamme se déroule / se replie
    var byCat = {};
    var order = [];
    equipment.forEach(function (e) {
      var cat = gammeOf(e.name);
      if (!byCat[cat]) { byCat[cat] = []; order.push(cat); }
      byCat[cat].push(e);
    });
    order.sort(function (a, b) { return a === "Autre matériel" ? 1 : b === "Autre matériel" ? -1 : a.localeCompare(b, "fr"); });
    // Par défaut : toutes les gammes repliées, un clic les déroule
    host.innerHTML = order.map(function (cat) {
      var open = !!eqOpenCats[cat];
      var out = byCat[cat].filter(function (e) { return e.status === "prete" || e.status === "louee"; }).length;
      return '<button type="button" data-eq-toggle="' + esc(cat) + '" style="display:flex;align-items:center;gap:10px;width:100%;padding:13px 24px;border:none;border-top:1px solid rgba(120,150,200,.08);background:transparent;cursor:pointer;font-family:\'IBM Plex Mono\',monospace;font-size:11.5px;letter-spacing:.14em;color:#7fadff;text-transform:uppercase;text-align:left;">' +
        "<span>" + (open ? "▾" : "▸") + "</span><span>" + esc(cat) + "</span>" +
        '<span style="color:#5f6d84;text-transform:none;letter-spacing:0;">(' + byCat[cat].length + (out ? " · " + out + " sorti" + (out > 1 ? "s" : "") : "") + ")</span></button>" +
        (open ? byCat[cat].map(eqRow).join("") : "");
    }).join("");
    host.querySelectorAll("[data-eq-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        eqOpenCats[b.dataset.eqToggle] = !eqOpenCats[b.dataset.eqToggle];
        renderEquipment();
      });
    });
    host.querySelectorAll("[data-eq-save]").forEach(function (b) {
      b.addEventListener("click", function () {
        var row = host.querySelector('[data-eq-row="' + b.dataset.eqSave + '"]');
        var e = equipment.find(function (x) { return x.id === b.dataset.eqSave; });
        var body = {};
        row.querySelectorAll("[data-f]").forEach(function (inp) { body[inp.dataset.f] = inp.value || null; });
        var out = body.status !== "disponible" && body.status !== "indisponible";
        body.since = out ? (e.since && e.status === body.status ? e.since : isoToday()) : null;
        if (!out) { body.holder_partner_id = null; body.holder_note = null; }
        api("cta_equipment?id=eq." + b.dataset.eqSave, { method: "PATCH", body: body })
          .then(function () {
            Object.assign(e, body);
            renderEquipment(); renderIntervFormOptions();
      renderIReqs(); renderCatFilter(); renderEndClientsAdmin();
          }).catch(function () { showError("Enregistrement impossible."); });
      });
    });
    host.querySelectorAll("[data-eq-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Supprimer ce matériel de l'inventaire ?")) return;
        api("cta_equipment?id=eq." + b.dataset.eqDel, { method: "DELETE" })
          .then(function () {
            equipment = equipment.filter(function (x) { return x.id !== b.dataset.eqDel; });
            renderEquipment(); renderIntervFormOptions();
      renderIReqs(); renderCatFilter(); renderEndClientsAdmin();
          }).catch(function () { showError("Suppression impossible."); });
      });
    });
  }
  ctaOn("eq-form", "submit", function (ev) {
    ev.preventDefault();
    var body = {
      name: document.getElementById("eq-name").value.trim(),
      ref: document.getElementById("eq-ref").value.trim() || null,
      notes: document.getElementById("eq-notes").value.trim() || null
    };
    if (!body.name) return;
    api("cta_equipment", { method: "POST", body: body })
      .then(function () {
        ev.target.reset();
        return api("cta_equipment?select=*&order=name.asc");
      })
      .then(function (rows) { equipment = rows; renderEquipment(); renderIntervFormOptions(); })
      .catch(function () { showError("Ajout impossible."); });
  });

  /* ---------- Catalogue valises (tarif 2026) ---------- */
  function adminCostOf(p) {
    var c = p.cta_product_admin_costs;
    if (Array.isArray(c)) c = c[0];
    return c ? c.admin_price_ht : null;
  }
  var adminOpenCats = {};
  function renderProductsAdmin() {
    var host = document.getElementById("prodadmin-list");
    if (!host) return;
    if (!products.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Catalogue vide.</p>';
      return;
    }
    var byCat = {};
    var order = [];
    products.forEach(function (p) {
      if (!byCat[p.category]) { byCat[p.category] = []; order.push(p.category); }
      byCat[p.category].push(p);
    });
    // Toutes les gammes repliées par défaut : un clic les déroule
    host.innerHTML = order.map(function (cat) {
      var open = !!adminOpenCats[cat];
      return '<button type="button" data-padm-toggle="' + esc(cat) + '" style="display:flex;align-items:center;gap:10px;width:100%;padding:13px 24px;border:none;border-top:1px solid rgba(120,150,200,.08);background:transparent;cursor:pointer;font-family:\'IBM Plex Mono\',monospace;font-size:11.5px;letter-spacing:.14em;color:#7fadff;text-transform:uppercase;text-align:left;">' +
        "<span>" + (open ? "▾" : "▸") + "</span><span>" + esc(cat) + "</span>" +
        '<span style="color:#5f6d84;text-transform:none;letter-spacing:0;">(' + byCat[cat].length + ")</span></button>" +
        (open ? byCat[cat].map(function (p) {
          var cost = adminCostOf(p);
          return '<div class="list-row prodadmin-row" data-prod-row="' + p.id + '" style="display:grid;grid-template-columns:1fr 120px 120px 120px;gap:10px;align-items:center;border-top:none;">' +
            '<span style="font-size:13px;font-weight:600;color:#dfe6f2;">' + esc(p.name) +
            (p.reference ? ' <span style="font-family:\'IBM Plex Mono\',monospace;font-size:10.5px;color:#5f6d84;">· ' + esc(p.reference) + "</span>" : "") + "</span>" +
            '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:13px;color:#8b98ae;">' + esc(eur(p.public_price_ht)) + "</span>" +
            '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:13px;color:#38d47a;">' + esc(eur(p.distrib_price_ht)) + "</span>" +
            '<input class="input prod-cost" type="number" step="0.01" min="0" value="' + (cost == null ? "" : cost) + '" placeholder="€ HT" title="Mon prix net (visible de moi seul)" style="padding:8px 10px;font-size:13px;text-align:right;">' +
            "</div>";
        }).join("") : "");
    }).join("");
    host.querySelectorAll("[data-padm-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        adminOpenCats[b.dataset.padmToggle] = !adminOpenCats[b.dataset.padmToggle];
        renderProductsAdmin();
      });
    });
    host.querySelectorAll(".prod-cost").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var id = inp.closest("[data-prod-row]").dataset.prodRow;
        var val = inp.value === "" ? null : Number(inp.value);
        api("cta_product_admin_costs?product_id=eq." + id, { method: "PATCH", body: { admin_price_ht: val } })
          .then(function () {
            var p = products.find(function (x) { return x.id === id; });
            if (p) p.cta_product_admin_costs = { admin_price_ht: val };
          }).catch(function () { showError("Prix non enregistré."); });
      });
    });
  }

  /* ---------- Demandes de prêt / location de matériel ---------- */
  var EQR_STATUS = {
    nouvelle: ["Nouvelle", "badge-blue"], acceptee: ["Acceptée", "badge-green"],
    refusee: ["Refusée", "badge-grey"], terminee: ["Terminée", "badge-grey"]
  };
  var eqrTypeFilter = "";
  var eqrOpenCats = {};
  function renderEqReqsAdmin() {
    var panel = document.getElementById("eqr-panel");
    if (!panel) return;
    // Visibles : demandes à traiter / en cours, plus les locations pas encore facturées
    var base = eqReqs.filter(function (r) {
      return r.status === "nouvelle" || r.status === "acceptee" ||
        (r.kind === "location" && r.price_ht != null && !r.invoiced && r.status !== "refusee");
    });
    panel.hidden = !base.length;
    if (!base.length) return;
    // Filtre par type de demandeur (client direct / distributeur)
    var countBy = function (t) { return base.filter(function (r) { return typeOfPartner(r.partner_id) === t; }).length; };
    var chips = [["", "👥 Tous (" + base.length + ")"], ["direct", "🔧 Clients directs (" + countBy("direct") + ")"], ["distributeur", "📦 Distributeurs (" + countBy("distributeur") + ")"]];
    document.getElementById("eqr-filter").innerHTML = chips.map(function (c) {
      var active = eqrTypeFilter === c[0];
      return '<button type="button" data-eqrf="' + c[0] + '" style="padding:6px 13px;border-radius:999px;font-family:\'IBM Plex Mono\',monospace;font-size:11px;cursor:pointer;white-space:nowrap;' +
        (active
          ? "border:1px solid transparent;background:linear-gradient(135deg,#2f7bff,#1c5bd6);color:#fff;"
          : "border:1px solid rgba(120,150,200,.28);background:transparent;color:#9fb6d8;") + '">' + esc(c[1]) + "</button>";
    }).join("");
    document.getElementById("eqr-filter").querySelectorAll("[data-eqrf]").forEach(function (b) {
      b.addEventListener("click", function () {
        eqrTypeFilter = b.dataset.eqrf;
        renderEqReqsAdmin();
      });
    });
    var visible = base.filter(function (r) { return !eqrTypeFilter || typeOfPartner(r.partner_id) === eqrTypeFilter; });
    // Regroupées par gamme d'appareil, chaque groupe se déroule / se replie
    var byCat = {};
    var order = [];
    visible.forEach(function (r) {
      var cat = gammeOf(r.product_name);
      if (!byCat[cat]) { byCat[cat] = []; order.push(cat); }
      byCat[cat].push(r);
    });
    // Tous les groupes repliés par défaut : un clic les déroule
    document.getElementById("eqr-admin-list").innerHTML = (!visible.length
      ? '<p style="margin:0;padding:18px 24px;color:#5f6d84;font-size:13.5px;">Aucune demande avec ce filtre.</p>'
      : order.map(function (cat) {
          var open = eqrOpenCats[cat] === true;
          return '<button type="button" data-eqr-toggle="' + esc(cat) + '" style="display:flex;align-items:center;gap:10px;width:100%;padding:12px 24px;border:none;border-top:1px solid rgba(120,150,200,.08);background:transparent;cursor:pointer;font-family:\'IBM Plex Mono\',monospace;font-size:11.5px;letter-spacing:.14em;color:#ffbe50;text-transform:uppercase;text-align:left;">' +
            "<span>" + (open ? "▾" : "▸") + "</span><span>" + esc(cat) + "</span>" +
            '<span style="color:#5f6d84;text-transform:none;letter-spacing:0;">(' + byCat[cat].length + ")</span></button>" +
            (open ? byCat[cat].map(eqrAdminRow).join("") : "");
        }).join(""));
    document.getElementById("eqr-admin-list").querySelectorAll("[data-eqr-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        eqrOpenCats[b.dataset.eqrToggle] = eqrOpenCats[b.dataset.eqrToggle] !== true;
        renderEqReqsAdmin();
      });
    });
    bindEqrActions();
  }
  function eqrAdminRow(r) {
      var st = EQR_STATUS[r.status] || [r.status, "badge-grey"];
      var endClient = r.cta_end_clients && r.cta_end_clients.company_name;
      // Où se trouve le matériel + contact sur place (fiche du client final,
      // sinon coordonnées du compte demandeur)
      var whereSrc = r.cta_end_clients || clients.find(function (c) { return c.id === r.partner_id; }) || {};
      var whereAddr = [whereSrc.address, [whereSrc.postal_code, whereSrc.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      // Résumé clair du lieu : nom du garage, adresse, interlocuteur désigné
      var whereName = whereSrc.company_name || (endClient ? null : clientName(r.partner_id));
      var contactLine = [whereSrc.contact_name ? "👤 " + whereSrc.contact_name : "", whereSrc.phone ? "📞 " + whereSrc.phone : ""].filter(Boolean);
      var whereLine = (whereName || whereAddr || contactLine.length)
        ? '<div style="margin-top:6px;padding:8px 12px;border-radius:10px;background:rgba(47,123,255,.07);border:1px solid rgba(77,141,255,.18);font-size:12.5px;color:#c3cddd;line-height:1.7;">' +
          (whereName ? '<div>🏢 <strong style="color:#dfe6f2;">' + esc(whereName) + "</strong></div>" : "") +
          (whereAddr ? "<div>📍 " + esc(whereAddr) + "</div>" : "") +
          (contactLine.length ? "<div>" + contactLine.map(esc).join(" · ") + "</div>" : "") +
          "</div>"
        : "";
      var billing = "";
      if (r.kind === "location" && r.price_ht != null) {
        billing = '<div style="margin-top:4px;font-size:12.5px;">💶 <strong style="color:#dfe6f2;">' +
          Number(r.price_ht).toLocaleString("fr-FR") + " € HT</strong> · " +
          (r.invoiced
            ? '<span style="color:#38d47a;">Facturée ✓</span>'
            : '<span style="color:#ffbe50;">En attente de facturation</span>') + "</div>";
      }
      return '<div class="list-row" style="align-items:flex-start;">' +
        '<span class="badge ' + (r.kind === "location" ? "badge-amber" : "badge-blue") + '">' + (r.kind === "location" ? "💶 Location" : "🤝 Prêt") + "</span>" +
        '<div style="flex:1;min-width:220px;">' +
        '<div style="font-weight:800;font-size:14px;">' + esc(r.product_name) + ' <span style="font-weight:600;color:#7fadff;">· ' + esc(clientName(r.partner_id)) +
        (endClient ? " → 🚗 " + esc(endClient) : "") + "</span></div>" +
        whereLine +
        '<div style="margin-top:3px;font-size:12.5px;color:#93a0b5;">' +
        [r.duration ? "⏱️ " + r.duration : "", r.start_date ? "📅 à partir du " + fmtDate(r.start_date) : ""].filter(Boolean).map(esc).join(" · ") + "</div>" +
        billing +
        (r.message ? '<div style="margin-top:3px;font-size:12.5px;color:#8b98ae;">💬 ' + esc(r.message) + "</div>" : "") +
        '<div style="margin-top:3px;font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#5f6d84;">Reçue le ' + esc(fmtDateTime(r.created_at)) + "</div></div>" +
        '<span class="badge ' + st[1] + '">' + st[0] + "</span>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        (r.status === "nouvelle"
          ? '<button class="btn-primary" data-eqr-accept="' + r.id + '" style="padding:8px 16px;border-radius:999px;border:none;background:linear-gradient(135deg,#2f7bff,#1c5bd6);color:#fff;font-weight:800;font-size:12px;cursor:pointer;">✓ Accepter</button>' +
            '<button ' + DANGER_BTN + ' data-eqr-refuse="' + r.id + '">Refuser</button>'
          : '<button ' + GHOST_BTN + ' data-eqr-done="' + r.id + '">Matériel rendu ✓</button>') +
        (r.kind === "location" && r.price_ht != null && r.status !== "nouvelle"
          ? '<button ' + GHOST_BTN + ' data-eqr-bill="' + r.id + '">' + (r.invoiced ? "↺ Repasser en attente" : "💶 Marquer facturée") + "</button>"
          : "") +
        "</div></div>";
  }
  function bindEqrActions() {
    function setEqrStatus(id, status, extra) {
      api("cta_equipment_requests?id=eq." + id, { method: "PATCH", body: { status: status } })
        .then(function () {
          eqReqs.find(function (x) { return x.id === id; }).status = status;
          renderEqReqsAdmin();
          refreshStats();
          if (extra) extra();
        }).catch(function () { showError("Mise à jour impossible."); });
    }
    var list = document.getElementById("eqr-admin-list");
    list.querySelectorAll("[data-eqr-accept]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = eqReqs.find(function (x) { return x.id === b.dataset.eqrAccept; });
        setEqrStatus(b.dataset.eqrAccept, "acceptee", function () {
          // Bascule le matériel correspondant de l'inventaire en prêt / location
          var eq = equipment.find(function (e) {
            return e.status === "disponible" && e.name.toLowerCase().indexOf(r.product_name.toLowerCase().split(" ")[0]) !== -1;
          });
          if (eq && window.confirm("Passer « " + eq.name + " » en " + (r.kind === "location" ? "location" : "prêt") + " chez " + clientName(r.partner_id) + " dans l'inventaire ?")) {
            api("cta_equipment?id=eq." + eq.id, {
              method: "PATCH",
              body: { status: r.kind === "location" ? "louee" : "prete", holder_partner_id: r.partner_id, since: isoToday() }
            }).then(function () {
              Object.assign(eq, { status: r.kind === "location" ? "louee" : "prete", holder_partner_id: r.partner_id, since: isoToday() });
              renderEquipment(); renderIntervFormOptions();
            }).catch(function () { showError("Inventaire non mis à jour."); });
          }
        });
      });
    });
    list.querySelectorAll("[data-eqr-refuse]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Refuser cette demande ? Le client verra le refus dans son espace.")) return;
        setEqrStatus(b.dataset.eqrRefuse, "refusee");
      });
    });
    list.querySelectorAll("[data-eqr-done]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = eqReqs.find(function (x) { return x.id === b.dataset.eqrDone; });
        setEqrStatus(b.dataset.eqrDone, "terminee", function () {
          // Matériel rendu : la valise repasse automatiquement en disponible
          if (!r) return;
          var eq = equipment.find(function (e) {
            return (e.status === "prete" || e.status === "louee") &&
              e.holder_partner_id === r.partner_id &&
              e.name.toLowerCase().indexOf(r.product_name.toLowerCase().split(" ")[0]) !== -1;
          });
          if (!eq) return;
          api("cta_equipment?id=eq." + eq.id, {
            method: "PATCH",
            body: { status: "disponible", holder_partner_id: null, since: null }
          }).then(function () {
            Object.assign(eq, { status: "disponible", holder_partner_id: null, since: null });
            renderEquipment(); renderIntervFormOptions();
          }).catch(function () { showError("Inventaire non mis à jour (repassez la valise en disponible à la main)."); });
        });
      });
    });
    list.querySelectorAll("[data-eqr-bill]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = eqReqs.find(function (x) { return x.id === b.dataset.eqrBill; });
        if (!r) return;
        api("cta_equipment_requests?id=eq." + r.id, { method: "PATCH", body: { invoiced: !r.invoiced } })
          .then(function () { r.invoiced = !r.invoiced; renderEqReqsAdmin(); })
          .catch(function () { showError("Mise à jour de la facturation impossible."); });
      });
    });
  }

  /* ---------- Guides du bot de mise en service à distance ---------- */
  var editingGuide = null;
  function renderSetupGuides() {
    var host = document.getElementById("sg-list");
    if (!host) return;
    if (!setupGuides.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucun guide : créez le premier ci-dessus (une étape par ligne).</p>';
      return;
    }
    host.innerHTML = setupGuides.map(function (g) {
      var steps = String(g.steps).split("\n").filter(function (s) { return s.trim(); });
      return '<div class="list-row" style="align-items:flex-start;flex-direction:column;gap:8px;">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%;">' +
        '<span style="font-weight:800;font-size:14.5px;">🛰️ ' + esc(g.device) + "</span>" +
        '<span class="badge ' + (g.enabled ? "badge-green" : "badge-grey") + '">' + (g.enabled ? "Actif" : "En pause") + "</span>" +
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#5f6d84;">' + steps.length + " étapes</span>" +
        '<span style="flex:1;"></span>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button ' + GHOST_BTN + ' data-sg-edit="' + g.id + '">Modifier</button>' +
        '<button ' + GHOST_BTN + ' data-sg-toggle="' + g.id + '">' + (g.enabled ? "Mettre en pause" : "Réactiver") + "</button>" +
        '<button ' + DANGER_BTN + ' data-sg-del="' + g.id + '">✕</button>' +
        "</div></div>" +
        '<div style="font-size:12.5px;color:#93a0b5;line-height:1.6;">' +
        steps.slice(0, 3).map(function (s, i) { return (i + 1) + ". " + esc(s.trim()); }).join("<br>") +
        (steps.length > 3 ? "<br>…" : "") + "</div>" +
        "</div>";
    }).join("");
    host.querySelectorAll("[data-sg-edit]").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = setupGuides.find(function (x) { return x.id === b.dataset.sgEdit; });
        if (!g) return;
        editingGuide = g.id;
        document.getElementById("sg-mode").textContent = "Modification : " + g.device;
        document.getElementById("sg-device").value = g.device;
        document.getElementById("sg-steps").value = g.steps;
        document.getElementById("sg-cancel").hidden = false;
        document.getElementById("sg-form").scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    host.querySelectorAll("[data-sg-toggle]").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = setupGuides.find(function (x) { return x.id === b.dataset.sgToggle; });
        if (!g) return;
        api("cta_setup_guides?id=eq." + g.id, { method: "PATCH", body: { enabled: !g.enabled } })
          .then(function () { g.enabled = !g.enabled; renderSetupGuides(); })
          .catch(function () { showError("Mise à jour impossible."); });
      });
    });
    host.querySelectorAll("[data-sg-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Supprimer ce guide de mise en service ?")) return;
        api("cta_setup_guides?id=eq." + b.dataset.sgDel, { method: "DELETE" })
          .then(function () {
            setupGuides = setupGuides.filter(function (x) { return x.id !== b.dataset.sgDel; });
            renderSetupGuides();
          }).catch(function () { showError("Suppression impossible."); });
      });
    });
  }
  function resetSgForm() {
    editingGuide = null;
    document.getElementById("sg-form").reset();
    document.getElementById("sg-mode").textContent = "Nouveau guide";
    document.getElementById("sg-cancel").hidden = true;
  }
  ctaOn("sg-cancel", "click", resetSgForm);
  ctaOn("sg-form", "submit", function (ev) {
    ev.preventDefault();
    var body = {
      device: document.getElementById("sg-device").value.trim(),
      steps: document.getElementById("sg-steps").value.trim()
    };
    if (!body.device || !body.steps) return;
    var req = editingGuide
      ? api("cta_setup_guides?id=eq." + editingGuide, { method: "PATCH", body: body })
      : api("cta_setup_guides", { method: "POST", body: body });
    req.then(function () {
      resetSgForm();
      return api("cta_setup_guides?select=*&order=created_at.asc");
    })
      .then(function (rows) { setupGuides = rows; renderSetupGuides(); })
      .catch(function () { showError("Enregistrement du guide impossible."); });
  });

  /* ---------- Calendrier mensuel (au format Inter Colis Services) ---------- */
  var calMonth = null; // Date du 1er jour du mois affiché
  var calSelectedDay = null;
  function renderCalendar() {
    var gridHost = document.getElementById("cal-grid");
    if (!gridHost) return;
    if (!calMonth) {
      var n = new Date();
      calMonth = new Date(n.getFullYear(), n.getMonth(), 1);
    }
    var label = calMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    document.getElementById("cal-label").textContent = label.charAt(0).toUpperCase() + label.slice(1);
    var today = isoToday();
    var first = new Date(calMonth);
    var startOffset = (first.getDay() + 6) % 7; // lundi = 0
    var daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
    var cells = "";
    for (var b = 0; b < startOffset; b++) cells += "<span></span>";
    for (var d = 1; d <= daysInMonth; d++) {
      var dayIso = calMonth.getFullYear() + "-" + String(calMonth.getMonth() + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      var ivs = interventions.filter(function (r) { return r.date === dayIso && r.status !== "annulee"; });
      var blocked = blockedDates.some(function (x) { return x.day === dayIso; });
      var isToday = dayIso === today;
      var selected = calSelectedDay === dayIso;
      cells += '<button type="button" data-cal-day="' + dayIso + '" style="min-height:56px;padding:6px 4px;border-radius:10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;font-family:\'Archivo\',sans-serif;' +
        (selected
          ? "border:1px solid #4d8dff;background:rgba(47,123,255,.22);"
          : blocked
            ? "border:1px solid rgba(255,110,110,.35);background:rgba(255,110,110,.08);"
            : "border:1px solid rgba(120,150,200,.12);background:rgba(13,17,25,.6);") + '">' +
        '<span style="font-size:13px;font-weight:' + (isToday ? "900;color:#4d8dff" : "600;color:#c9d4e6") + ';">' + d + "</span>" +
        (ivs.length
          ? '<span style="display:flex;gap:2px;flex-wrap:wrap;justify-content:center;">' +
            ivs.slice(0, 4).map(function () { return '<span style="width:6px;height:6px;border-radius:50%;background:#4d8dff;"></span>'; }).join("") +
            (ivs.length > 4 ? '<span style="font-size:9px;color:#7fadff;">+' + (ivs.length - 4) + "</span>" : "") + "</span>"
          : (blocked ? '<span style="font-size:10px;">🚫</span>' : "")) +
        "</button>";
    }
    gridHost.innerHTML = cells;
    gridHost.querySelectorAll("[data-cal-day]").forEach(function (b) {
      b.addEventListener("click", function () {
        calSelectedDay = calSelectedDay === b.dataset.calDay ? null : b.dataset.calDay;
        renderCalendar();
      });
    });
    renderCalDayDetail();
  }
  function renderCalDayDetail() {
    var host = document.getElementById("cal-day-detail");
    if (!host) return;
    host.hidden = !calSelectedDay;
    if (!calSelectedDay) return;
    var day = calSelectedDay;
    var ivs = interventions
      .filter(function (r) { return r.date === day && r.status !== "annulee"; })
      .sort(function (a, b) { return (a.time_slot || "99") < (b.time_slot || "99") ? -1 : 1; });
    var blocked = blockedDates.find(function (x) { return x.day === day; });
    host.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px;">' +
      '<span style="font-weight:800;font-size:14.5px;text-transform:capitalize;">' + esc(longDate(day)) + "</span>" +
      (blocked
        ? '<button type="button" id="cal-unblock" ' + GHOST_BTN + ">Débloquer ce jour</button>"
        : '<button type="button" id="cal-block" ' + DANGER_BTN + ">🚫 Bloquer ce jour</button>") +
      "</div>" +
      (blocked && blocked.reason ? '<div style="margin-bottom:8px;font-size:12.5px;color:#ff8c8c;">Motif : ' + esc(blocked.reason) + "</div>" : "") +
      (ivs.length
        ? ivs.map(function (r) {
            var c = clients.find(function (x) { return x.id === r.partner_id; }) || {};
            return '<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;padding:7px 0;font-size:13px;border-top:1px solid rgba(120,150,200,.08);">' +
              '<span style="font-family:\'IBM Plex Mono\',monospace;font-weight:700;color:#7fadff;min-width:48px;">' + esc(r.time_slot || "Journée") + "</span>" +
              '<span style="font-weight:700;color:#dfe6f2;">' + esc(r.type) + "</span>" +
              '<span style="color:#93a0b5;">· ' + esc(c.company_name || "?") + "</span>" + badge(r.status) + "</div>";
          }).join("")
        : '<p style="margin:0;font-size:13px;color:#5f6d84;">Aucune intervention ce jour' + (blocked ? "" : " : la journée est libre") + ".</p>");
    var blockBtn = host.querySelector("#cal-block");
    if (blockBtn) blockBtn.addEventListener("click", function () {
      var reason = window.prompt("Motif du blocage (optionnel : congés, salon, tournée…) :") || null;
      api("blocked_dates", { method: "POST", body: { day: day, reason: reason } })
        .then(function () {
          blockedDates.push({ day: day, reason: reason });
          blockedDates.sort(function (a, b) { return a.day < b.day ? -1 : 1; });
          renderBlocked(); renderCalendar();
        }).catch(function () { showError("Blocage impossible (jour déjà bloqué ?)."); });
    });
    var unblockBtn = host.querySelector("#cal-unblock");
    if (unblockBtn) unblockBtn.addEventListener("click", function () {
      api("blocked_dates?day=eq." + day, { method: "DELETE" })
        .then(function () {
          blockedDates = blockedDates.filter(function (x) { return x.day !== day; });
          renderBlocked(); renderCalendar();
        }).catch(function () { showError("Déblocage impossible."); });
    });
  }
  ctaOn("cal-prev", "click", function () {
    if (!calMonth) return;
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
    calSelectedDay = null;
    renderCalendar();
  });
  ctaOn("cal-next", "click", function () {
    if (!calMonth) return;
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
    calSelectedDay = null;
    renderCalendar();
  });

  /* ---------- Synchronisation agenda (flux iCalendar) ---------- */
  function setupCalendarSync() {
    api("cta_calendar_tokens?select=token&partner_id=is.null&limit=1")
      .then(function (rows) {
        if (rows.length) return rows[0].token;
        var t = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
        if (!t) throw new Error("uuid");
        return api("cta_calendar_tokens", {
          method: "POST",
          body: { token: t, partner_id: null, label: "Agenda du gérant" },
          prefer: "return=representation"
        }).then(function (r) { return r[0].token; });
      })
      .then(function (token) {
        var url = API + "/functions/v1/calendar?t=" + token;
        var input = document.getElementById("cal-url");
        input.value = url;
        document.getElementById("cal-webcal").href = url.replace(/^https:/, "webcal:");
        ctaOn("cal-copy", "click", function () {
          var btn = this;
          function done() { btn.textContent = "Copié ✓"; setTimeout(function () { btn.textContent = "Copier le lien"; }, 2000); }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done);
          } else {
            input.select();
            document.execCommand("copy");
            done();
          }
        });
      })
      .catch(function () {
        document.getElementById("cal-url").value = "Lien indisponible : rechargez la page.";
      });
  }
  setupCalendarSync();

  // Export ponctuel .ics (généré depuis les données chargées)
  ctaOn("cal-ics", "click", function () {
    function icsEsc(s) {
      return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    }
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CTA//Agenda//FR", "X-WR-CALNAME:CTA · Interventions"];
    interventions.forEach(function (iv) {
      if (!iv.date) return;
      var partner = clients.find(function (c) { return c.id === iv.partner_id; });
      var start = iv.date.replace(/-/g, "");
      lines.push("BEGIN:VEVENT", "UID:" + iv.id + "@cta-auto");
      if (iv.time_slot && /^\d{2}:\d{2}/.test(iv.time_slot)) {
        var hm = iv.time_slot.slice(0, 5).replace(":", "");
        lines.push("DTSTART:" + start + "T" + hm + "00");
      } else {
        lines.push("DTSTART;VALUE=DATE:" + start);
      }
      lines.push("SUMMARY:" + icsEsc(iv.type + (partner && partner.company_name ? " · " + partner.company_name : "")));
      var loc = iv.location || (partner && partner.address) || "";
      if (loc) lines.push("LOCATION:" + icsEsc(loc));
      lines.push("END:VEVENT");
    });
    blockedDates.forEach(function (b) {
      lines.push("BEGIN:VEVENT", "UID:blocked-" + b.day + "@cta-auto",
        "DTSTART;VALUE=DATE:" + b.day.replace(/-/g, ""),
        "SUMMARY:" + icsEsc("Indisponible" + (b.reason ? " · " + b.reason : "")), "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    var blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cta-agenda.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  /* ---------- Agenda (jours bloqués) ---------- */
  function renderBlocked() {
    var host = document.getElementById("ab-list");
    if (!blockedDates.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucun jour bloqué : tous les jours ouvrés sont proposés à la réservation.</p>';
      return;
    }
    host.innerHTML = blockedDates.map(function (r) {
      return '<div class="list-row">' +
        '<div style="min-width:150px;font-family:\'IBM Plex Mono\',monospace;font-size:13.5px;color:#c9d4e6;">' + esc(fmtDate(r.day)) + "</div>" +
        '<div style="flex:1;font-size:13.5px;color:#93a0b5;">' + esc(r.reason || "") + "</div>" +
        '<button ' + DANGER_BTN + ' data-blocked-del="' + r.day + '">Débloquer</button>' +
        "</div>";
    }).join("");
    host.querySelectorAll("[data-blocked-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        api("blocked_dates?day=eq." + b.dataset.blockedDel, { method: "DELETE" })
          .then(function () {
            blockedDates = blockedDates.filter(function (x) { return x.day !== b.dataset.blockedDel; });
            renderBlocked();
          }).catch(function () { showError("Suppression impossible."); });
      });
    });
  }
  ctaOn("blocked-add", "submit", function (ev) {
    ev.preventDefault();
    var day = document.getElementById("b-day").value;
    if (!day) return;
    var endEl = document.getElementById("b-day-end");
    var end = (endEl && endEl.value) || day;
    if (end < day) { showError("La date de fin doit être après la date de début."); return; }
    var reason = document.getElementById("b-reason").value.trim() || null;
    // Blocage d'une plage entière (jour unique, plusieurs jours ou semaines)
    var rows = [];
    var d = new Date(day + "T12:00:00");
    var stop = new Date(end + "T12:00:00");
    var guard = 0;
    while (d <= stop && guard < 366) {
      var iso = d.toISOString().slice(0, 10);
      if (!blockedDates.some(function (b) { return b.day === iso; })) rows.push({ day: iso, reason: reason });
      d.setDate(d.getDate() + 1);
      guard++;
    }
    if (!rows.length) { showError("Ces jours sont déjà bloqués."); return; }
    api("blocked_dates", { method: "POST", body: rows })
      .then(function () {
        ev.target.reset();
        return api("blocked_dates?select=*&order=day.asc");
      })
      .then(function (rows2) { blockedDates = rows2; renderBlocked(); renderCalendar(); })
      .catch(function () { showError("Ajout impossible (jour déjà bloqué ?)."); });
  });
})();
