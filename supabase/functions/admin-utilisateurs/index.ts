// Gestion des comptes, réservée aux administrateurs :
//   inviter      { email, nom, role }      envoie un courriel d'invitation
//   desactiver   { user_id }               bloque la connexion (les données restent)
//   reactiver    { user_id }
//   supprimer    { user_id }               efface le compte (droit à l'effacement RGPD)
import { appelant, clientService, cors, reponse, APP_URL } from "../_shared/commun.ts";

const ROLES = ["admin", "redacteur", "valideur", "lecteur"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reponse(req, { erreur: "Méthode non autorisée." }, 405);

  const moi = await appelant(req);
  if (!moi) return reponse(req, { erreur: "Session expirée : reconnectez-vous." }, 401);
  if (moi.role !== "admin") return reponse(req, { erreur: "Action réservée aux administrateurs." }, 403);

  let corps: Record<string, string>;
  try { corps = await req.json(); } catch { return reponse(req, { erreur: "Requête illisible." }, 400); }
  const service = clientService();

  switch (corps.action) {
    case "inviter": {
      const email = String(corps.email ?? "").trim().toLowerCase();
      const nom = String(corps.nom ?? "").trim().slice(0, 120);
      const role = String(corps.role ?? "lecteur");
      if (!EMAIL.test(email)) return reponse(req, { erreur: "Adresse électronique invalide." }, 400);
      if (!ROLES.includes(role)) return reponse(req, { erreur: "Rôle inconnu." }, 400);
      const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
        data: { nom },
        redirectTo: `${APP_URL}/#/definir-mot-de-passe`,
      });
      if (error) {
        const deja = /already|registered|exists/i.test(error.message);
        return reponse(req, { erreur: deja ? "Un compte existe déjà avec cette adresse." : "Invitation impossible : " + error.message }, 400);
      }
      const { error: e2 } = await service.from("profils").update({ role, nom: nom || undefined }).eq("id", data.user.id);
      if (e2) return reponse(req, { erreur: "Compte créé mais rôle non enregistré : " + e2.message }, 500);
      return reponse(req, { ok: true, id: data.user.id });
    }
    case "desactiver":
    case "reactiver": {
      const id = String(corps.user_id ?? "");
      if (!id) return reponse(req, { erreur: "Compte non précisé." }, 400);
      if (id === moi.id) return reponse(req, { erreur: "Vous ne pouvez pas désactiver votre propre compte." }, 400);
      const actif = corps.action === "reactiver";
      const { error } = await service.from("profils").update({ actif }).eq("id", id);
      if (error) return reponse(req, { erreur: error.message }, 400);
      // « ban » : empêche toute nouvelle connexion et le renouvellement des sessions ouvertes.
      const { error: e2 } = await service.auth.admin.updateUserById(id, { ban_duration: actif ? "none" : "876000h" });
      if (e2) return reponse(req, { erreur: "Profil mis à jour mais blocage de connexion impossible : " + e2.message }, 500);
      return reponse(req, { ok: true });
    }
    case "supprimer": {
      const id = String(corps.user_id ?? "");
      if (!id || id === moi.id) return reponse(req, { erreur: "Suppression impossible pour ce compte." }, 400);
      const { data: p } = await service.from("profils").select("role, actif").eq("id", id).single();
      if (p?.role === "admin" && p.actif) {
        const { count } = await service.from("profils").select("id", { count: "exact", head: true })
          .eq("role", "admin").eq("actif", true);
        if ((count ?? 0) <= 1) return reponse(req, { erreur: "Il doit rester au moins un administrateur actif." }, 400);
      }
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) return reponse(req, { erreur: error.message }, 400);
      return reponse(req, { ok: true });
    }
    default:
      return reponse(req, { erreur: "Action inconnue." }, 400);
  }
});
