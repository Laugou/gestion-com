// Publication directe sur la Page Facebook et le compte Instagram professionnel de la commune.
//
//   { action: "publier", publication_id }  bouton « Publier maintenant » (rédacteur, valideur, admin)
//   { action: "etat" }                     test de connexion aux comptes (admin)
//   { action: "programmation" }            tâche planifiée toutes les 5 min (en-tête x-cron-secret)
//
// Règle absolue : le serveur ne publie QUE une publication à l'étape « Validé » ou « Programmé ».
// Paramètres secrets : FB_PAGE_ID, FB_PAGE_TOKEN, IG_USER_ID (facultatif), GRAPH_VERSION (facultatif).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { appelant, clientService, cors, reponse } from "../_shared/commun.ts";

const GRAPH = `https://graph.facebook.com/${Deno.env.get("GRAPH_VERSION") || "v23.0"}`;
const PAGE_ID = Deno.env.get("FB_PAGE_ID") ?? "";
const JETON = Deno.env.get("FB_PAGE_TOKEN") ?? "";
const IG_ID = Deno.env.get("IG_USER_ID") ?? "";
const MAX_PAR_PASSAGE = 5;

type Reseau = "facebook" | "instagram";
type Resultat = { reseau: Reseau; reussi: boolean; message: string; url?: string };
class ErreurPublication extends Error {}

const configure = (r: Reseau) => r === "facebook" ? !!(PAGE_ID && JETON) : !!(IG_ID && JETON);
const NOM: Record<Reseau, string> = { facebook: "Facebook", instagram: "Instagram" };

// ---------------------------------------------------------------- Appels Meta
async function graph(chemin: string, params: Record<string, string>, methode: "GET" | "POST" = "POST") {
  const corps = new URLSearchParams({ ...params, access_token: JETON });
  const url = methode === "GET" ? `${GRAPH}/${chemin}?${corps}` : `${GRAPH}/${chemin}`;
  const r = await fetch(url, methode === "GET" ? {} : { method: "POST", body: corps });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) {
    const e = d.error ?? {};
    let msg = e.error_user_msg || e.message || `Erreur ${r.status}`;
    if (e.code === 190) msg = "Jeton d'accès Meta expiré ou révoqué : à renouveler par l'administrateur. " + msg;
    if (e.code === 10 || e.code === 200) msg = "Autorisation Meta manquante (permissions de l'application). " + msg;
    if (e.code === 4 || e.code === 32 || e.code === 613) msg = "Limite d'envoi Meta atteinte : nouvel essai plus tard. " + msg;
    throw new ErreurPublication(msg);
  }
  return d;
}

async function publierFacebook(texte: string, image: string | null): Promise<{ id: string; url: string }> {
  if (!texte && !image) throw new ErreurPublication("Ni texte ni visuel à publier.");
  const d = image
    ? await graph(`${PAGE_ID}/photos`, { url: image, caption: texte })
    : await graph(`${PAGE_ID}/feed`, { message: texte });
  const id: string = d.post_id || d.id;
  return { id, url: `https://www.facebook.com/${id}` };
}

async function publierInstagram(texte: string, image: string | null, mime: string | null): Promise<{ id: string; url: string }> {
  if (!image) throw new ErreurPublication("Instagram exige un visuel : joignez une image (JPEG) à la publication.");
  if (mime !== "image/jpeg") throw new ErreurPublication("Instagram n'accepte que les images JPEG : remplacez le visuel par un .jpg.");
  if (texte.length > 2200) throw new ErreurPublication("Texte trop long pour Instagram (2 200 caractères au maximum).");
  if ((texte.match(/#/g) ?? []).length > 30) throw new ErreurPublication("Instagram limite à 30 mots-dièse (#).");
  const conteneur = await graph(`${IG_ID}/media`, { image_url: image, caption: texte });
  // Instagram télécharge l'image puis prépare le média : on attend qu'il soit prêt (30 s au plus).
  for (let i = 0; i < 10; i++) {
    const s = await graph(conteneur.id, { fields: "status_code" }, "GET");
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED")
      throw new ErreurPublication("Instagram a refusé le visuel (format, poids ou proportions entre 4:5 et 1,91:1).");
    if (i === 9) throw new ErreurPublication("Instagram met trop de temps à préparer le visuel : nouvel essai plus tard.");
    await new Promise((ok) => setTimeout(ok, 3000));
  }
  const pub = await graph(`${IG_ID}/media_publish`, { creation_id: conteneur.id });
  let url = "";
  try { url = (await graph(pub.id, { fields: "permalink" }, "GET")).permalink ?? ""; } catch { /* lien facultatif */ }
  return { id: pub.id, url };
}

// ---------------------------------------------------------------- Diffusion d'une publication
async function diffuser(db: SupabaseClient, pubId: string, declenchement: "bouton" | "programmation", auteur: string | null) {
  const { data: pub } = await db.from("publications")
    .select("id, titre, texte, statut, valide_le, redacteur_id").eq("id", pubId).single();
  if (!pub) throw new ErreurPublication("Publication introuvable.");
  if (pub.statut !== "valide" && pub.statut !== "programme")
    throw new ErreurPublication("Seule une publication validée peut être diffusée.");

  const { data: tous, error } = await db.rpc("reserver_canaux", { p_publication: pubId });
  if (error) throw new Error(error.message);
  // Envoi automatique : un réseau pas encore connecté est ignoré sans compter d'échec ni alerter
  // (la publication partira dès la connexion, si sa date n'est pas dépassée de plus de 2 jours).
  let reserves = (tous ?? []) as { canal_id: number; type_publication: Reseau }[];
  if (declenchement === "programmation") {
    const ignores = reserves.filter((r) => !configure(r.type_publication)).map((r) => r.canal_id);
    if (ignores.length) await db.from("publication_canaux").update({ en_cours_depuis: null }).eq("publication_id", pubId).in("canal_id", ignores);
    reserves = reserves.filter((r) => configure(r.type_publication));
  }
  if (!reserves.length) return { resultats: [] as Resultat[], message: "Rien à envoyer : déjà diffusée sur les réseaux connectés, ou envoi en cours." };

  const { data: lignes } = await db.from("publication_canaux")
    .select("canal_id, texte_specifique, tentatives").eq("publication_id", pubId);

  // Visuel : la première image déposée AVANT la validation (une image ajoutée ensuite n'a pas été relue).
  let q = db.from("pieces_jointes").select("chemin, type_mime").eq("publication_id", pubId)
    .like("type_mime", "image/%").order("ajoute_le").limit(1);
  if (pub.valide_le) q = q.lte("ajoute_le", pub.valide_le);
  const { data: pj } = await q;
  let image: string | null = null;
  if (pj?.[0]) {
    const { data: s } = await db.storage.from("visuels").createSignedUrl(pj[0].chemin, 3600);
    image = s?.signedUrl ?? null;
  }

  const resultats: Resultat[] = [];
  for (const r of reserves) {
    const ligne = lignes?.find((l) => l.canal_id === r.canal_id);
    const texte = (ligne?.texte_specifique?.trim() || pub.texte || "").trim();
    let res: Resultat;
    try {
      if (!configure(r.type_publication)) throw new ErreurPublication(`${NOM[r.type_publication]} n'est pas encore connecté (paramètres Meta manquants).`);
      const f = r.type_publication === "facebook" ? await publierFacebook(texte, image) : await publierInstagram(texte, image, pj?.[0]?.type_mime ?? null);
      await db.from("publication_canaux").update({
        publie_le: new Date().toISOString(), id_externe: f.id, url_publication: f.url || null,
        erreur_publication: null, en_cours_depuis: null,
      }).eq("publication_id", pubId).eq("canal_id", r.canal_id);
      res = { reseau: r.type_publication, reussi: true, message: "Publié", url: f.url };
    } catch (e) {
      const message = e instanceof ErreurPublication ? e.message : "Erreur technique : " + (e as Error).message;
      await db.from("publication_canaux").update({
        erreur_publication: message.slice(0, 1000), tentatives: (ligne?.tentatives ?? 0) + 1, en_cours_depuis: null,
      }).eq("publication_id", pubId).eq("canal_id", r.canal_id);
      res = { reseau: r.type_publication, reussi: false, message };
    }
    resultats.push(res);
    await db.from("journal_publications").insert({
      publication_id: pubId, titre: pub.titre, canal: r.type_publication, declenchement,
      auteur_id: auteur, reussi: res.reussi, message: (res.url || res.message).slice(0, 1000),
    });
  }

  // Tous les canaux sont connectés et diffusés : la publication passe « Publié ».
  const { data: etat } = await db.from("publication_canaux")
    .select("publie_le, canaux!inner(type_publication)").eq("publication_id", pubId);
  const toutFait = etat?.length && etat.every((l) => l.publie_le && (l.canaux as unknown as { type_publication: string }).type_publication !== "manuel");
  if (toutFait) await db.from("publications").update({ statut: "publie" }).eq("id", pubId);

  // Prévenir le rédacteur en cas d'échec (le bouton affiche déjà le résultat à celui qui clique).
  const echecs = resultats.filter((r) => !r.reussi);
  if (echecs.length && pub.redacteur_id && (declenchement === "programmation" || pub.redacteur_id !== auteur)) {
    await db.from("notifications").insert({
      destinataire_id: pub.redacteur_id, publication_id: pubId, type: "echec_diffusion",
      message: `Échec de diffusion de « ${pub.titre} » : ` + echecs.map((e) => `${NOM[e.reseau]} — ${e.message}`).join(" ; ").slice(0, 900),
    });
  }
  return { resultats, message: echecs.length ? "Diffusion incomplète" : "Diffusion réussie" };
}

// ---------------------------------------------------------------- Point d'entrée
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reponse(req, { erreur: "Méthode non autorisée." }, 405);
  let corps: Record<string, string>;
  try { corps = await req.json(); } catch { return reponse(req, { erreur: "Requête illisible." }, 400); }
  const db = clientService();

  // Tâche planifiée : authentifiée par un secret conservé dans le coffre (Vault) de la base.
  if (corps.action === "programmation") {
    const secret = req.headers.get("x-cron-secret") ?? "";
    const { data: ok } = await db.rpc("verifier_secret_cron", { p_secret: secret });
    if (!ok) return reponse(req, { erreur: "Accès refusé." }, 403);
    const { data: dues } = await db.rpc("publications_a_diffuser");
    const bilan = [];
    for (const d of (dues ?? []).slice(0, MAX_PAR_PASSAGE)) {
      try { bilan.push({ id: d.publication_id, ...(await diffuser(db, d.publication_id, "programmation", null)) }); }
      catch (e) { bilan.push({ id: d.publication_id, erreur: (e as Error).message }); }
    }
    return reponse(req, { ok: true, traitees: bilan.length, bilan });
  }

  const moi = await appelant(req);
  if (!moi) return reponse(req, { erreur: "Session expirée : reconnectez-vous." }, 401);

  if (corps.action === "etat") {
    if (moi.role !== "admin") return reponse(req, { erreur: "Action réservée aux administrateurs." }, 403);
    const etat: Record<string, unknown> = {};
    for (const r of ["facebook", "instagram"] as Reseau[]) {
      if (!configure(r)) { etat[r] = { configure: false, message: "Non connecté (paramètres absents)" }; continue; }
      try {
        const d = r === "facebook"
          ? await graph(PAGE_ID, { fields: "name" }, "GET")
          : await graph(IG_ID, { fields: "username" }, "GET");
        etat[r] = { configure: true, ok: true, compte: d.name ?? "@" + d.username };
      } catch (e) { etat[r] = { configure: true, ok: false, message: (e as Error).message }; }
    }
    return reponse(req, etat);
  }

  if (corps.action === "publier") {
    if (!["admin", "redacteur", "valideur"].includes(moi.role))
      return reponse(req, { erreur: "Votre rôle ne permet pas de publier." }, 403);
    if (!/^[0-9a-f-]{36}$/i.test(corps.publication_id ?? "")) return reponse(req, { erreur: "Publication inconnue." }, 400);
    try { return reponse(req, await diffuser(db, corps.publication_id, "bouton", moi.id)); }
    catch (e) { return reponse(req, { erreur: (e as Error).message }, e instanceof ErreurPublication ? 400 : 500); }
  }
  return reponse(req, { erreur: "Action inconnue." }, 400);
});
