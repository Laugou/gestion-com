import type {
  ActionAssistant, Canal, Commentaire, EntreeHistorique, Evenement, Notification, PieceJointe, Profil,
  Publication, PublicationSaisie, References, Role, Service, Statut, Stats,
} from "../types";

/** Erreur destinée à être affichée telle quelle à l'utilisateur. */
export class ErreurApp extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.code = code; }
}

export interface EtatMfa { actif: boolean; facteurId?: string }

/** Toutes les opérations de l'application passent par cette interface.
 *  Deux réalisations : Supabase (production) et démonstration (données fictives). */
export interface Api {
  readonly demo: boolean;

  // Session
  profilCourant(): Promise<Profil | null>;
  surSession(cb: (evenement: "connexion" | "deconnexion" | "recuperation") => void): () => void;
  connexion(email: string, motDePasse: string): Promise<{ mfaRequis: boolean }>;
  verifierMfa(code: string): Promise<void>;
  deconnexion(partout?: boolean): Promise<void>;
  motDePasseOublie(email: string): Promise<void>;
  definirMotDePasse(motDePasse: string): Promise<void>;
  sessionOuverte(): Promise<boolean>;
  mfaEtat(): Promise<EtatMfa>;
  mfaInscrire(): Promise<{ facteurId: string; qrSvg: string; secret: string }>;
  mfaConfirmer(facteurId: string, code: string): Promise<void>;
  mfaRetirer(facteurId: string): Promise<void>;
  majMonProfil(champs: { nom?: string; notif_email?: boolean }): Promise<void>;

  // Données
  references(): Promise<References>;
  publications(): Promise<Publication[]>;
  enregistrerPublication(p: PublicationSaisie): Promise<Publication>;
  changerEtape(id: string, statut: Statut, motif?: string): Promise<Publication>;
  supprimerPublication(id: string): Promise<void>;
  enregistrerStats(publicationId: string, canalId: number, stats: Stats): Promise<void>;

  historique(publicationId: string): Promise<EntreeHistorique[]>;
  commentaires(publicationId: string): Promise<Commentaire[]>;
  ajouterCommentaire(publicationId: string, texte: string): Promise<void>;
  supprimerCommentaire(id: string): Promise<void>;

  piecesJointes(publicationId: string): Promise<PieceJointe[]>;
  ajouterPieceJointe(publicationId: string, fichier: File): Promise<void>;
  lienPieceJointe(chemin: string): Promise<string>;
  supprimerPieceJointe(piece: PieceJointe): Promise<void>;

  evenements(): Promise<Evenement[]>;
  enregistrerEvenement(e: Partial<Evenement> & { titre: string; date_debut: string }): Promise<Evenement>;
  supprimerEvenement(id: string): Promise<void>;

  notifications(): Promise<Notification[]>;
  marquerLues(ids: number[] | "toutes"): Promise<void>;

  /** Appelé quand d'autres utilisateurs modifient les données. */
  surChangements(cb: (quoi: "publications" | "notifications") => void): () => void;

  // Administration
  inviter(email: string, nom: string, role: Role): Promise<void>;
  changerRole(id: string, role: Role): Promise<void>;
  activerCompte(id: string, actif: boolean): Promise<void>;
  supprimerCompte(id: string): Promise<void>;
  enregistrerService(s: Partial<Service> & { nom: string }): Promise<void>;
  enregistrerCanal(c: Partial<Canal> & { nom: string }): Promise<void>;

  // Assistant de rédaction (null si non configuré)
  assistant(action: ActionAssistant, donnees: { titre: string; texte: string; canaux: string[]; service?: string; date?: string }):
    Promise<{ texte: string; coupe: boolean }>;
}
