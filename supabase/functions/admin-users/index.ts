// Fonction Edge `admin-users` — gestion des comptes clients depuis le back-office.
// Réservée aux administrateurs (vérification du JWT + rôle dans cta_partners).
// Actions : create (nouveau client), set_password, delete.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Authentification de l'appelant + vérification du rôle admin
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Non authentifié" }, 401);
  const { data: caller } = await admin
    .from("cta_partners").select("role").eq("id", userData.user.id).single();
  if (caller?.role !== "admin") return json({ error: "Accès réservé à l'administrateur" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }

  const action = String(body.action ?? "");

  if (action === "create") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const companyName = String(body.company_name ?? "").trim().slice(0, 200);
    const contactName = String(body.contact_name ?? "").trim().slice(0, 200);
    const phone = String(body.phone ?? "").trim().slice(0, 40);
    const address = String(body.address ?? "").trim().slice(0, 400);
    const clientType = body.client_type === "distributeur" ? "distributeur" : "direct";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail invalide" }, 400);
    if (password.length < 6) return json({ error: "Mot de passe : 6 caractères minimum" }, 400);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { company_name: companyName },
    });
    if (error) return json({ error: error.message }, 400);

    // Le trigger a créé le profil ; on le complète
    await admin.from("cta_partners").update({
      company_name: companyName || email.split("@")[0],
      contact_name: contactName || null,
      phone: phone || null,
      address: address || null,
      client_type: clientType,
    }).eq("id", data.user.id);

    return json({ ok: true, id: data.user.id });
  }

  if (action === "set_password") {
    const userId = String(body.user_id ?? "");
    const password = String(body.password ?? "");
    if (!userId) return json({ error: "user_id manquant" }, 400);
    if (password.length < 6) return json({ error: "Mot de passe : 6 caractères minimum" }, 400);
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === "delete") {
    const userId = String(body.user_id ?? "");
    if (!userId) return json({ error: "user_id manquant" }, 400);
    if (userId === userData.user.id) return json({ error: "Impossible de supprimer votre propre compte" }, 400);
    const { data: target } = await admin
      .from("cta_partners").select("role").eq("id", userId).single();
    if (target?.role === "admin") return json({ error: "Impossible de supprimer un compte administrateur" }, 400);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Action inconnue" }, 400);
});
