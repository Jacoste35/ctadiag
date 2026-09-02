// Fonction Edge `calendar` — flux iCalendar (ICS) des interventions CTA.
// Permet de s'abonner à l'agenda depuis un téléphone (iOS / Google Agenda).
// Accès par jeton secret (?t=...) vérifié dans cta_calendar_tokens :
// jeton « gérant » (partner_id null) = toutes les interventions + jours bloqués ;
// jeton client = uniquement ses interventions. Déployée avec verify_jwt=false,
// car les applications calendrier n'envoient aucun en-tête d'authentification.
import { createClient } from "npm:@supabase/supabase-js@2";

const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const dt = (date: string, time: string | null, addMinutes = 0) => {
  // Heure « flottante » locale (interprétée dans le fuseau du téléphone — France)
  const [h, m] = (time ?? "09:00").split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m + addMinutes);
  return date.replace(/-/g, "") + "T" +
    String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + "00";
};

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Méthode non autorisée", { status: 405 });
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(token)) return new Response("Jeton invalide", { status: 403 });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: tok } = await db
    .from("cta_calendar_tokens").select("partner_id").eq("token", token).maybeSingle();
  if (!tok) return new Response("Jeton inconnu", { status: 403 });

  let intervQuery = db.from("cta_interventions")
    .select("id,partner_id,date,time_slot,type,equipment,location,status,notes")
    .not("date", "is", null)
    .order("date", { ascending: true })
    .limit(500);
  if (tok.partner_id) intervQuery = intervQuery.eq("partner_id", tok.partner_id);
  const { data: interventions } = await intervQuery;

  const { data: partners } = await db
    .from("cta_partners").select("id,company_name,address,phone");
  const byId = new Map((partners ?? []).map((p) => [p.id, p]));

  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CTA Conseil Technique Auto//Agenda//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:CTA · Interventions",
    "X-WR-TIMEZONE:Europe/Paris",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  const STATUS_FR: Record<string, string> = {
    planifiee: "Planifiée", en_cours: "En cours", terminee: "Terminée", annulee: "Annulée",
  };

  for (const iv of interventions ?? []) {
    const partner = byId.get(iv.partner_id);
    const who = partner?.company_name ? ` — ${partner.company_name}` : "";
    const location = iv.location || partner?.address || "";
    const descParts = [
      iv.equipment ? `Matériel : ${iv.equipment}` : "",
      `Statut : ${STATUS_FR[iv.status] ?? iv.status}`,
      partner?.phone ? `Tél : ${partner.phone}` : "",
      iv.notes ? `Notes : ${iv.notes}` : "",
    ].filter(Boolean);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${iv.id}@cta-auto`,
      `DTSTAMP:${stamp}`,
      iv.time_slot
        ? `DTSTART:${dt(iv.date, iv.time_slot)}`
        : `DTSTART;VALUE=DATE:${iv.date.replace(/-/g, "")}`,
      iv.time_slot ? `DTEND:${dt(iv.date, iv.time_slot, 90)}` : "",
      `SUMMARY:${esc((iv.status === "annulee" ? "[Annulée] " : "") + iv.type + who)}`,
      location ? `LOCATION:${esc(location)}` : "",
      descParts.length ? `DESCRIPTION:${esc(descParts.join("\n"))}` : "",
      iv.status === "annulee" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  // Jours bloqués (agenda du gérant uniquement)
  if (!tok.partner_id) {
    const { data: blocked } = await db.from("blocked_dates").select("day,reason").limit(200);
    for (const b of blocked ?? []) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:blocked-${b.day}@cta-auto`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${b.day.replace(/-/g, "")}`,
        `SUMMARY:${esc("Indisponible" + (b.reason ? " — " + b.reason : ""))}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");
  return new Response(lines.filter(Boolean).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="cta-agenda.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
});
