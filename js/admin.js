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
      return r.status === 204 ? null : r.json();
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
    t.addEventListener("click", function () {
      tabs.forEach(function (x) { x.classList.toggle("active", x === t); });
      ["demandes", "clients", "interventions", "documents", "grille", "tickets", "agenda"].forEach(function (name) {
        document.getElementById("tab-" + name).hidden = name !== t.dataset.tab;
      });
    });
  });

  /* ---------- Données ---------- */
  var clients = [], quotes = [], interventions = [], documents = [], grid = [], tickets = [], blockedDates = [];
  var currentTicket = null;

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
        (c.phone ? '<div style="font-size:13px;color:#9aa6ba;">📞 ' + esc(c.phone) + "</div>" : "") +
        (addr ? '<div style="font-size:13px;color:#9aa6ba;line-height:1.45;">📍 ' + esc(addr) + "</div>" : "") +
        (r.notes ? '<div style="font-size:12.5px;color:#5f6d84;">📝 ' + esc(r.notes) + "</div>" : "") + "</div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:auto;">' +
        (c.phone ? '<a href="tel:' + esc(c.phone.replace(/\s/g, "")) + '" class="btn-primary" style="padding:9px 16px;border-radius:999px;background:linear-gradient(135deg,#2f7bff,#1c5bd6);color:#fff;font-weight:800;font-size:12.5px;box-shadow:0 4px 14px rgba(47,123,255,.35);">📞 Appeler</a>' : "") +
        (addr ? '<a href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr) + '" target="_blank" rel="noopener" ' + GHOST_BTN.replace("cursor:pointer;", "") + ">🗺️ Itinéraire</a>" : "") +
        statusSelect(r.status, ["planifiee", "en_cours", "terminee", "annulee"], "today-status") +
        "</div></div>";
    }).join("");
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

  function refreshStats() {
    document.getElementById("stat-quotes").textContent = quotes.filter(function (q) { return q.status === "new"; }).length;
    document.getElementById("stat-tickets").textContent = tickets.filter(function (t) { return t.status === "ouvert" || t.status === "en_cours"; }).length;
    document.getElementById("stat-interv").textContent = interventions.filter(function (i) { return i.status === "planifiee" || i.status === "en_cours"; }).length;
    document.getElementById("stat-invoices").textContent = documents.filter(function (d) { return d.kind === "facture" && d.status === "a_regler"; }).length;
  }

  function loadAll() {
    Promise.all([
      api("cta_partners?select=*&order=created_at.asc"),
      api("quote_requests?select=*&order=created_at.desc"),
      api("cta_interventions?select=*&order=date.desc"),
      api("cta_documents?select=*&order=issued_on.desc"),
      api("cta_price_grid?select=*&order=sort.asc"),
      api("cta_tickets?select=*,cta_ticket_messages(*)&order=updated_at.desc"),
      api("blocked_dates?select=*&order=day.asc")
    ]).then(function (res) {
      clients = res[0]; quotes = res[1]; interventions = res[2];
      documents = res[3]; grid = res[4]; tickets = res[5]; blockedDates = res[6];
      if (!currentTicket && tickets.length) currentTicket = tickets[0].id;
      refreshStats(); renderToday();
      renderQuotes(); renderClients(); renderClientSelects();
      renderInterventions(); renderDocuments(); renderGrid();
      renderTicketList(); renderThread(); renderBlocked();
    }).catch(function () {
      showError("Chargement impossible : vérifiez votre connexion ou reconnectez-vous.");
    });
  }

  /* ---------- Demandes de devis ---------- */
  function renderQuotes() {
    var host = document.getElementById("quotes-list");
    if (!quotes.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucune demande pour le moment.</p>';
      return;
    }
    host.innerHTML = quotes.map(function (q) {
      var services = (q.services || []).map(function (s) {
        return '<span class="badge badge-grey">' + esc(s) + "</span>";
      }).join(" ");
      return '<div class="list-row" style="align-items:flex-start;">' +
        '<div style="flex:1;min-width:260px;">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><span style="font-weight:800;font-size:15px;">' + esc(q.name) + "</span>" + badge(q.status) + "</div>" +
        '<div style="margin-top:4px;font-size:13px;color:#7fadff;">' + esc(q.contact) + "</div>" +
        (services ? '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">' + services + "</div>" : "") +
        (q.rdv_day ? '<div style="margin-top:8px;font-size:13px;color:#c9d4e6;">📅 RDV souhaité : <strong>' + esc(fmtDate(q.rdv_day)) + (q.rdv_slot ? " à " + esc(q.rdv_slot) : "") + "</strong></div>" : "") +
        (q.message ? '<div style="margin-top:8px;font-size:13px;color:#93a0b5;line-height:1.55;">' + esc(q.message).replace(/\n/g, "<br>") + "</div>" : "") +
        '<div style="margin-top:6px;font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#5f6d84;">Reçue le ' + esc(fmtDateTime(q.created_at)) + "</div>" +
        "</div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        (q.status === "new"
          ? '<button ' + GHOST_BTN + ' data-quote-done="' + q.id + '">✓ Marquer traitée</button>'
          : '<button ' + GHOST_BTN + ' data-quote-reopen="' + q.id + '">Rouvrir</button>') +
        '<button ' + DANGER_BTN + ' data-quote-del="' + q.id + '">Supprimer</button>' +
        "</div></div>";
    }).join("");
    host.querySelectorAll("[data-quote-done]").forEach(function (b) {
      b.addEventListener("click", function () { setQuoteStatus(b.dataset.quoteDone, "traite"); });
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
    document.getElementById("dc-client").innerHTML = '<option value="">Choisir un client</option>' + opts;
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
    }).then(function () {
      clientForm.reset();
      clientForm.hidden = true;
      loadAll();
    }).catch(function (e) { showError("Création du compte : " + e.message); });
  });

  /* ---------- Interventions ---------- */
  function renderInterventions() {
    var host = document.getElementById("ai-list");
    if (!interventions.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucune intervention.</p>';
      return;
    }
    host.innerHTML = interventions.map(function (r) {
      return '<div class="list-row" data-iv-row="' + r.id + '">' +
        '<div style="min-width:120px;font-family:\'IBM Plex Mono\',monospace;font-size:13px;color:#c9d4e6;">' + esc(fmtDate(r.date)) + (r.time_slot ? " · " + esc(r.time_slot) : "") + "</div>" +
        '<div style="flex:1;min-width:220px;">' +
        '<div style="font-weight:800;font-size:14.5px;">' + esc(r.type) + ' <span style="font-weight:600;color:#7fadff;">· ' + esc(clientName(r.partner_id)) + "</span></div>" +
        '<div style="margin-top:3px;font-size:13px;color:#93a0b5;">' + esc(r.equipment || "") + (r.location ? " · " + esc(r.location) : "") + (r.notes ? " · " + esc(r.notes) : "") + "</div></div>" +
        statusSelect(r.status, ["planifiee", "en_cours", "terminee", "annulee"], "iv-status") +
        '<button ' + DANGER_BTN + ' data-iv-del="' + r.id + '">✕</button>' +
        "</div>";
    }).join("");
    host.querySelectorAll(".iv-status").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var id = sel.closest("[data-iv-row]").dataset.ivRow;
        api("cta_interventions?id=eq." + id, { method: "PATCH", body: { status: sel.value } })
          .then(function () {
            interventions.find(function (x) { return x.id === id; }).status = sel.value;
            refreshStats(); renderToday();
          }).catch(function () { showError("Mise à jour impossible."); });
      });
    });
    host.querySelectorAll("[data-iv-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Supprimer cette intervention ?")) return;
        api("cta_interventions?id=eq." + b.dataset.ivDel, { method: "DELETE" })
          .then(function () {
            interventions = interventions.filter(function (x) { return x.id !== b.dataset.ivDel; });
            refreshStats(); renderToday(); renderInterventions();
          }).catch(function () { showError("Suppression impossible."); });
      });
    });
  }
  document.getElementById("interv-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var body = {
      partner_id: document.getElementById("iv-client").value,
      date: document.getElementById("iv-date").value,
      time_slot: document.getElementById("iv-slot").value.trim() || null,
      type: document.getElementById("iv-type").value.trim(),
      equipment: document.getElementById("iv-equip").value.trim() || null,
      location: document.getElementById("iv-loc").value.trim() || null,
      notes: document.getElementById("iv-notes").value.trim() || null
    };
    if (!body.partner_id || !body.date || !body.type) return;
    api("cta_interventions", { method: "POST", body: body })
      .then(function () {
        ev.target.reset();
        return api("cta_interventions?select=*&order=date.desc");
      })
      .then(function (rows) { interventions = rows; refreshStats(); renderToday(); renderInterventions(); })
      .catch(function () { showError("Création impossible."); });
  });

  /* ---------- Devis & factures ---------- */
  function renderDocuments() {
    var host = document.getElementById("ad-list");
    if (!documents.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucun document.</p>';
      return;
    }
    host.innerHTML = documents.map(function (r) {
      var statuses = r.kind === "devis" ? ["en_attente", "accepte", "refuse"] : ["a_regler", "payee"];
      return '<div class="list-row" data-doc-row="' + r.id + '">' +
        '<span class="badge ' + (r.kind === "devis" ? "badge-blue" : "badge-grey") + '">' + (r.kind === "devis" ? "Devis" : "Facture") + "</span>" +
        '<div style="flex:1;min-width:220px;">' +
        '<div style="font-weight:800;font-size:14.5px;">' + esc(r.reference) + ' <span style="font-weight:600;color:#7fadff;">· ' + esc(clientName(r.partner_id)) + "</span></div>" +
        '<div style="margin-top:3px;font-size:12.5px;color:#93a0b5;">' + esc(r.label || "") + " · émis le " + esc(fmtDate(r.issued_on)) + "</div></div>" +
        '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:14px;color:#fff;min-width:90px;text-align:right;">' + esc(eur(r.amount_ht)) + " HT</div>" +
        statusSelect(r.status, statuses, "doc-status") +
        '<button ' + DANGER_BTN + ' data-doc-del="' + r.id + '">✕</button>' +
        "</div>";
    }).join("");
    host.querySelectorAll(".doc-status").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var id = sel.closest("[data-doc-row]").dataset.docRow;
        api("cta_documents?id=eq." + id, { method: "PATCH", body: { status: sel.value } })
          .then(function () {
            documents.find(function (x) { return x.id === id; }).status = sel.value;
            refreshStats();
          }).catch(function () { showError("Mise à jour impossible."); });
      });
    });
    host.querySelectorAll("[data-doc-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!window.confirm("Supprimer ce document ?")) return;
        api("cta_documents?id=eq." + b.dataset.docDel, { method: "DELETE" })
          .then(function () {
            documents = documents.filter(function (x) { return x.id !== b.dataset.docDel; });
            refreshStats(); renderDocuments();
          }).catch(function () { showError("Suppression impossible."); });
      });
    });
  }
  document.getElementById("doc-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var kind = document.getElementById("dc-kind").value;
    var amount = document.getElementById("dc-amount").value;
    var body = {
      partner_id: document.getElementById("dc-client").value,
      kind: kind,
      reference: document.getElementById("dc-ref").value.trim(),
      label: document.getElementById("dc-label").value.trim() || null,
      amount_ht: amount === "" ? null : Number(amount),
      status: kind === "devis" ? "en_attente" : "a_regler",
      issued_on: document.getElementById("dc-date").value || undefined,
      file_url: document.getElementById("dc-url").value.trim() || null
    };
    if (!body.partner_id || !body.reference) return;
    api("cta_documents", { method: "POST", body: body })
      .then(function () {
        ev.target.reset();
        return api("cta_documents?select=*&order=issued_on.desc");
      })
      .then(function (rows) { documents = rows; refreshStats(); renderDocuments(); })
      .catch(function () { showError("Création impossible."); });
  });

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

  /* ---------- Messagerie ---------- */
  function renderTicketList() {
    var host = document.getElementById("at-list");
    if (!tickets.length) {
      host.innerHTML = '<p style="margin:0;padding:6px;color:#5f6d84;font-size:14px;">Aucun ticket.</p>';
      return;
    }
    host.innerHTML = tickets.map(function (t) {
      return '<button type="button" class="ticket-item' + (currentTicket === t.id ? " active" : "") + '" data-id="' + t.id + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
        '<span style="font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(t.subject) + "</span>" + badge(t.status) + "</div>" +
        '<div style="margin-top:5px;font-family:\'IBM Plex Mono\',monospace;font-size:11.5px;color:#5f6d84;">' + esc(clientName(t.partner_id)) + " · " + esc(fmtDateTime(t.updated_at)) + "</div>" +
        "</button>";
    }).join("");
    host.querySelectorAll(".ticket-item").forEach(function (b) {
      b.addEventListener("click", function () {
        currentTicket = b.dataset.id;
        renderTicketList();
        renderThread();
      });
    });
  }

  function renderThread() {
    var t = tickets.find(function (x) { return x.id === currentTicket; });
    document.getElementById("at-empty").hidden = !!t;
    document.getElementById("at-view").hidden = !t;
    if (!t) return;
    document.getElementById("at-subject").textContent = t.subject;
    document.getElementById("at-meta").textContent = clientName(t.partner_id) + " · ouvert le " + fmtDateTime(t.created_at);
    document.getElementById("at-status").value = t.status;
    var msgs = (t.cta_ticket_messages || []).slice().sort(function (a, b) {
      return new Date(a.created_at) - new Date(b.created_at);
    });
    document.getElementById("at-msgs").innerHTML = msgs.map(function (m) {
      var isCta = m.author === "cta";
      return '<div style="display:flex;gap:12px;align-items:flex-start;' + (isCta ? "flex-direction:row-reverse;" : "") + '">' +
        '<span style="width:36px;height:36px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;' +
        (isCta ? "background:rgba(47,123,255,.15);border:1px solid rgba(77,141,255,.45);font-size:14px;" : "background:rgba(120,150,200,.12);border:1px solid rgba(120,150,200,.3);font-family:'IBM Plex Mono',monospace;font-size:9px;color:#9fb6d8;") + '">' +
        (isCta ? "🎧" : "CLIENT") + "</span>" +
        '<div style="max-width:80%;padding:12px 16px;font-size:13.5px;line-height:1.55;color:#dfe6f2;' +
        (isCta
          ? "border-radius:14px 4px 14px 14px;background:rgba(47,123,255,.12);border:1px solid rgba(77,141,255,.3);"
          : "border-radius:4px 14px 14px 14px;background:rgba(13,17,25,.9);border:1px solid rgba(120,150,200,.22);") + '">' +
        esc(m.body).replace(/\n/g, "<br>") +
        '<div style="margin-top:6px;font-family:\'IBM Plex Mono\',monospace;font-size:10px;color:#5f6d84;">' + esc(fmtDateTime(m.created_at)) + "</div>" +
        "</div></div>";
    }).join("");
  }

  function reloadTickets() {
    return api("cta_tickets?select=*,cta_ticket_messages(*)&order=updated_at.desc").then(function (rows) {
      tickets = rows;
      if (currentTicket && !tickets.some(function (t) { return t.id === currentTicket; })) currentTicket = null;
      if (!currentTicket && tickets.length) currentTicket = tickets[0].id;
      refreshStats(); renderTicketList(); renderThread();
    });
  }

  document.getElementById("at-status").addEventListener("change", function () {
    if (!currentTicket) return;
    api("cta_tickets?id=eq." + currentTicket, { method: "PATCH", body: { status: this.value } })
      .then(reloadTickets)
      .catch(function () { showError("Mise à jour du ticket impossible."); });
  });
  document.getElementById("at-reply").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var body = document.getElementById("at-body").value.trim();
    if (!body || !currentTicket) return;
    api("cta_ticket_messages", { method: "POST", body: { ticket_id: currentTicket, author: "cta", author_id: uid, body: body } })
      .then(function () {
        document.getElementById("at-body").value = "";
        return reloadTickets();
      })
      .catch(function () { showError("Envoi impossible."); });
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
