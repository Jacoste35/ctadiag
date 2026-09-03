/* Messagerie CTA · page dédiée, réservée au compte administrateur.
   Gestion des tickets (fil, statut, archives) et des réponses automatiques
   « apprenantes » : le gérant enregistre ses réponses types avec leurs
   mots-clés ; la fonction Edge auto-reply les sert instantanément aux clients. */
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

  /* ---------- Utilitaires ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtDateTime(ts) {
    return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " " +
           new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  var STATUS = {
    ouvert: ["Ouvert", "badge-blue"], en_cours: ["En cours", "badge-amber"],
    resolu: ["Résolu", "badge-green"], ferme: ["Fermé", "badge-grey"]
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

  /* ---------- Données ---------- */
  var clients = [], tickets = [], autoReplies = [];
  var currentTicket = null;
  var showArchived = false;
  var editingReply = null;

  function clientName(id) {
    var c = clients.find(function (x) { return x.id === id; });
    return c ? (c.company_name || c.email || "?") : "?";
  }

  function loadAll() {
    Promise.all([
      api("cta_partners?select=id,email,company_name&order=created_at.asc"),
      api("cta_tickets?select=*,cta_ticket_messages(*)&order=updated_at.desc"),
      api("cta_auto_replies?select=*&order=usage_count.desc,created_at.desc")
    ]).then(function (res) {
      clients = res[0]; tickets = res[1]; autoReplies = res[2];
      if (!currentTicket) {
        var pool = tickets.filter(function (t) { return !t.archived; });
        if (pool.length) currentTicket = pool[0].id;
      }
      renderOpenCount(); renderTicketList(); renderThread(); renderAutoReplies();
    }).catch(function () {
      showError("Chargement impossible : vérifiez votre connexion ou reconnectez-vous.");
    });
  }

  function renderOpenCount() {
    var n = tickets.filter(function (t) { return t.status === "ouvert" || t.status === "en_cours"; }).length;
    document.getElementById("mq-open").textContent = n + " ticket" + (n > 1 ? "s" : "") + " ouvert" + (n > 1 ? "s" : "");
  }

  /* ---------- Liste des tickets ---------- */
  function renderTicketList() {
    var host = document.getElementById("at-list");
    var visible = tickets.filter(function (t) { return showArchived ? t.archived : !t.archived; });
    var archivedCount = tickets.filter(function (t) { return t.archived; }).length;
    var toggle = archivedCount
      ? '<button type="button" id="at-toggle-archived" style="margin-top:4px;padding:9px 14px;border-radius:999px;border:1px dashed rgba(120,150,200,.3);background:transparent;color:#8b98ae;font-weight:700;font-size:12.5px;cursor:pointer;font-family:\'Archivo\',sans-serif;">' +
        (showArchived ? "← Retour aux tickets actifs" : "🗄️ Voir les archives (" + archivedCount + ")") + "</button>"
      : "";
    if (!visible.length) {
      host.innerHTML = '<p style="margin:0;padding:6px;color:#5f6d84;font-size:14px;">' +
        (showArchived ? "Aucun ticket archivé." : "Aucun ticket.") + "</p>" + toggle;
      bindToggle(host);
      return;
    }
    host.innerHTML = visible.map(function (t) {
      return '<button type="button" class="ticket-item' + (currentTicket === t.id ? " active" : "") + '" data-id="' + t.id + '">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
        '<span style="font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(t.subject) + "</span>" + badge(t.status) + "</div>" +
        '<div style="margin-top:5px;font-family:\'IBM Plex Mono\',monospace;font-size:11.5px;color:#5f6d84;">' + esc(clientName(t.partner_id)) + " · " + esc(fmtDateTime(t.updated_at)) + "</div>" +
        "</button>";
    }).join("") + toggle;
    host.querySelectorAll(".ticket-item").forEach(function (b) {
      b.addEventListener("click", function () {
        currentTicket = b.dataset.id;
        renderTicketList();
        renderThread();
      });
    });
    bindToggle(host);
  }
  function bindToggle(host) {
    var t = host.querySelector("#at-toggle-archived");
    if (t) t.addEventListener("click", function () {
      showArchived = !showArchived;
      var pool = tickets.filter(function (x) { return showArchived ? x.archived : !x.archived; });
      currentTicket = pool.length ? pool[0].id : null;
      renderTicketList();
      renderThread();
    });
  }

  /* ---------- Fil du ticket ---------- */
  function renderThread() {
    var t = tickets.find(function (x) { return x.id === currentTicket; });
    document.getElementById("at-empty").hidden = !!t;
    document.getElementById("at-view").hidden = !t;
    if (!t) return;
    document.getElementById("at-subject").textContent = t.subject;
    document.getElementById("at-meta").textContent = clientName(t.partner_id) + " · ouvert le " + fmtDateTime(t.created_at);
    document.getElementById("at-status").value = t.status;
    var archBtn = document.getElementById("at-archive");
    archBtn.hidden = !(t.status === "resolu" || t.status === "ferme");
    archBtn.textContent = t.archived ? "Désarchiver" : "Archiver";
    var msgs = (t.cta_ticket_messages || []).slice().sort(function (a, b) {
      return new Date(a.created_at) - new Date(b.created_at);
    });
    document.getElementById("at-msgs").innerHTML = msgs.map(function (m) {
      var isCta = m.author === "cta";
      return '<div style="display:flex;gap:12px;align-items:flex-start;' + (isCta ? "flex-direction:row-reverse;" : "") + '">' +
        '<span style="width:36px;height:36px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;' +
        (isCta ? "background:rgba(47,123,255,.15);border:1px solid rgba(77,141,255,.45);font-size:14px;" : "background:rgba(120,150,200,.12);border:1px solid rgba(120,150,200,.3);font-family:'IBM Plex Mono',monospace;font-size:9px;color:#9fb6d8;") + '">' +
        (isCta ? (m.is_auto ? "🤖" : "🎧") : "CLIENT") + "</span>" +
        '<div style="max-width:80%;padding:12px 16px;font-size:13.5px;line-height:1.55;color:#dfe6f2;' +
        (isCta
          ? "border-radius:14px 4px 14px 14px;background:rgba(47,123,255,.12);border:1px solid rgba(77,141,255,.3);"
          : "border-radius:4px 14px 14px 14px;background:rgba(13,17,25,.9);border:1px solid rgba(120,150,200,.22);") + '">' +
        (m.is_auto ? '<div style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;letter-spacing:.12em;color:#7fadff;text-transform:uppercase;margin-bottom:4px;">🤖 Réponse automatique</div>' : "") +
        esc(m.body).replace(/\n/g, "<br>") +
        '<div style="margin-top:6px;display:flex;align-items:center;gap:10px;justify-content:space-between;">' +
        '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;color:#5f6d84;">' + esc(fmtDateTime(m.created_at)) + "</span>" +
        (isCta && !m.is_auto
          ? '<button type="button" data-learn="' + m.id + '" title="Transformer cette réponse en réponse automatique" style="padding:3px 10px;border-radius:999px;border:1px solid rgba(77,141,255,.4);background:transparent;color:#7fadff;font-weight:700;font-size:10.5px;cursor:pointer;font-family:\'Archivo\',sans-serif;">🧠 Apprendre</button>'
          : "") +
        "</div></div></div>";
    }).join("");
    document.getElementById("at-msgs").querySelectorAll("[data-learn]").forEach(function (b) {
      b.addEventListener("click", function () { learnFromMessage(t, b.dataset.learn); });
    });
  }

  function reloadTickets() {
    return api("cta_tickets?select=*,cta_ticket_messages(*)&order=updated_at.desc").then(function (rows) {
      tickets = rows;
      if (currentTicket && !tickets.some(function (t) { return t.id === currentTicket; })) currentTicket = null;
      if (!currentTicket) {
        var pool = tickets.filter(function (t) { return showArchived ? t.archived : !t.archived; });
        if (pool.length) currentTicket = pool[0].id;
      }
      renderOpenCount(); renderTicketList(); renderThread();
    });
  }

  document.getElementById("at-archive").addEventListener("click", function () {
    var t = tickets.find(function (x) { return x.id === currentTicket; });
    if (!t) return;
    api("cta_tickets?id=eq." + currentTicket, { method: "PATCH", body: { archived: !t.archived } })
      .then(function () { currentTicket = null; return reloadTickets(); })
      .catch(function () { showError("Archivage impossible."); });
  });

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

  /* ---------- Apprentissage : réponse du gérant → réponse automatique ---------- */
  var STOPWORDS = ["avec", "pour", "dans", "vous", "votre", "nous", "notre", "cette", "cela", "mais", "elle", "sont", "être", "avez", "fait", "plus", "tout", "bien", "bonjour", "merci", "quand", "comme", "alors", "aussi", "chez", "leur", "mon", "une", "les", "des", "est", "que", "qui", "sur", "pas", "et", "le", "la", "un", "de", "du", "en", "au", "je", "il", "on", "ne", "se", "ce", "sa", "son", "ses", "aux", "par"];
  function suggestKeywords(text) {
    var words = String(text || "").toLowerCase()
      .replace(/[.,;:!?()"«»]/g, " ")
      .split(/\s+/)
      .filter(function (w) { return w.length >= 4 && STOPWORDS.indexOf(w) === -1; });
    var seen = {};
    var out = [];
    words.forEach(function (w) {
      if (!seen[w] && out.length < 4) { seen[w] = true; out.push(w); }
    });
    return out;
  }
  function learnFromMessage(ticket, messageId) {
    var msgs = (ticket.cta_ticket_messages || []).slice().sort(function (a, b) {
      return new Date(a.created_at) - new Date(b.created_at);
    });
    var idx = msgs.findIndex(function (m) { return m.id === messageId; });
    if (idx === -1) return;
    var reply = msgs[idx];
    var question = null;
    for (var i = idx - 1; i >= 0; i--) {
      if (msgs[i].author === "partner") { question = msgs[i]; break; }
    }
    editingReply = null;
    document.getElementById("ar-mode").textContent = "🧠 Apprentissage depuis le ticket « " + ticket.subject + " »";
    document.getElementById("ar-title").value = ticket.subject || "";
    document.getElementById("ar-keywords").value = suggestKeywords(question ? question.body : ticket.subject).join(", ");
    document.getElementById("ar-reply").value = reply.body;
    document.getElementById("ar-cancel").hidden = false;
    document.getElementById("ar-form").scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("ar-keywords").focus();
  }

  /* ---------- Réponses automatiques ---------- */
  function renderAutoReplies() {
    var host = document.getElementById("ar-list");
    if (!autoReplies.length) {
      host.innerHTML = '<p style="margin:0;padding:22px 24px;color:#5f6d84;font-size:14px;">Aucune réponse automatique : enregistrez la première ci-dessus, ou apprenez-en une depuis un ticket (bouton 🧠).</p>';
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
  document.getElementById("ar-cancel").addEventListener("click", resetArForm);

  document.getElementById("ar-form").addEventListener("submit", function (ev) {
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
      return api("cta_auto_replies?select=*&order=usage_count.desc,created_at.desc");
    })
      .then(function (rows) { autoReplies = rows; renderAutoReplies(); })
      .catch(function () { showError("Enregistrement impossible."); });
  });
})();
