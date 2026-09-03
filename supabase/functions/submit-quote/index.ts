// Fonction Edge `submit-quote` · réception des demandes de devis du site CTA.
// Valide la demande, l'enregistre dans public.quote_requests (service role),
// puis notifie par e-mail si RESEND_API_KEY est configurée (facultatif).
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

const ALLOWED_SERVICES = [
  "Diagnostic Autel",
  "Station ATF",
  "Calibration ADAS",
  "Mise en service à distance",
  "Autre",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }

  // Honeypot anti-spam : champ invisible rempli par les robots.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return json({ ok: true });
  }

  const name = String(body.name ?? "").trim().slice(0, 200);
  const contact = String(body.contact ?? "").trim().slice(0, 200);
  const firstName = String(body.first_name ?? "").trim().slice(0, 100);
  const lastName = String(body.last_name ?? "").trim().slice(0, 100);
  const phone = String(body.phone ?? "").trim().slice(0, 40);
  const address = String(body.address ?? "").trim().slice(0, 300);
  const postalCode = String(body.postal_code ?? "").trim().slice(0, 12);
  const message = String(body.message ?? "").trim().slice(0, 5000);
  const consent = body.consent === true;
  const services = Array.isArray(body.services)
    ? body.services.map(String).filter((s) => ALLOWED_SERVICES.includes(s))
    : [];
  const rdvDay =
    typeof body.rdv_day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.rdv_day)
      ? body.rdv_day
      : null;
  const rdvSlot =
    typeof body.rdv_slot === "string" && /^\d{2}:\d{2}$/.test(body.rdv_slot)
      ? body.rdv_slot
      : null;
  const clientKind =
    body.client_kind === "garage" || body.client_kind === "distributeur"
      ? body.client_kind
      : null;

  if (!name || !contact) {
    return json({ error: "Nom / société et contact sont obligatoires" }, 400);
  }
  if (!consent) {
    return json({ error: "Le consentement RGPD est obligatoire" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await supabase.from("quote_requests").insert({
    name,
    contact,
    first_name: firstName || null,
    last_name: lastName || null,
    phone: phone || null,
    address: address || null,
    postal_code: postalCode || null,
    services,
    rdv_day: rdvDay,
    rdv_slot: rdvSlot,
    message,
    consent,
    client_kind: clientKind,
  });
  if (error) {
    console.error("Insertion échouée:", error.message);
    return json({ error: "Enregistrement impossible, réessayez plus tard" }, 500);
  }

  // Notification e-mail facultative (Resend). Configurer les secrets :
  //   supabase secrets set RESEND_API_KEY=... QUOTE_NOTIFY_EMAIL=contact@cta-auto.fr
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const notifyTo = Deno.env.get("QUOTE_NOTIFY_EMAIL");
  if (resendKey && notifyTo) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Site CTA <onboarding@resend.dev>",
          to: [notifyTo],
          subject: `Nouvelle demande de devis · ${name}`,
          text:
            `Société : ${name}\nContact : ${[firstName, lastName].filter(Boolean).join(" ") || "?"}\n` +
            `Téléphone : ${phone || "?"}\nE-mail : ${contact}\n` +
            `Adresse : ${[address, postalCode].filter(Boolean).join(", ") || "non précisée"}\n` +
            `Profil : ${clientKind === "distributeur" ? "Distributeur" : clientKind === "garage" ? "Garage" : "non précisé"}\n` +
            `Prestations : ${services.join(", ") || "non précisées"}\n` +
            `Rendez-vous souhaité : ${rdvDay ? `${rdvDay}${rdvSlot ? ` à ${rdvSlot}` : ""}` : "aucun"}\n\n${message}`,
        }),
      });
    } catch (e) {
      console.error("Notification e-mail échouée:", e);
    }
  }

  return json({ ok: true });
});
