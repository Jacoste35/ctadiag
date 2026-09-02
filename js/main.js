/* CTA · Conseil Technique Auto — logique du site
   Reveal au scroll, menu mobile, calendrier de rendez-vous, formulaire de devis
   (envoi vers le backend Supabase avec repli mailto:), connexion espace partenaires. */
(function () {
  "use strict";

  var CFG = window.CTA_CONFIG || {};
  var API = (CFG.supabaseUrl || "").replace(/\/$/, "");
  var KEY = CFG.supabaseAnonKey || "";

  /* ---------- Reveal au scroll ---------- */
  var revealEls = document.querySelectorAll("[data-reveal]");
  var groups = new Map();
  revealEls.forEach(function (el) {
    el.style.opacity = "0";
    el.style.transform = "translateY(28px)";
    var p = el.parentElement;
    var i = groups.get(p) || 0;
    groups.set(p, i + 1);
    el.style.transition =
      "opacity .7s cubic-bezier(.22,.61,.36,1) " + i * 0.09 + "s, transform .7s cubic-bezier(.22,.61,.36,1) " + i * 0.09 + "s";
  });
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.style.opacity = "1";
          e.target.style.transform = "translateY(0)";
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealEls.forEach(function (el) { io.observe(el); });

  /* ---------- Menu mobile ---------- */
  var burger = document.getElementById("nav-burger");
  var navMobile = document.getElementById("nav-mobile");
  if (burger && navMobile) {
    burger.addEventListener("click", function () {
      var open = navMobile.classList.toggle("open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    navMobile.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        navMobile.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- Lien boutique ---------- */
  var boutiqueLink = document.getElementById("boutique-link");
  if (boutiqueLink) {
    var bUrl = (CFG.boutiqueUrl || "").trim();
    if (bUrl && bUrl !== "https://") {
      boutiqueLink.href = bUrl;
    } else {
      boutiqueLink.removeAttribute("target");
      boutiqueLink.href = "#contact";
      boutiqueLink.title = "Boutique en cours d'ouverture — contactez-nous";
    }
  }

  /* ---------- Calendrier de rendez-vous ---------- */
  var state = { calMonth: null, rdvDay: null, rdvSlot: null, picked: {} };
  var SLOT_TIMES = ["09:00", "10:30", "14:00", "15:30", "17:00"];
  var blocked = (CFG.joursBloques || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);

  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function fmtDay(s) {
    var p = s.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  }
  function rdvLabel() {
    return state.rdvDay ? fmtDay(state.rdvDay) + (state.rdvSlot ? " à " + state.rdvSlot : "") : "";
  }

  var calDaysEl = document.getElementById("cal-days");
  var calMonthEl = document.getElementById("cal-month");
  var slotTitleEl = document.getElementById("slot-title");
  var slotsWrapEl = document.getElementById("slots-wrap");
  var slotRecapEl = document.getElementById("slot-recap");
  var rdvLabelEl = document.getElementById("rdv-label");
  var rdvReminderEl = document.getElementById("rdv-reminder");
  var rdvReminderLabelEl = document.getElementById("rdv-reminder-label");

  function renderCalendar() {
    if (!calDaysEl) return;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var cal = state.calMonth || new Date(today.getFullYear(), today.getMonth(), 1);
    state.calMonth = cal;
    calMonthEl.textContent = cal.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    calDaysEl.innerHTML = "";
    var firstDow = (new Date(cal.getFullYear(), cal.getMonth(), 1).getDay() + 6) % 7;
    var nbDays = new Date(cal.getFullYear(), cal.getMonth() + 1, 0).getDate();
    for (var i = 0; i < firstDow; i++) {
      var pad = document.createElement("div");
      calDaysEl.appendChild(pad);
    }
    var _loop = function (n) {
      var d = new Date(cal.getFullYear(), cal.getMonth(), n);
      var dIso = iso(d);
      var avail = d >= today && d.getDay() !== 0 && d.getDay() !== 6 && blocked.indexOf(dIso) === -1;
      var sel = state.rdvDay === dIso;
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = n;
      b.disabled = !avail;
      b.style.cssText =
        "aspect-ratio:1;border-radius:10px;font-size:14px;font-weight:600;font-family:'Archivo',sans-serif;transition:border-color .2s;" +
        "border:1px solid " + (sel ? "#4d8dff" : avail ? "rgba(77,141,255,.5)" : "rgba(120,150,200,.12)") + ";" +
        "background:" + (sel ? "linear-gradient(135deg,#2f7bff,#1c5bd6)" : avail ? "rgba(47,123,255,.16)" : "rgba(120,150,200,.05)") + ";" +
        "color:" + (sel ? "#fff" : avail ? "#dfe6f2" : "#3d4657") + ";" +
        "cursor:" + (avail ? "pointer" : "default") + ";";
      if (avail) {
        b.addEventListener("click", function () {
          state.rdvDay = dIso;
          state.rdvSlot = null;
          renderCalendar();
        });
      }
      calDaysEl.appendChild(b);
    };
    for (var n = 1; n <= nbDays; n++) _loop(n);
    renderSlots();
  }

  function renderSlots() {
    if (!slotsWrapEl) return;
    var hasDay = !!state.rdvDay;
    var hasSlot = !!(state.rdvDay && state.rdvSlot);
    slotTitleEl.textContent = hasDay ? "Créneaux du " + fmtDay(state.rdvDay) : "Sélectionnez d'abord un jour disponible";
    slotsWrapEl.hidden = !hasDay;
    slotsWrapEl.innerHTML = "";
    if (hasDay) {
      SLOT_TIMES.forEach(function (t) {
        var sel = state.rdvSlot === t;
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = t;
        b.style.cssText =
          "padding:13px;border-radius:10px;font-size:14.5px;font-weight:700;cursor:pointer;font-family:'IBM Plex Mono',monospace;" +
          "border:1px solid " + (sel ? "#4d8dff" : "rgba(120,150,200,.25)") + ";" +
          "background:" + (sel ? "linear-gradient(135deg,#2f7bff,#1c5bd6)" : "transparent") + ";" +
          "color:" + (sel ? "#fff" : "#c9d4e6") + ";";
        b.addEventListener("click", function () {
          state.rdvSlot = t;
          renderSlots();
        });
        slotsWrapEl.appendChild(b);
      });
    }
    slotRecapEl.hidden = !hasSlot;
    if (rdvLabelEl) rdvLabelEl.textContent = rdvLabel();
    if (rdvReminderEl) {
      rdvReminderEl.hidden = !hasSlot;
      if (rdvReminderLabelEl) rdvReminderLabelEl.textContent = rdvLabel();
    }
  }

  var prevBtn = document.getElementById("cal-prev");
  var nextBtn = document.getElementById("cal-next");
  if (prevBtn) prevBtn.addEventListener("click", function () {
    var c = state.calMonth;
    state.calMonth = new Date(c.getFullYear(), c.getMonth() - 1, 1);
    renderCalendar();
  });
  if (nextBtn) nextBtn.addEventListener("click", function () {
    var c = state.calMonth;
    state.calMonth = new Date(c.getFullYear(), c.getMonth() + 1, 1);
    renderCalendar();
  });
  renderCalendar();

  // Jours bloqués gérés côté backend (table blocked_dates, lecture publique).
  if (API && KEY) {
    fetch(API + "/rest/v1/blocked_dates?select=day", {
      headers: { apikey: KEY, Authorization: "Bearer " + KEY }
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        rows.forEach(function (row) {
          if (row.day && blocked.indexOf(row.day) === -1) blocked.push(row.day);
        });
        renderCalendar();
      })
      .catch(function () { /* hors-ligne : le calendrier reste utilisable */ });
  }

  /* ---------- Chips prestations ---------- */
  var PRESTAS = ["Diagnostic Autel", "Station ATF", "Calibration ADAS", "Mise en service à distance", "Autre"];
  var chipsEl = document.getElementById("chips");
  function renderChips() {
    if (!chipsEl) return;
    chipsEl.innerHTML = "";
    PRESTAS.forEach(function (label) {
      var on = !!state.picked[label];
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText =
        "padding:9px 16px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Archivo',sans-serif;" +
        "border:1px solid " + (on ? "#4d8dff" : "rgba(120,150,200,.25)") + ";" +
        "background:" + (on ? "rgba(47,123,255,.18)" : "transparent") + ";" +
        "color:" + (on ? "#dfe6f2" : "#8b98ae") + ";";
      b.addEventListener("click", function () {
        state.picked[label] = !state.picked[label];
        renderChips();
      });
      chipsEl.appendChild(b);
    });
  }
  renderChips();

  /* ---------- Formulaire de devis ---------- */
  var quoteForm = document.getElementById("quote-form");
  var submitBtn = document.getElementById("f-submit");
  var statusEl = document.getElementById("form-status");

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.hidden = !msg;
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#ff8c8c" : "#7fadff";
  }

  function mailtoFallback(payload) {
    var body =
      "Société : " + payload.name +
      "\nContact : " + payload.contact +
      "\nPrestations : " + payload.services.join(", ") +
      "\nRendez-vous souhaité : " + (payload.rdv_day ? fmtDay(payload.rdv_day) + (payload.rdv_slot ? " à " + payload.rdv_slot : "") : "aucun créneau sélectionné") +
      "\n\n" + payload.message;
    window.location.href =
      "mailto:" + (CFG.emailContact || "contact@cta-auto.fr") +
      "?subject=" + encodeURIComponent("Demande de devis CTA") +
      "&body=" + encodeURIComponent(body);
  }

  if (quoteForm) {
    quoteForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var payload = {
        name: document.getElementById("f-nom").value.trim(),
        contact: document.getElementById("f-email").value.trim(),
        services: PRESTAS.filter(function (l) { return state.picked[l]; }),
        rdv_day: state.rdvDay,
        rdv_slot: state.rdvSlot,
        message: document.getElementById("f-msg").value.trim(),
        consent: document.getElementById("f-consent").checked,
        website: document.getElementById("f-website").value
      };
      if (!payload.name || !payload.contact) {
        setStatus("Merci d'indiquer votre nom / société et un moyen de contact.", true);
        return;
      }
      if (!payload.consent) {
        setStatus("Merci de cocher la case de consentement pour que nous puissions traiter votre demande.", true);
        return;
      }
      if (!API || !KEY) {
        mailtoFallback(payload);
        setStatus("E-mail préparé ✓ — envoyez-le depuis votre messagerie.");
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "Envoi en cours…";
      fetch(API + "/functions/v1/submit-quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: KEY,
          Authorization: "Bearer " + KEY
        },
        body: JSON.stringify(payload)
      })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function () {
          submitBtn.textContent = "Demande envoyée ✓";
          setStatus("Merci ! Votre demande est bien enregistrée, nous revenons vers vous sous 24 h ouvrées.");
          quoteForm.reset();
          state.picked = {};
          renderChips();
        })
        .catch(function () {
          submitBtn.textContent = "Envoyer la demande de devis";
          setStatus("L'envoi direct a échoué — un e-mail prérempli va s'ouvrir dans votre messagerie.", true);
          mailtoFallback(payload);
        })
        .finally(function () {
          submitBtn.disabled = false;
        });
    });
  }

  /* ---------- Connexion espace partenaires ---------- */
  var pForm = document.getElementById("p-form");
  var pMsg = document.getElementById("p-msg");
  function setLoginMsg(msg, isError) {
    if (!pMsg) return;
    pMsg.hidden = !msg;
    pMsg.textContent = msg || "";
    pMsg.style.color = isError ? "#ff8c8c" : "#7fadff";
  }
  if (pForm) {
    pForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = document.getElementById("p-email").value.trim();
      var pass = document.getElementById("p-pass").value;
      if (email && email.indexOf("@") === -1) email += "@cta-auto.fr";
      if (!email || !pass) {
        setLoginMsg("Merci de renseigner votre e-mail et votre mot de passe.", true);
        return;
      }
      if (!API || !KEY) {
        setLoginMsg("Espace partenaire en cours d'ouverture : contactez-nous pour votre accès.");
        return;
      }
      var btn = document.getElementById("p-login");
      btn.disabled = true;
      fetch(API + "/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: KEY },
        body: JSON.stringify({ email: email, password: pass })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j.access_token) {
            try {
              sessionStorage.setItem("cta_session", JSON.stringify({
                access_token: res.j.access_token,
                refresh_token: res.j.refresh_token,
                email: email
              }));
            } catch (e) { /* stockage indisponible : la connexion reste valable */ }
            setLoginMsg("Connexion réussie ✓ Redirection vers votre espace…");
            window.location.href = (CFG.espacePartenaireUrl || "").trim() || "espace.html";
          } else {
            setLoginMsg("Identifiants incorrects ou accès non encore activé. Demandez votre accès via le formulaire de devis.", true);
          }
        })
        .catch(function () {
          setLoginMsg("Connexion impossible pour le moment, réessayez plus tard.", true);
        })
        .finally(function () { btn.disabled = false; });
    });
  }
})();
