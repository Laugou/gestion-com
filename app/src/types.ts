export type Role = "admin" | "redacteur" | "valideur" | "lecteur";
export type Statut = "idee" | "redaction" | "validation" | "valide" | "programme" | "publie" | "annule";

export interface Profil {
  id: string;
  nom: string;
  email: string;
  role: Role;
  actif: boolean;
  notif_email: boolean;
}

export interface Service { id: number; nom: string; couleur: string; ordre: number; actif: boolean }
/** Mode de diffusion d'un canal : « manuel » = l'équipe publie elle-même ; sinon envoi direct par la plateforme. */
export type TypePublication = "manuel" | "facebook" | "instagram";
export interface Canal { id: number; nom: string; couleur: string; limite_caracteres: number | null; ordre: number; actif: boolean; type_publication: TypePublication }

export interface Evenement {
  id: string;
  titre: string;
  date_debut: string;
  date_fin: string | null;
  lieu: string | null;
  service_id: number | null;
  description: string;
  cree_par: string | null;
}

export interface PubCanal {
  canal_id: number;
  texte_specifique: string | null;
  url_publication: string | null;
  portee: number | null;
  interactions: number | null;
  partages: number | null;
  clics: number | null;
  stats_saisies_le: string | null;
  /** Renseignés uniquement par le serveur lors d'une diffusion directe */
  publie_le?: string | null;
  erreur_publication?: string | null;
  tentatives?: number;
}

export interface ResultatDiffusion { reseau: "facebook" | "instagram"; reussi: boolean; message: string; url?: string }
export interface EtatReseau { configure: boolean; ok?: boolean; compte?: string; message?: string }

export interface Publication {
  id: string;
  titre: string;
  texte: string;
  service_id: number | null;
  evenement_id: string | null;
  statut: Statut;
  date_diffusion: string | null;
  heure_diffusion: string | null;
  redacteur_id: string | null;
  valideur_id: string | null;
  lien_visuel: string | null;
  notes: string;
  valide_par: string | null;
  valide_le: string | null;
  motif_retour: string | null;
  cree_par: string | null;
  cree_le: string;
  modifie_le: string;
  canaux: PubCanal[];
}

/** Ce que le formulaire envoie : les champs calculés par le serveur sont exclus. */
export type PublicationSaisie = Pick<Publication,
  "titre" | "texte" | "service_id" | "evenement_id" | "statut" | "date_diffusion" | "heure_diffusion" |
  "redacteur_id" | "valideur_id" | "lien_visuel" | "notes"> & {
  id?: string;
  modifie_le?: string;
  canaux: { canal_id: number; texte_specifique: string | null }[];
};

export interface Stats { portee: number | null; interactions: number | null; partages: number | null; clics: number | null; url_publication?: string | null }

export interface Commentaire { id: string; publication_id: string; auteur_id: string | null; texte: string; cree_le: string }
export interface EntreeHistorique {
  id: number; publication_id: string | null; titre_publication: string | null; auteur_id: string | null;
  action: string; ancien_statut: Statut | null; nouveau_statut: Statut | null; details: string | null; cree_le: string;
}
export interface PieceJointe { id: string; publication_id: string; chemin: string; nom_fichier: string; type_mime: string | null; taille: number | null; ajoute_par: string | null; ajoute_le: string }
export interface Notification { id: number; publication_id: string | null; type: string; message: string; lue: boolean; cree_le: string }

export interface References { services: Service[]; canaux: Canal[]; profils: Profil[] }

export type ActionAssistant = "reformuler" | "adapter" | "relire" | "court";
