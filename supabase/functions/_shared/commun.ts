// Outils partagés par les fonctions serveur.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const APP_URL = Deno.env.get("APP_URL") ?? "";

/** En-têtes CORS : seule l'adresse de l'application est autorisée à appeler les fonctions. */
export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const autorise = APP_URL && origin === new URL(APP_URL).origin ? origin : (APP_URL ? new URL(APP_URL).origin : "*");
  return {
    "Access-Control-Allow-Origin": autorise,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function reponse(req: Request, corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Client avec la clé de service : contourne les règles d'accès. À n'utiliser qu'après vérification de l'appelant. */
export function clientService(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Appelant = { id: string; role: "admin" | "redacteur" | "valideur" | "lecteur"; nom: string; email: string };

/** Identifie l'utilisateur connecté à partir de son jeton ; renvoie null s'il est inconnu ou désactivé. */
export async function appelant(req: Request): Promise<Appelant | null> {
  const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jeton) return null;
  const service = clientService();
  const { data, error } = await service.auth.getUser(jeton);
  if (error || !data.user) return null;
  const { data: profil } = await service.from("profils")
    .select("id, role, nom, email, actif").eq("id", data.user.id).single();
  if (!profil || !profil.actif) return null;
  return { id: profil.id, role: profil.role, nom: profil.nom, email: profil.email };
}

export { APP_URL };
