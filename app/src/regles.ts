// Règles métier côté écran. Elles reprennent celles de la base (qui reste l'autorité :
// une action refusée ici le serait aussi par le serveur).
import type { Role, Statut } from "./types";

export const ETAPES: { id: Statut; libelle: string; court: string }[] = [
  { id: "idee", libelle: "Idée", court: "Idée" },
  { id: "redaction", libelle: "En rédaction", court: "Rédaction" },
  { id: "validation", libelle: "À valider", court: "À valider" },
  { id: "valide", libelle: "Validé", court: "Validé" },
  { id: "programme", libelle: "Programmé", court: "Programmé" },
  { id: "publie", libelle: "Publié", court: "Publié" },
  { id: "annule", libelle: "Annulé", court: "Annulé" },
];
export const ETAPES_CIRCUIT = ETAPES.filter((e) => e.id !== "annule");
export const libelleEtape = (s: Statut) => ETAPES.find((e) => e.id === s)?.libelle ?? s;

export const ROLES: { id: Role; libelle: string; description: string }[] = [
  { id: "admin", libelle: "Administrateur", description: "Tout gérer, y compris les comptes et les listes" },
  { id: "redacteur", libelle: "Rédacteur", description: "Créer, modifier, programmer, saisir les statistiques" },
  { id: "valideur", libelle: "Valideur", description: "Comme rédacteur, et valider ou renvoyer les publications" },
  { id: "lecteur", libelle: "Lecteur", description: "Consulter et commenter" },
];
export const libelleRole = (r: Role) => ROLES.find((x) => x.id === r)?.libelle ?? r;

const TRANSITIONS: [Statut, Statut][] = [
  ["idee", "redaction"], ["idee", "validation"], ["idee", "annule"],
  ["redaction", "idee"], ["redaction", "validation"], ["redaction", "annule"],
  ["validation", "redaction"],
  ["valide", "programme"], ["valide", "publie"], ["valide", "redaction"], ["valide", "validation"],
  ["programme", "publie"], ["programme", "valide"], ["programme", "validation"],
  ["annule", "idee"], ["annule", "redaction"],
];

export function transitionAutorisee(de: Statut, vers: Statut, role: Role | undefined): boolean {
  if (!role || de === vers) return de === vers;
  if (role === "admin") return true;
  if (role === "lecteur") return false;
  if (de === "validation" && vers === "valide") return role === "valideur";
  return TRANSITIONS.some(([a, b]) => a === de && b === vers);
}

export const peutEcrire = (r?: Role) => r === "admin" || r === "redacteur" || r === "valideur";
export const peutValider = (r?: Role) => r === "admin" || r === "valideur";

export const METRIQUES = [
  { id: "portee", libelle: "Portée" },
  { id: "interactions", libelle: "Interactions" },
  { id: "partages", libelle: "Partages" },
  { id: "clics", libelle: "Clics" },
] as const;
export type Metrique = (typeof METRIQUES)[number]["id"];
