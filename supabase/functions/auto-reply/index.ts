// Fonction Edge `auto-reply` · réponse automatique de la messagerie.
// Après un message client, on cherche une réponse type dont les mots-clés
// correspondent au message ; si une correspond, elle est postée immédiatement
// dans le ticket (marquée « réponse automatique ») et son compteur d'usage
// augmente. Les réponses types sont apprises par le gérant depuis la messagerie.
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

// Normalisation : minuscules, sans accents, apostrophes unifiées, espaces réduits
const norm = (s: string) =>
  s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’´`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

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
  const userId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }
  const ticketId = String(body.ticket_id ?? "");
  const message = String(body.message ?? "").slice(0, 5000);
  if (!ticketId || !message.trim()) return json({ matched: false });

  const { data: ticket } = await db
    .from("cta_tickets").select("id,partner_id").eq("id", ticketId).maybeSingle();
  if (!ticket || ticket.partner_id !== userId) return json({ error: "Ticket introuvable" }, 404);

  const { data: replies } = await db
    .from("cta_auto_replies").select("*").eq("enabled", true);
  const haystack = norm(message);

  let best: { id: string; reply: string; usage_count: number } | null = null;
  let bestScore = 0;
  for (const r of replies ?? []) {
    let score = 0;
    for (const kw of (r.keywords as string[] | null) ?? []) {
      const needle = norm(String(kw));
      if (needle.length >= 3 && haystack.includes(needle)) score += needle.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (!best) return json({ matched: false });

  const { error: insErr } = await db.from("cta_ticket_messages").insert({
    ticket_id: ticketId,
    author: "cta",
    author_id: null,
    body: best.reply,
    is_auto: true,
  });
  if (insErr) {
    console.error("Réponse automatique impossible:", insErr.message);
    return json({ matched: false });
  }
  await db.from("cta_auto_replies")
    .update({ usage_count: (best.usage_count ?? 0) + 1 })
    .eq("id", best.id);

  return json({ matched: true });
});
