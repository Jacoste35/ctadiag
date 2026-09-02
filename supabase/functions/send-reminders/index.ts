// Fonction Edge `send-reminders` · rappels automatiques de rendez-vous.
// Appelée chaque matin par pg_cron (en-tête X-Reminders-Key vérifié contre
// cta_settings). Envoie aux clients un e-mail à J-7, J-3 (72 h), J-1 (24 h)
// et le jour J (annonce du passage du technicien), avec la politique
// d'annulation. Chaque envoi est journalisé dans cta_reminders (pas de doublon).
// Nécessite les secrets RESEND_API_KEY et (recommandé) QUOTE_NOTIFY_EMAIL.
import { createClient } from "npm:@supabase/supabase-js@2";

const POLICY =
  "⚠️ Tout rendez-vous non décommandé au minimum 24 h à l'avance (sauf urgence " +
  "ou accord direct avec votre prestataire) est considéré comme réalisé et " +
  "facturé au client.";

const STAGES: Array<{ stage: string; days: number }> = [
  { stage: "j7", days: 7 },
  { stage: "j3", days: 3 },
  { stage: "j1", days: 1 },
  { stage: "j0", days: 0 },
];

const parisToday = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }); // YYYY-MM-DD

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
};

const frDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
};

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405 });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Authentification du planificateur
  const givenKey = req.headers.get("X-Reminders-Key") ??
    new URL(req.url).searchParams.get("key") ?? "";
  const { data: setting } = await db
    .from("cta_settings").select("value").eq("key", "reminders_key").maybeSingle();
  if (!setting || givenKey !== setting.value) {
    return new Response(JSON.stringify({ error: "Clé invalide" }), { status: 403 });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const replyTo = Deno.env.get("QUOTE_NOTIFY_EMAIL") || "contact@cta-auto.fr";
  const today = parisToday();

  const { data: partners } = await db
    .from("cta_partners").select("id,email,company_name,contact_name,phone,address");
  const byId = new Map((partners ?? []).map((p) => [p.id, p]));

  const report: Record<string, number> = { j7: 0, j3: 0, j1: 0, j0: 0 };
  let pending = 0;

  for (const { stage, days } of STAGES) {
    const target = addDays(today, days);
    const { data: interventions } = await db
      .from("cta_interventions")
      .select("id,partner_id,date,time_slot,type,equipment,location,notes")
      .eq("date", target)
      .eq("status", "planifiee");
    if (!interventions?.length) continue;

    const { data: already } = await db
      .from("cta_reminders").select("intervention_id")
      .eq("stage", stage)
      .in("intervention_id", interventions.map((i) => i.id));
    const sentIds = new Set((already ?? []).map((r) => r.intervention_id));

    for (const iv of interventions) {
      if (sentIds.has(iv.id)) continue;
      const partner = byId.get(iv.partner_id);
      if (!partner?.email) continue;
      if (!resendKey) { pending++; continue; }

      const place = iv.location || partner.address || "l'adresse convenue";
      const when = frDate(iv.date) + (iv.time_slot ? ` à ${iv.time_slot}` : "");
      const details =
        `• Prestation : ${iv.type}\n` +
        (iv.equipment ? `• Matériel : ${iv.equipment}\n` : "") +
        `• Date : ${when}\n` +
        `• Lieu : ${place}\n`;
      const cancelBlock =
        "Pour annuler ou déplacer ce rendez-vous : répondez simplement à cet " +
        "e-mail, appelez-nous, ou ouvrez un ticket depuis votre espace client.\n\n" +
        POLICY;

      let subject: string;
      let intro: string;
      if (stage === "j0") {
        subject = `Aujourd'hui : passage de votre technicien CTA${iv.time_slot ? " à " + iv.time_slot : ""}`;
        intro =
          `votre technicien CTA se présentera aujourd'hui${iv.time_slot ? ` à ${iv.time_slot}` : ""} ` +
          `à ${place}. Merci de prévoir l'accès au matériel et à l'atelier.`;
      } else if (stage === "j1") {
        subject = `Rappel : intervention CTA demain · ${when}`;
        intro =
          `votre intervention est prévue demain. C'est le dernier moment pour ` +
          `annuler ou déplacer sans facturation (24 h avant).`;
      } else if (stage === "j3") {
        subject = `Rappel : intervention CTA dans 3 jours · ${when}`;
        intro = "votre intervention approche, voici le récapitulatif.";
      } else {
        subject = `Rappel : intervention CTA dans une semaine · ${when}`;
        intro = "votre intervention est planifiée la semaine prochaine.";
      }

      const name = partner.contact_name || partner.company_name || "";
      const body =
        `Bonjour${name ? " " + name : ""},\n\n${intro}\n\n${details}\n${cancelBlock}\n\n` +
        `À très bientôt,\nCTA · Conseil Technique Auto\n${replyTo}`;

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "CTA · Conseil Technique Auto <onboarding@resend.dev>",
            to: [partner.email],
            reply_to: replyTo,
            subject,
            text: body,
          }),
        });
        if (!res.ok) {
          console.error("Resend a refusé l'envoi:", await res.text());
          continue;
        }
        await db.from("cta_reminders").insert({
          intervention_id: iv.id,
          stage,
          recipient: partner.email,
        });
        report[stage]++;
      } catch (e) {
        console.error("Envoi impossible:", e);
      }
    }
  }

  const summary = resendKey
    ? { ok: true, sent: report, date: today }
    : { ok: false, reason: "RESEND_API_KEY manquant : configurez le secret pour activer les rappels", pending, date: today };
  console.log(JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
