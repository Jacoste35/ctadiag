/* Espace partenaires — page protégée.
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
      return r.status === 204 ? null : r.json();
    });
  }

  /* ---------- Utilitaires ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtDate(iso) {
    if (!iso) return "—";
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
      ["interventions", "documents", "grille", "messagerie"].forEach(function (name) {
        document.getElementById("tab-" + name).hidden = name !== t.dataset.tab;
      });
    });
  });

  /* ---------- Profil (type de client : direct / distributeur) ---------- */
  var clientType = "direct";
  api("cta_partners?select=*&id=eq." + uid).then(function (rows) {
    var p = rows && rows[0];
    if (!p) return;
    clientType = p.client_type || "direct";
    var name = p.contact_name || p.company_name || p.email || "";
    document.getElementById("p-name").textContent = name;
    document.getElementById("p-company").textContent = p.company_name || p.email || "";
    var typeEl = document.getElementById("p-type");
    typeEl.hidden = false;
    typeEl.className = "badge " + (clientType === "distributeur" ? "badge-green" : "badge-blue");
    typeEl.textContent = clientType === "distributeur" ? "Distributeur" : "Client direct";
    if (p.role === "admin") document.getElementById("admin-link").hidden = false;
    if (clientType !== "distributeur") {
      // Client direct : l'onglet devient « Vos tarifs » (tarifs publics, sans remise)
      document.querySelector('[data-tab="grille"]').textContent = "Vos tarifs";
      document.getElementById("grid-col-public").textContent = "";
      document.getElementById("grid-col-partner").textContent = "Tarif HT";
      document.getElementById("grid-note").textContent =
        "Tarifs HT, hors frais de déplacement. Devis personnalisé pour interventions multiples — et grille distributeur dédiée si vous revendez du matériel : parlez-en avec nous.";
    }
    renderGrid();
  }).catch(function () { /* non bloquant */ });

  /* ---------- Interventions ---------- */
  api("cta_interventions?select=*&order=date.asc").then(function (rows) {
    var host = document.getElementById("interv-list");
    document.getElementById("stat-interv").textContent =
      rows.filter(function (r) { return r.status === "planifiee" || r.status === "en_cours"; }).length;
    if (!rows.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucune intervention pour le moment.</p>';
      return;
    }
    host.innerHTML = rows.map(function (r) {
      return '<div class="list-row">' +
        '<div style="min-width:120px;font-family:\'IBM Plex Mono\',monospace;font-size:13px;color:#c9d4e6;">' + esc(fmtDate(r.date)) + (r.time_slot ? " · " + esc(r.time_slot) : "") + "</div>" +
        '<div style="flex:1;min-width:220px;"><div style="font-weight:800;font-size:15px;">' + esc(r.type) + "</div>" +
        '<div style="margin-top:3px;font-size:13px;color:#93a0b5;">' + esc(r.equipment || "") + (r.location ? " — " + esc(r.location) : "") + "</div>" +
        (r.notes ? '<div style="margin-top:4px;font-size:12.5px;color:#5f6d84;">' + esc(r.notes) + "</div>" : "") + "</div>" +
        badge(r.status) + "</div>";
    }).join("");
  }).catch(function () { showError("Impossible de charger les interventions — reconnectez-vous ou réessayez plus tard."); });

  /* ---------- Devis & factures ---------- */
  api("cta_documents?select=*&order=issued_on.desc").then(function (rows) {
    var host = document.getElementById("docs-list");
    document.getElementById("stat-devis").textContent =
      rows.filter(function (r) { return r.kind === "devis" && r.status === "en_attente"; }).length;
    if (!rows.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucun document pour le moment.</p>';
      return;
    }
    host.innerHTML = rows.map(function (r) {
      return '<div class="list-row">' +
        '<span class="badge ' + (r.kind === "devis" ? "badge-blue" : "badge-grey") + '">' + (r.kind === "devis" ? "Devis" : "Facture") + "</span>" +
        '<div style="flex:1;min-width:220px;"><div style="font-weight:800;font-size:15px;">' + esc(r.reference) + (r.label ? ' <span style="font-weight:600;color:#93a0b5;">— ' + esc(r.label) + "</span>" : "") + "</div>" +
        '<div style="margin-top:3px;font-size:12.5px;color:#5f6d84;">Émis le ' + esc(fmtDate(r.issued_on)) + "</div></div>" +
        '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:15px;color:#fff;min-width:110px;text-align:right;">' + esc(eur(r.amount_ht)) + "</div>" +
        badge(r.status) +
        (r.file_url ? '<a href="' + esc(r.file_url) + '" target="_blank" rel="noopener" style="font-size:13px;font-weight:700;">Télécharger ↗</a>' : "") +
        "</div>";
    }).join("");
  }).catch(function () { showError("Impossible de charger les documents — reconnectez-vous ou réessayez plus tard."); });

  /* ---------- Grille tarifaire (distributeur : tarif remisé · direct : tarif public) ---------- */
  var gridRows = null;
  function renderGrid() {
    if (gridRows === null) return;
    var host = document.getElementById("grid-list");
    if (!gridRows.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Grille en cours de préparation — contactez-nous pour un devis.</p>';
      return;
    }
    var distrib = clientType === "distributeur";
    host.innerHTML = gridRows.map(function (r) {
      var myPrice = distrib ? r.partner_price_ht : r.public_price_ht;
      return '<div class="list-row price-row" style="display:grid;grid-template-columns:1fr 140px 140px;gap:10px;align-items:center;">' +
        '<span style="font-size:14.5px;font-weight:600;color:#dfe6f2;">' + esc(r.label) + "</span>" +
        (distrib
          ? '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:14px;color:#8b98ae;text-decoration:line-through;">' + esc(eur(r.public_price_ht)) + "</span>"
          : "<span></span>") +
        '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:15px;font-weight:600;color:#7fadff;">' + esc(eur(myPrice)) + "</span>" +
        "</div>";
    }).join("");
  }
  api("cta_price_grid?select=*&order=sort.asc").then(function (rows) {
    gridRows = rows;
    renderGrid();
  }).catch(function () { showError("Impossible de charger la grille tarifaire — reconnectez-vous ou réessayez plus tard."); });

  /* ---------- Messagerie / tickets ---------- */
  var tickets = [];
  var currentTicket = null;

  function ticketStats() {
    document.getElementById("stat-tickets").textContent =
      tickets.filter(function (t) { return t.status === "ouvert" || t.status === "en_cours"; }).length;
  }

  function renderTicketList() {
    var host = document.getElementById("ticket-list");
    if (!tickets.length) {
      host.innerHTML = '<p style="margin:0;padding:6px;color:#5f6d84;font-size:14px;">Aucun ticket — ouvrez-en un si besoin.</p>';
      return;
    }
    host.innerHTML = tickets.map(function (t) {
      return '<button type="button" class="ticket-item' + (currentTicket === t.id ? " active" : "") + '" data-id="' + t.id + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
        '<span style="font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(t.subject) + "</span>" + badge(t.status) + "</div>" +
        '<div style="margin-top:5px;font-family:\'IBM Plex Mono\',monospace;font-size:11.5px;color:#5f6d84;">Mis à jour le ' + esc(fmtDateTime(t.updated_at)) + "</div>" +
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
        (isCta ? '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;letter-spacing:.12em;color:#7fadff;text-transform:uppercase;margin-bottom:4px;">Hotline CTA</div>' : "") +
        esc(m.body).replace(/\n/g, "<br>") +
        '<div style="margin-top:6px;font-family:\'IBM Plex Mono\',monospace;font-size:10px;color:#5f6d84;">' + esc(fmtDateTime(m.created_at)) + "</div>" +
        "</div></div>";
    }).join("");
  }

  function loadTickets(keepSelection) {
    return api("cta_tickets?select=*,cta_ticket_messages(*)&order=updated_at.desc").then(function (rows) {
      tickets = rows;
      if (!keepSelection || !tickets.some(function (t) { return t.id === currentTicket; })) {
        currentTicket = tickets.length ? tickets[0].id : null;
      }
      ticketStats();
      renderTicketList();
      renderThread();
    });
  }
  loadTickets(false).catch(function () { showError("Impossible de charger la messagerie — reconnectez-vous ou réessayez plus tard."); });

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
        }).then(function () { return ticket.id; });
      })
      .then(function (id) {
        ticketForm.reset();
        ticketForm.hidden = true;
        currentTicket = id;
        return loadTickets(true);
      })
      .catch(function () { showError("L'envoi du ticket a échoué — réessayez ou écrivez-nous à " + (CFG.emailContact || "contact@cta-auto.fr") + "."); });
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
        document.getElementById("r-body").value = "";
        return loadTickets(true);
      })
      .catch(function () { showError("L'envoi du message a échoué — réessayez plus tard."); });
  });

  // Marquer résolu
  document.getElementById("thread-resolve").addEventListener("click", function () {
    if (!currentTicket) return;
    api("cta_tickets?id=eq." + currentTicket, { method: "PATCH", body: { status: "resolu" } })
      .then(function () { return loadTickets(true); })
      .catch(function () { showError("Impossible de mettre à jour le ticket — réessayez plus tard."); });
  });
})();
