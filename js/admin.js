/* Back-office CTA · réservé au compte administrateur.
   Toutes les données passent par l'API REST du backend (RLS : policies admin)
   et par la fonction Edge admin-users pour la gestion des comptes. */
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
  var tabs = document.querySelectorAll(".tab");
  tabs.forEach(function (t) {
    if (!t.dataset.tab) return; // lien (messagerie dédiée)
    t.addEventListener("click", function () {
      tabs.forEach(function (x) { x.classList.toggle("active", x === t); });
      ["demandes", "clients", "interventions", "grille", "materiel", "agenda"].forEach(function (name) {
        document.getElementById("tab-" + name).hidden = name !== t.dataset.tab;
      });
    });
  });
  function showTab(name) {
    tabs.forEach(function (x) { x.classList.toggle("active", x.dataset.tab === name); });
    ["demandes", "clients", "interventions", "grille", "materiel", "agenda"].forEach(function (n) {
      document.getElementById("tab-" + n).hidden = n !== name;
    });
  }

  /* ---------- Données ---------- */
  var clients = [], quotes = [], interventions = [], grid = [], tickets = [], blockedDates = [], equipment = [], endClients = [], iReqs = [], products = [];
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
        (r.cta_end_clients ? '<div style="font-size:12.5px;color:#7fadff;">🏁 Client final : ' + esc(r.cta_end_clients.company_name) + "</div>" : "") +
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
            '<div style="font-weight:700;font-size:13.5px;">' + esc(r.type) + ' <span style="font-weight:600;color:#7fadff;">· ' + esc(c.company_name || "?") + (r.cta_end_clients ? " → 🏁 " + esc(r.cta_end_clients.company_name) : "") + "</span></div>" +
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
  function rescheduleIv(id) {
    var r = interventions.find(function (x) { return x.id === id; });
    if (!r) return;
    var nd = window.prompt("Nouvelle date du rendez-vous (AAAA-MM-JJ) :", r.date || "");
    if (nd === null) return;
    nd = nd.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nd)) { window.alert("Date invalide : utilisez le format AAAA-MM-JJ."); return; }
    var ns = window.prompt("Nouvelle heure (HH:MM, laisser vide pour « journée ») :", r.time_slot || "");
    if (ns === null) return;
    ns = ns.trim();
    if (ns && !/^\d{2}:\d{2}$/.test(ns)) { window.alert("Heure invalide : utilisez le format HH:MM."); return; }
    var oldDate = r.date;
    api("cta_interventions?id=eq." + id, { method: "PATCH", body: { date: nd, time_slot: ns || null } })
      .then(function () {
        r.date = nd;
        r.time_slot = ns || null;
        afterIvChange();
        if (window.confirm("Rendez-vous reporté au " + fmtDate(nd) + (ns ? " à " + ns : "") + " ✓\n\nPrévenir le client par e-mail ?")) {
          return fn("send-notice", { intervention_id: id, kind: "report", new_date: nd, new_slot: ns || null, old_date: oldDate })
            .then(function (res) { noticeResult(res, "Client prévenu du report ✓"); })
            .catch(function (e) { showError("E-mail de report impossible : " + e.message); });
        }
      })
      .catch(function () { showError("Report impossible."); });
  }
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
    var parts = String(loc).split(",");
    return parts[parts.length - 1].trim();
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
        '<span style="color:#c9d4e6;">' + esc(c.company_name || "?") + (r.cta_end_clients ? " 🏁 " + esc(r.cta_end_clients.company_name) : "") + "</span>" +
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
    var done = interventions.filter(function (r) { return r.status === "terminee" && r.amount_ht != null && r.date; });
    function sum(rows) {
      var t = 0;
      rows.forEach(function (r) { t += Number(r.amount_ht) || 0; });
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
    document.getElementById("stat-quotes").textContent =
      quotes.filter(function (q) { return q.status === "new"; }).length +
      iReqs.filter(function (r) { return r.status === "nouvelle"; }).length;
    document.getElementById("stat-tickets").textContent = tickets.filter(function (t) { return t.status === "ouvert" || t.status === "en_cours"; }).length;
    document.getElementById("stat-interv").textContent = interventions.filter(function (i) { return i.status === "planifiee" || i.status === "en_cours"; }).length;
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
      api("cta_intervention_requests?select=*,cta_end_clients(company_name,address)&order=created_at.desc"),
      api("cta_products?select=*,cta_product_admin_costs(admin_price_ht)&order=sort.asc")
    ]).then(function (res) {
      clients = res[0]; quotes = res[1]; interventions = res[2];
      grid = res[3]; tickets = res[4]; blockedDates = res[5];
      equipment = res[6]; endClients = res[7]; iReqs = res[8]; products = res[9];
      refreshStats(); renderToday(); renderWeek(); renderCA();
      renderQuotes(); renderClients(); renderClientSelects();
      renderInterventions(); renderGrid(); renderBlocked();
      renderEquipment(); renderIntervFormOptions(); renderProductsAdmin();
      renderIReqs(); renderClientFilter(); renderCatFilter(); renderEndClientsAdmin();
    }).catch(function () {
      showError("Chargement impossible : vérifiez votre connexion ou reconnectez-vous.");
    });
  }

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
       [q.address, q.postal_code].filter(Boolean).length ? "📍 " + [q.address, q.postal_code].filter(Boolean).join(", ") : ""
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
    document.getElementById("c-address").value = [q.address, q.postal_code].filter(Boolean).join(", ");
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

  /* ---------- Clients ---------- */
  function renderClients() {
    var host = document.getElementById("clients-list");
    if (!clients.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucun client.</p>';
      return;
    }
    host.innerHTML = clients.map(function (c) {
      var isAdmin = c.role === "admin";
      return '<div class="list-row" data-client-row="' + c.id + '" style="align-items:center;">' +
        '<div style="min-width:200px;">' +
        '<a href="mailto:' + esc(c.email || "") + '" style="font-weight:800;font-size:14.5px;">' + esc(c.email || "") + "</a>" +
        '<div style="margin-top:4px;display:flex;gap:6px;align-items:center;">' + typeBadge(c.client_type) +
        (isAdmin ? ' <span class="badge badge-amber">Admin</span>' : "") +
        (c.address ? ' <a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.address) + '" target="_blank" rel="noopener" title="Itinéraire" style="font-size:13px;">🗺️ Itinéraire</a>' : "") +
        "</div></div>" +
        '<input class="input" data-f="company_name" value="' + esc(c.company_name || "") + '" placeholder="Société" style="flex:1;min-width:140px;padding:10px 12px;font-size:13.5px;">' +
        '<input class="input" data-f="contact_name" value="' + esc(c.contact_name || "") + '" placeholder="Contact" style="width:130px;padding:10px 12px;font-size:13.5px;">' +
        '<input class="input" data-f="phone" value="' + esc(c.phone || "") + '" placeholder="Téléphone" style="width:130px;padding:10px 12px;font-size:13.5px;">' +
        '<input class="input" data-f="address" value="' + esc(c.address || "") + '" placeholder="Adresse postale" style="flex:1 1 100%;min-width:200px;padding:10px 12px;font-size:13.5px;">' +
        '<select class="input" data-f="client_type" style="padding:10px 12px;width:auto;font-size:13px;">' +
        '<option value="direct"' + (c.client_type === "direct" ? " selected" : "") + ">Direct</option>" +
        '<option value="distributeur"' + (c.client_type === "distributeur" ? " selected" : "") + ">Distributeur</option></select>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button ' + GHOST_BTN + ' data-client-save="' + c.id + '">Enregistrer</button>' +
        '<button ' + GHOST_BTN + ' data-client-pass="' + c.id + '">Mot de passe</button>' +
        (isAdmin ? "" : '<button ' + DANGER_BTN + ' data-client-del="' + c.id + '">Supprimer</button>') +
        "</div></div>";
    }).join("");
    host.querySelectorAll("[data-client-save]").forEach(function (b) {
      b.addEventListener("click", function () {
        var row = host.querySelector('[data-client-row="' + b.dataset.clientSave + '"]');
        var body = {};
        row.querySelectorAll("[data-f]").forEach(function (inp) { body[inp.dataset.f] = inp.value.trim() || null; });
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
  document.getElementById("new-client-btn").addEventListener("click", function () {
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

  function renderInterventions() {
    var host = document.getElementById("ai-list");
    var rows = interventions
      .filter(function (r) { return showArchivedIv ? r.archived : !r.archived; })
      .filter(function (r) { return !catFilter || (r.category || "autre") === catFilter; })
      .filter(function (r) { return !typeFilter || typeOfPartner(r.partner_id) === typeFilter; })
      .filter(function (r) { return !clientFilter || r.partner_id === clientFilter; })
      .slice()
      .sort(function (a, b) { return ((b.date || "") + (b.time_slot || "")) < ((a.date || "") + (a.time_slot || "")) ? -1 : 1; });
    var archivedCount = interventions.filter(function (r) { return r.archived; }).length;
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
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-weight:800;font-size:14.5px;">' + esc(r.type) + '</span>' + catChip(r.category) + ' <span style="font-weight:600;font-size:13.5px;color:#7fadff;">· ' + esc(clientName(r.partner_id)) + (endClient ? " → 🏁 " + esc(endClient) : "") + "</span></div>" +
        '<div style="margin-top:3px;font-size:13px;color:#93a0b5;">' + esc(r.equipment || "") + (r.location ? " · " + esc(r.location) : "") + (r.notes ? " · " + esc(r.notes) : "") + "</div></div>" +
        '<input class="input iv-amount" type="number" step="0.01" min="0" value="' + (r.amount_ht == null ? "" : r.amount_ht) + '" placeholder="€ HT" title="Montant HT facturable" style="width:96px;padding:8px 10px;font-size:13px;text-align:right;">' +
        statusSelect(r.status, ["planifiee", "en_cours", "terminee", "annulee"], "iv-status") +
        '<button type="button" data-iv-arch="' + r.id + '" title="' + (r.archived ? "Désarchiver" : "Archiver") + '" style="padding:7px 12px;border-radius:999px;border:1px solid rgba(120,150,200,.25);background:transparent;color:#8b98ae;font-weight:700;font-size:12px;cursor:pointer;font-family:\'Archivo\',sans-serif;">' +
        (r.archived ? "Désarchiver" : "🗄️") + "</button>" +
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
  // Type / matériel : « Autre… » fait apparaître un champ libre
  document.getElementById("iv-type").addEventListener("change", function () {
    document.getElementById("iv-type-autre").hidden = this.value !== "__autre";
  });
  document.getElementById("iv-equip").addEventListener("change", function () {
    document.getElementById("iv-equip-autre").hidden = this.value !== "__autre";
  });
  // Client sélectionné : options de client final (fiches du distributeur) + lieu pré-rempli
  function updateEndClientOptions() {
    var partnerId = document.getElementById("iv-client").value;
    var sel = document.getElementById("iv-endclient");
    var ecs = endClients.filter(function (e) { return e.distributor_id === partnerId; });
    sel.hidden = !ecs.length;
    sel.innerHTML = '<option value="">Client final (optionnel)</option>' +
      ecs.map(function (e) { return '<option value="' + e.id + '">🏁 ' + esc(e.company_name) + "</option>"; }).join("");
  }
  document.getElementById("iv-client").addEventListener("change", function () {
    updateEndClientOptions();
    var c = clients.find(function (x) { return x.id === document.getElementById("iv-client").value; });
    var loc = document.getElementById("iv-loc");
    if (c && c.address && (!loc.value.trim() || loc.dataset.auto === "1")) {
      loc.value = c.address;
      loc.dataset.auto = "1";
    }
  });
  document.getElementById("iv-endclient").addEventListener("change", function () {
    var e = endClients.find(function (x) { return x.id === document.getElementById("iv-endclient").value; });
    var loc = document.getElementById("iv-loc");
    if (e && e.address && (!loc.value.trim() || loc.dataset.auto === "1")) {
      loc.value = e.address;
      loc.dataset.auto = "1";
    }
  });
  document.getElementById("iv-loc").addEventListener("input", function () { this.dataset.auto = "0"; });

  function bindAiToggle(host) {
    var t = host.querySelector("#ai-toggle-archived");
    if (t) t.addEventListener("click", function () {
      showArchivedIv = !showArchivedIv;
      renderInterventions();
    });
  }

  document.getElementById("interv-form").addEventListener("submit", function (ev) {
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
      amount_ht: document.getElementById("iv-amount").value === "" ? null : Number(document.getElementById("iv-amount").value)
    };
    if (!body.partner_id || !body.date || !body.type) return;
    api("cta_interventions", { method: "POST", body: body })
      .then(function () {
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
          api("cta_intervention_requests?id=eq." + reqId, { method: "PATCH", body: { status: "acceptee" } })
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
        (r.cta_end_clients ? ' <span style="font-weight:600;color:#7fadff;">→ 🏁 ' + esc(r.cta_end_clients.company_name) + "</span>" : "") + "</div>" +
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
    var loc = document.getElementById("iv-loc");
    loc.value = r.location || (fiche && fiche.address) || (partner && partner.address) || "";
    loc.dataset.auto = "0";
    document.getElementById("iv-notes").value = r.message || "";
    var p = distribPriceFor(r.category);
    if (p && document.getElementById("iv-amount").value === "") {
      document.getElementById("iv-amount").value = p.min;
    }
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
    host.innerHTML = endClients.map(function (e) {
      var history = interventions.filter(function (i) { return i.end_client_id === e.id; });
      var isOpen = openHistory === e.id;
      return '<div class="list-row" style="align-items:flex-start;flex-direction:column;gap:8px;">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%;">' +
        '<span style="font-weight:800;font-size:14.5px;">🏁 ' + esc(e.company_name) + "</span>" +
        '<span class="badge badge-green">via ' + esc(clientName(e.distributor_id)) + "</span>" +
        '<span style="flex:1;"></span>' +
        '<button ' + GHOST_BTN + ' data-ec-history="' + e.id + '">' + (isOpen ? "Masquer l\'historique" : "Historique (" + history.length + ")") + "</button>" +
        "</div>" +
        '<div style="font-size:12.5px;color:#93a0b5;">' +
        [e.contact_name ? "👤 " + e.contact_name : "", e.phone ? "📞 " + e.phone : "", e.email ? "✉️ " + e.email : "", e.address ? "📍 " + e.address : ""].filter(Boolean).map(esc).join(" · ") +
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
    }).join("");
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
  document.getElementById("grid-add").addEventListener("submit", function (ev) {
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
    prete: ["Prêté", "badge-amber"],
    louee: ["Loué", "badge-blue"],
    en_intervention: ["En intervention", "badge-amber"],
    indisponible: ["Indisponible", "badge-grey"]
  };
  function renderEquipment() {
    var host = document.getElementById("eq-list");
    if (!equipment.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucun matériel enregistré. Ajoutez vos valises, bancs et stations ci-dessus pour suivre leurs prêts et locations.</p>';
      return;
    }
    host.innerHTML = equipment.map(function (e) {
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
    }).join("");
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
  document.getElementById("eq-form").addEventListener("submit", function (ev) {
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
  function renderProductsAdmin() {
    var host = document.getElementById("prodadmin-list");
    if (!host) return;
    if (!products.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Catalogue vide.</p>';
      return;
    }
    var html = "";
    var lastCat = "";
    products.forEach(function (p) {
      if (p.category !== lastCat) {
        html += '<div style="padding:14px 24px 4px;font-family:\'IBM Plex Mono\',monospace;font-size:11.5px;letter-spacing:.14em;color:#7fadff;text-transform:uppercase;border-top:1px solid rgba(120,150,200,.08);">' + esc(p.category) + "</div>";
        lastCat = p.category;
      }
      var cost = adminCostOf(p);
      html += '<div class="list-row prodadmin-row" data-prod-row="' + p.id + '" style="display:grid;grid-template-columns:1fr 120px 120px 120px;gap:10px;align-items:center;border-top:none;">' +
        '<span style="font-size:13px;font-weight:600;color:#dfe6f2;">' + esc(p.name) +
        (p.reference ? ' <span style="font-family:\'IBM Plex Mono\',monospace;font-size:10.5px;color:#5f6d84;">· ' + esc(p.reference) + "</span>" : "") + "</span>" +
        '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:13px;color:#8b98ae;">' + esc(eur(p.public_price_ht)) + "</span>" +
        '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:13px;color:#38d47a;">' + esc(eur(p.distrib_price_ht)) + "</span>" +
        '<input class="input prod-cost" type="number" step="0.01" min="0" value="' + (cost == null ? "" : cost) + '" placeholder="€ HT" title="Mon prix net (visible de moi seul)" style="padding:8px 10px;font-size:13px;text-align:right;">' +
        "</div>";
    });
    host.innerHTML = html;
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
        document.getElementById("cal-copy").addEventListener("click", function () {
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
  document.getElementById("cal-ics").addEventListener("click", function () {
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
  document.getElementById("blocked-add").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var day = document.getElementById("b-day").value;
    if (!day) return;
    api("blocked_dates", { method: "POST", body: { day: day, reason: document.getElementById("b-reason").value.trim() || null } })
      .then(function () {
        ev.target.reset();
        return api("blocked_dates?select=*&order=day.asc");
      })
      .then(function (rows) { blockedDates = rows; renderBlocked(); })
      .catch(function () { showError("Ajout impossible (jour déjà bloqué ?)."); });
  });
})();
