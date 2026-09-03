// Fonction Edge `send-notice` · messages ponctuels du gérant au client à propos
// d'un rendez-vous : relance, report (nouvelle date) ou annulation.
// Réservée à l'administrateur ; envoi via Resend (RESEND_API_KEY).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const frDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Non authentifié" }, 401);

  const { data: me } = await db
    .from("cta_partners").select("role").eq("id", userData.user.id).maybeSingle();
  if (!me || me.role !== "admin") return json({ error: "Réservé à l'administrateur" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }
  const interventionId = String(body.intervention_id ?? "");
  const kind = String(body.kind ?? "");
  const newDate = typeof body.new_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.new_date) ? body.new_date : null;
  const newSlot = typeof body.new_slot === "string" && /^\d{2}:\d{2}$/.test(body.new_slot) ? body.new_slot : null;
  const oldDate = typeof body.old_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.old_date) ? body.old_date : null;
  if (!interventionId || !["relance", "report", "annulation"].includes(kind)) {
    return json({ error: "Paramètres invalides" }, 400);
  }

  const { data: iv } = await db
    .from("cta_interventions").select("*").eq("id", interventionId).maybeSingle();
  if (!iv) return json({ error: "Intervention introuvable" }, 404);
  const { data: partner } = await db
    .from("cta_partners").select("email,company_name,contact_name").eq("id", iv.partner_id).maybeSingle();
  if (!partner?.email) return json({ sent: false, reason: "Le client n'a pas d'adresse e-mail." });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return json({ sent: false, reason: "E-mails non configurés (secret RESEND_API_KEY manquant dans Supabase)." });
  }
  const notifyTo = Deno.env.get("QUOTE_NOTIFY_EMAIL") || "contact@cta-auto.fr";

  const hello = `Bonjour${partner.contact_name ? " " + partner.contact_name : ""},\n\n`;
  const when = (d: string | null, s: string | null) =>
    d ? `${frDate(d)}${s ? ` à ${s}` : ""}` : "à définir";
  const rdv = `${iv.type}${iv.location ? ` (${iv.location})` : ""}`;
  const foot = `\n\nCTA · Conseil Technique Auto\n${notifyTo}`;
  const policy = "\n\nRappel : tout rendez-vous non décommandé au minimum 24 h à l'avance (sauf urgence ou accord direct avec votre prestataire) est considéré comme réalisé et facturé.";

  let subject = "";
  let text = "";
  if (kind === "relance") {
    subject = `Rappel de votre rendez-vous CTA · ${when(iv.date, iv.time_slot)}`;
    text = hello +
      `Petit rappel concernant votre rendez-vous : ${rdv}, prévu le ${when(iv.date, iv.time_slot)}.\n` +
      `Merci de nous confirmer votre disponibilité, ou de nous prévenir au plus vite en cas d'empêchement.` +
      policy + foot;
  } else if (kind === "report") {
    subject = `Votre rendez-vous CTA est déplacé au ${when(newDate ?? iv.date, newSlot ?? iv.time_slot)}`;
    text = hello +
      `Votre rendez-vous « ${rdv} »${oldDate ? ` initialement prévu le ${when(oldDate, null)}` : ""} est déplacé au ${when(newDate ?? iv.date, newSlot ?? iv.time_slot)}.\n` +
      `En cas d'indisponibilité sur ce nouveau créneau, répondez à cet e-mail ou contactez-nous.` + foot;
  } else {
    subject = `Annulation de votre rendez-vous CTA du ${when(oldDate ?? iv.date, iv.time_slot)}`;
    text = hello +
      `Votre rendez-vous « ${rdv} » prévu le ${when(oldDate ?? iv.date, iv.time_slot)} est annulé.\n` +
      `Nous revenons vers vous pour reprogrammer si nécessaire.` + foot;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "CTA · Conseil Technique Auto <onboarding@resend.dev>",
        to: [partner.email],
        reply_to: notifyTo,
        subject,
        text,
      }),
    });
    if (!res.ok) {
      console.error("Resend:", res.status, await res.text());
      return json({ sent: false, reason: "L'envoi a échoué, réessayez." });
    }
  } catch (e) {
    console.error("Envoi impossible:", e);
    return json({ sent: false, reason: "L'envoi a échoué, réessayez." });
  }

  return json({ sent: true, to: partner.email });
});
