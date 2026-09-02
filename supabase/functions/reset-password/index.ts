// Fonction Edge `reset-password` · mot de passe oublié.
// Reçoit un e-mail ; si un compte existe, génère un mot de passe provisoire,
// l'applique au compte, marque « changement obligatoire à la connexion » et
// l'envoie par e-mail (Resend). Réponse identique qu'un compte existe ou non
// (pas d'énumération d'adresses). Nécessite le secret RESEND_API_KEY.
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

const tempPassword = () => {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return "cta-" + Array.from(bytes).map((b) => chars[b % chars.length]).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail invalide" }, 400);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ error: "Service de réinitialisation indisponible, contactez-nous" }, 503);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const generic = { ok: true, message: "Si un compte existe avec cette adresse, un e-mail vient d'être envoyé." };

  const { data: partner } = await admin
    .from("cta_partners").select("id,contact_name,company_name").eq("email", email).maybeSingle();
  if (!partner) return json(generic);

  const pass = tempPassword();
  const { error } = await admin.auth.admin.updateUserById(partner.id, { password: pass });
  if (error) {
    console.error("Réinitialisation impossible:", error.message);
    return json(generic);
  }
  await admin.from("cta_partners").update({ must_change_password: true }).eq("id", partner.id);

  const replyTo = Deno.env.get("QUOTE_NOTIFY_EMAIL") || "contact@cta-auto.fr";
  const name = partner.contact_name || partner.company_name || "";
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "CTA · Conseil Technique Auto <onboarding@resend.dev>",
        to: [email],
        reply_to: replyTo,
        subject: "Réinitialisation de votre mot de passe CTA",
        text:
          `Bonjour${name ? " " + name : ""},\n\n` +
          `Une réinitialisation de mot de passe a été demandée pour votre espace CTA.\n\n` +
          `Votre mot de passe provisoire : ${pass}\n\n` +
          `Connectez-vous avec ce mot de passe : il vous sera demandé d'en choisir un nouveau immédiatement.\n` +
          `Si vous n'êtes pas à l'origine de cette demande, contactez-nous : ${replyTo}\n\n` +
          `CTA · Conseil Technique Auto`,
      }),
    });
  } catch (e) {
    console.error("Envoi e-mail impossible:", e);
  }

  return json(generic);
});
