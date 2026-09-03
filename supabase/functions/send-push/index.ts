// Fonction Edge `send-push` · notifications push de l'application installée.
// Appelée par un trigger Postgres (pg_net) à chaque nouveau message de ticket :
//   - message d'un client  -> notification au(x) compte(s) administrateur(s)
//   - réponse CTA / bot    -> notification au client du ticket
// Auth par clé interne (X-Reminders-Key, table cta_settings), comme send-reminders.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: settingsRows } = await db
    .from("cta_settings").select("key,value")
    .in("key", ["reminders_key", "vapid_public_key", "vapid_private_key", "vapid_subject"]);
  const settings: Record<string, string> = {};
  for (const r of settingsRows ?? []) settings[r.key] = r.value;

  if (!settings.reminders_key || req.headers.get("X-Reminders-Key") !== settings.reminders_key) {
    return json({ error: "Non autorisé" }, 401);
  }
  if (!settings.vapid_public_key || !settings.vapid_private_key) {
    return json({ sent: 0, reason: "Clés VAPID absentes" });
  }
  webpush.setVapidDetails(
    settings.vapid_subject || "mailto:contact@cta-auto.fr",
    settings.vapid_public_key,
    settings.vapid_private_key,
  );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }
  if (body.event !== "ticket_message") return json({ sent: 0 });

  const ticketId = String(body.ticket_id ?? "");
  const author = String(body.author ?? "");
  const isAuto = body.is_auto === true;

  const { data: ticket } = await db
    .from("cta_tickets").select("id,subject,partner_id").eq("id", ticketId).maybeSingle();
  if (!ticket) return json({ sent: 0 });

  let targetIds: string[] = [];
  let title = "";
  let url = "";
  if (author === "partner") {
    const { data: admins } = await db.from("cta_partners").select("id").eq("role", "admin");
    targetIds = (admins ?? []).map((a) => a.id);
    const { data: partner } = await db
      .from("cta_partners").select("company_name,email").eq("id", ticket.partner_id).maybeSingle();
    title = `💬 ${partner?.company_name || partner?.email || "Client"}`;
    url = "/messagerie.html";
  } else {
    targetIds = [ticket.partner_id];
    title = isAuto ? "🤖 Réponse automatique CTA" : "🎧 Réponse de CTA";
    url = "/espace.html";
  }
  if (!targetIds.length) return json({ sent: 0 });

  const { data: subs } = await db
    .from("cta_push_subscriptions").select("*").in("partner_id", targetIds);
  if (!subs?.length) return json({ sent: 0 });

  const payload = JSON.stringify({
    title,
    body: ticket.subject,
    url,
    tag: "ticket-" + ticket.id,
  });

  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await db.from("cta_push_subscriptions").delete().eq("id", s.id);
      } else {
        console.error("Push échoué:", code, (e as Error).message);
      }
    }
  }
  return json({ sent });
});
