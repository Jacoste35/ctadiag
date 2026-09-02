// Fonction Edge `sign-quote` · acceptation ou refus d'un devis depuis l'espace client.
// Signature électronique simple (art. 1366 et 1367 du Code civil) avec dossier de
// preuve constitué côté serveur : compte authentifié (JWT), nom saisi, horodatage
// serveur, adresse IP, navigateur et empreinte SHA-256 du contenu signé.
// Notifications e-mail (client + gérant) si RESEND_API_KEY est configurée.
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

const sha256 = async (text: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

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
  const documentId = String(body.document_id ?? "");
  const action = body.action === "refuse" ? "refuse" : "accept";
  const signedName = String(body.signed_name ?? "").trim().slice(0, 200);
  const refusalReason = String(body.refusal_reason ?? "").trim().slice(0, 1000);
  if (!documentId) return json({ error: "document_id manquant" }, 400);
  if (action === "accept" && signedName.length < 2) {
    return json({ error: "Le nom du signataire est obligatoire" }, 400);
  }

  const { data: doc } = await db
    .from("cta_documents").select("*").eq("id", documentId).maybeSingle();
  if (!doc || doc.partner_id !== userId) return json({ error: "Devis introuvable" }, 404);
  if (doc.kind !== "devis") return json({ error: "Seuls les devis peuvent être signés" }, 400);
  if (doc.status !== "en_attente") return json({ error: "Ce devis n'est plus en attente" }, 409);

  const signedAt = new Date().toISOString();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 400) || null;

  const hash = await sha256(JSON.stringify({
    document_id: doc.id,
    reference: doc.reference,
    label: doc.label,
    amount_ht: doc.amount_ht,
    issued_on: doc.issued_on,
    partner_id: doc.partner_id,
    action,
    signed_name: signedName || null,
    signed_at: signedAt,
  }));

  const { error: upErr } = await db.from("cta_documents").update({
    status: action === "accept" ? "accepte" : "refuse",
    signed_at: signedAt,
    signed_name: signedName || null,
    signed_ip: ip,
    signed_user_agent: userAgent,
    signature_hash: hash,
    refusal_reason: action === "refuse" ? (refusalReason || null) : null,
  }).eq("id", doc.id).eq("status", "en_attente");
  if (upErr) return json({ error: "Enregistrement impossible, réessayez" }, 500);

  // Notifications (facultatives)
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const notifyTo = Deno.env.get("QUOTE_NOTIFY_EMAIL") || "contact@cta-auto.fr";
  if (resendKey) {
    const { data: partner } = await db
      .from("cta_partners").select("email,company_name,contact_name").eq("id", userId).maybeSingle();
    const amount = doc.amount_ht == null ? "" : ` (${doc.amount_ht} € HT)`;
    const verdict = action === "accept" ? "accepté et signé" : "refusé";
    const proof =
      `Référence : ${doc.reference}${amount}\n` +
      `Décision : ${verdict}\n` +
      (signedName ? `Signataire : ${signedName}\n` : "") +
      `Horodatage : ${signedAt}\n` +
      (ip ? `Adresse IP : ${ip}\n` : "") +
      `Empreinte du document (SHA-256) : ${hash}\n`;
    const send = (to: string, subject: string, text: string) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "CTA · Conseil Technique Auto <onboarding@resend.dev>",
          to: [to], reply_to: notifyTo, subject, text,
        }),
      }).catch((e) => console.error("Notification impossible:", e));
    await send(notifyTo,
      `Devis ${doc.reference} ${verdict} · ${partner?.company_name ?? ""}`,
      `Le devis ${doc.reference} a été ${verdict} depuis l'espace client.\n\n${proof}` +
      (refusalReason ? `\nMotif du refus : ${refusalReason}\n` : ""));
    if (partner?.email) {
      await send(partner.email,
        action === "accept"
          ? `Confirmation : devis ${doc.reference} accepté`
          : `Confirmation : devis ${doc.reference} refusé`,
        `Bonjour${partner.contact_name ? " " + partner.contact_name : ""},\n\n` +
        (action === "accept"
          ? `Nous confirmons l'acceptation du devis ${doc.reference}. Cette acceptation en ligne vaut signature et « bon pour accord » ; le dossier de preuve ci-dessous est conservé.\n\n`
          : `Nous confirmons le refus du devis ${doc.reference}.\n\n`) +
        proof +
        `\nCTA · Conseil Technique Auto\n${notifyTo}`);
    }
  }

  return json({
    ok: true,
    status: action === "accept" ? "accepte" : "refuse",
    signed_at: signedAt,
    signature_hash: hash,
  });
});
