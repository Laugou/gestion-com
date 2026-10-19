// Assistant de rédaction (facultatif) : reformuler, adapter aux canaux, relire, raccourcir.
// Utilise l'API Claude d'Anthropic. Sans clé ANTHROPIC_API_KEY, la fonction répond
// « non configuré » et l'application masque les boutons.
// Coût : facturé à l'usage sur le compte Anthropic de la commune ; fixer un plafond
// de dépense mensuel dans la console Anthropic.
import { appelant, cors, reponse } from "../_shared/commun.ts";

const CONTEXTE = `Tu aides le service communication de la Commune de Cabannes (Bouches-du-Rhône).
Ton : institutionnel, chaleureux, accessible à tous les habitants, sans jargon.
Règles impératives :
- français correct, typographie française (espace avant : ; ! ?, dates « samedi 14 décembre ») ;
- n'invente AUCUNE information (date, lieu, horaire, prix, nom) absente du texte fourni ;
  si une information utile manque, écris-la entre crochets, par exemple [heure à préciser] ;
- aucune prise de position partisane ;
- emojis seulement pour Facebook et Instagram, avec modération.`;

const CONSIGNES_CANAUX: Record<string, string> = {
  "Facebook": "Facebook : 1 à 3 paragraphes courts, appel à l'action clair.",
  "Instagram": "Instagram : accroche en première ligne, 2 200 caractères maximum, quelques hashtags locaux à la fin.",
  "Site internet": "Site internet : titre + chapô + texte informatif, sans emoji.",
  "Cabannes Actu": "Cabannes Actu (bulletin municipal) : article court avec titre, ton éditorial, sans emoji.",
  "Panneau lumineux": "Panneau lumineux : quelques lignes très courtes, l'essentiel uniquement (quoi, quand, où).",
  "Affichage": "Affichage : titre accrocheur + informations pratiques en liste.",
  "Presse locale": "Presse locale : communiqué à la troisième personne, titre, informations pratiques, contact presse [à compléter].",
};

const DEMANDES: Record<string, (canaux: string[]) => string> = {
  reformuler: () => "Reformule ce texte pour le rendre plus clair et plus engageant, sans perdre d'information. Réponds uniquement avec le texte reformulé.",
  court: () => "Écris une version courte (280 caractères maximum) avec l'essentiel : quoi, quand, où. Réponds uniquement avec ce texte.",
  relire: () => "Relis ce texte. Donne la version corrigée (orthographe, grammaire, typographie) après la ligne « Version corrigée : », puis sous « Remarques : » la liste des points à vérifier ou des informations manquantes.",
  adapter: (canaux) => "Rédige une version du message pour chacun de ces canaux, en respectant ces consignes :\n" +
    canaux.map((c) => CONSIGNES_CANAUX[c] ?? `${c} : adapte le format au support.`).join("\n") +
    "\nSépare chaque version par une ligne de titre en majuscules portant le nom du canal.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const cle = Deno.env.get("ANTHROPIC_API_KEY");
  if (!cle) return reponse(req, { erreur: "non_configure" }, 501);

  const moi = await appelant(req);
  if (!moi) return reponse(req, { erreur: "Session expirée : reconnectez-vous." }, 401);
  if (moi.role === "lecteur") return reponse(req, { erreur: "Assistant réservé aux rédacteurs et valideurs." }, 403);

  const c = await req.json().catch(() => ({}));
  const action = String(c.action ?? "");
  if (!DEMANDES[action]) return reponse(req, { erreur: "Action inconnue." }, 400);
  const texte = String(c.texte ?? "").slice(0, 8000);
  const titre = String(c.titre ?? "").slice(0, 200);
  if (!texte.trim() && !titre.trim()) return reponse(req, { erreur: "Écrivez au moins un titre ou un brouillon." }, 400);
  const canaux = Array.isArray(c.canaux) && c.canaux.length ? c.canaux.map(String).slice(0, 12) : ["Facebook"];

  const consigne = `${DEMANDES[action](canaux)}

Titre interne : ${titre || "(aucun)"}
Service : ${String(c.service ?? "(non précisé)").slice(0, 80)}
Date de diffusion prévue : ${String(c.date ?? "(non précisée)").slice(0, 40)}

Texte actuel :
${texte || "(vide : rédige à partir du titre)"}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": cle, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("ASSISTANT_MODELE") ?? "claude-sonnet-5-5",
      max_tokens: 2000,
      system: CONTEXTE,
      messages: [{ role: "user", content: consigne }],
    }),
  });
  if (!r.ok) {
    const statut = r.status === 429 ? 429 : 502;
    return reponse(req, { erreur: statut === 429 ? "Trop de demandes : réessayez dans une minute." : "L'assistant n'a pas répondu. Réessayez." }, statut);
  }
  const d = await r.json();
  const sortie = (d.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n").trim();
  return reponse(req, { texte: sortie, coupe: d.stop_reason === "max_tokens" });
});
