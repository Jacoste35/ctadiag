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
        '<div style="margin-top:3px;font-size:13px;color:#93a0b5;">' + esc(r.equipment || "") + (r.location ? " · " + esc(r.location) : "") + "</div>" +
        (r.notes ? '<div style="margin-top:4px;font-size:12.5px;color:#5f6d84;">' + esc(r.notes) + "</div>" : "") + "</div>" +
        badge(r.status) + "</div>";
    }).join("");
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
          ? '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:14px;color:#8b98ae;text-decoration:line-through;">' + esc(eur(r.public_price_ht)) + "</span>"
          : "<span></span>") +
        '<span style="text-align:right;font-family:\'IBM Plex Mono\',monospace;font-size:15px;font-weight:600;color:#7fadff;">' + esc(eur(myPrice)) + "</span>" +
        "</div>";
    }).join("");
  }
  api("cta_price_grid?select=*&order=sort.asc").then(function (rows) {
    gridRows = rows;
    renderGrid();
  }).catch(function () { showError("Impossible de charger la grille tarifaire : reconnectez-vous ou réessayez plus tard."); });

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
