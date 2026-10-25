// Version de démonstration : mêmes écrans, données fictives conservées dans ce navigateur.
// Elle reproduit les règles de la base (circuit de validation, droits par rôle) pour qu'on
// puisse essayer chaque rôle sans serveur.
import type { Api } from "./api";
import { ErreurApp } from "./api";
import type {
  Canal, Commentaire, EntreeHistorique, Evenement, Notification, PieceJointe, Profil, Publication, Role, Service, Statut, ResultatDiffusion,
} from "../types";
import { ajouterJours, aujourdhui, ecrireStockage, lireStockage } from "../lib/outils";
import { peutEcrire, peutValider, transitionAutorisee } from "../regles";

interface Base {
  version: number;
  moi: string | null;
  profils: Profil[];
  services: Service[];
  canaux: Canal[];
  evenements: Evenement[];
  publications: Publication[];
  commentaires: Commentaire[];
  historique: EntreeHistorique[];
  pieces: (PieceJointe & { dataUrl?: string })[];
  notifications: (Notification & { destinataire_id: string })[];
  compteur: number;
}

const CLE = "gc-demo-v4";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const maintenant = () => new Date().toISOString();

function baseInitiale(): Base {
  const t = aujourdhui();
  const P: Profil[] = [
    { id: "u-admin", nom: "Responsable VACC", email: "responsable.vacc@exemple.fr", role: "admin", actif: true, notif_email: true },
    { id: "u-redac", nom: "Agent communication", email: "communication@exemple.fr", role: "redacteur", actif: true, notif_email: true },
    { id: "u-elu", nom: "Élu délégué", email: "elu@exemple.fr", role: "valideur", actif: true, notif_email: true },
    { id: "u-lect", nom: "Direction générale", email: "dgs@exemple.fr", role: "lecteur", actif: true, notif_email: false },
  ];
  const S: Service[] = ["Culture", "Festivités", "Sports", "Vie associative", "Institutionnel"]
    .map((nom, i) => ({ id: i + 1, nom, couleur: ["#7A5AC8", "#D9722B", "#24806F", "#3B6FD6", "#1A3C6E"][i], ordre: i + 1, actif: true }));
  const C: Canal[] = [
    ["Facebook", "#3B6FD6", null], ["Instagram", "#C2477E", 2200], ["Site internet", "#24806F", null],
    ["Cabannes Actu", "#C8A84B", null], ["Panneau lumineux", "#D9722B", null], ["Affichage", "#7A5AC8", null], ["Presse locale", "#6B7A90", null],
  ].map(([nom, couleur, lim], i) => ({ id: i + 1, nom: nom as string, couleur: couleur as string, limite_caracteres: lim as number | null, ordre: i + 1, actif: true,
    type_publication: (i === 0 ? "facebook" : i === 1 ? "instagram" : "manuel") as Canal["type_publication"] }));
  const E: Evenement[] = [
    { id: "e-noel", titre: "Marché de Noël", date_debut: ajouterJours(t, 40), date_fin: ajouterJours(t, 41), lieu: "Place de la mairie", service_id: 2, description: "Exemple d'événement", cree_par: "u-admin" },
    { id: "e-telethon", titre: "Téléthon", date_debut: ajouterJours(t, 47), date_fin: null, lieu: "Salle des fêtes", service_id: 4, description: "", cree_par: "u-admin" },
  ];
  const stats = (po: number, it: number, pa: number, cl: number) => ({ portee: po, interactions: it, partages: pa, clics: cl, stats_saisies_le: maintenant() });
  const vide = { portee: null, interactions: null, partages: null, clics: null, stats_saisies_le: null };
  const c = (id: number, s: Partial<Publication["canaux"][0]> = vide) => ({ canal_id: id, texte_specifique: null, url_publication: null, ...vide, ...s });
  const pub = (o: Partial<Publication> & { titre: string }): Publication => ({
    id: uid(), texte: "", service_id: null, evenement_id: null, statut: "idee", date_diffusion: null, heure_diffusion: null,
    redacteur_id: "u-redac", valideur_id: null, lien_visuel: null, notes: "", valide_par: null, valide_le: null, motif_retour: null,
    cree_par: "u-redac", cree_le: maintenant(), modifie_le: maintenant(), canaux: [], ...o,
  });
  const Pu: Publication[] = [
    pub({ titre: "Journées du patrimoine", service_id: 1, statut: "publie", date_diffusion: ajouterJours(t, -34), heure_diffusion: "18:00:00", texte: "Les Journées européennes du patrimoine reviennent. Programme des visites [à compléter].", valide_par: "u-elu", valide_le: maintenant(), canaux: [c(1, stats(2100, 164, 31, 58)), c(2, stats(980, 122, 9, 0)), c(3, stats(410, 0, 0, 0))] }),
    pub({ titre: "Retour en images : forum des associations", service_id: 4, statut: "publie", date_diffusion: ajouterJours(t, -41), heure_diffusion: "12:00:00", texte: "Merci aux associations et aux visiteurs venus nombreux au forum !", canaux: [c(1, stats(1650, 203, 18, 12)), c(4)] }),
    pub({ titre: "Octobre rose : marche solidaire", service_id: 3, statut: "publie", date_diffusion: ajouterJours(t, -14), heure_diffusion: "10:00:00", texte: "Marche solidaire Octobre rose, départ [lieu et heure à préciser].", canaux: [c(1, stats(1480, 96, 22, 17)), c(2, stats(720, 84, 5, 0)), c(5)] }),
    pub({ titre: "Cabannes Actu — numéro du mois", service_id: 5, statut: "publie", date_diffusion: ajouterJours(t, -7), texte: "Le nouveau numéro de Cabannes Actu est disponible.", canaux: [c(4), c(3)] }),
    pub({ titre: "Animation Halloween pour les enfants", service_id: 2, statut: "validation", date_diffusion: ajouterJours(t, 2), heure_diffusion: "18:00:00", texte: "Petits monstres et sorcières sont attendus ! [horaires et lieu à préciser]", valideur_id: "u-elu", canaux: [c(1), c(2)] }),
    pub({ titre: "Spectacle de la saison culturelle", service_id: 1, statut: "programme", date_diffusion: ajouterJours(t, 4), heure_diffusion: "11:30:00", texte: "La saison culturelle continue ! Rendez-vous [date, lieu, tarif à préciser].", valide_par: "u-elu", valide_le: maintenant(), canaux: [c(1), c(2), c(7)] }),
    pub({ titre: "Cérémonie du 11 Novembre", service_id: 5, statut: "redaction", date_diffusion: ajouterJours(t, 18), texte: "Commémoration de l'Armistice du 11 novembre 1918. [heure et lieu du rassemblement à préciser]", canaux: [c(1), c(3), c(5), c(6)] }),
    pub({ titre: "Marché de Noël : appel aux exposants", service_id: 2, evenement_id: "e-noel", statut: "redaction", date_diffusion: ajouterJours(t, 6), texte: "Artisans et créateurs, inscrivez-vous pour le marché de Noël !", canaux: [c(1), c(3)] }),
    pub({ titre: "Téléthon : appel aux associations", service_id: 4, evenement_id: "e-telethon", statut: "idee", notes: "Recenser les associations participantes.", canaux: [c(1)] }),
  ];
  return {
    version: 3, moi: null, profils: P, services: S, canaux: C, evenements: E, publications: Pu,
    commentaires: [], historique: Pu.map((p, i) => ({ id: i + 1, publication_id: p.id, titre_publication: p.titre, auteur_id: p.cree_par, action: "creation", ancien_statut: null, nouveau_statut: p.statut, details: null, cree_le: p.cree_le })),
    pieces: [],
    notifications: [{ id: 1, destinataire_id: "u-elu", publication_id: Pu[4].id, type: "a_valider", message: "Agent communication vous demande de valider « Animation Halloween pour les enfants ».", lue: false, cree_le: maintenant() }],
    compteur: 100,
  };
}

export function creerApiDemo(): Api {
  let db: Base = lireStockage<Base | null>(CLE, null) ?? baseInitiale();
  if (db.version !== 3) db = baseInitiale();
  const ecouteursSession = new Set<(e: "connexion" | "deconnexion" | "recuperation") => void>();
  const ecouteursDonnees = new Set<(q: "publications" | "notifications") => void>();
  const sauver = () => ecrireStockage(CLE, { ...db, pieces: db.pieces.map(({ dataUrl, ...p }) => ({ ...p, dataUrl: dataUrl && dataUrl.length < 400_000 ? dataUrl : undefined })) });
  const attendre = () => new Promise((r) => setTimeout(r, 120));
  const copie = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

  const moi = () => {
    const p = db.profils.find((x) => x.id === db.moi && x.actif);
    if (!p) throw new ErreurApp("Votre session a expiré : reconnectez-vous.", "session");
    return p;
  };
  const exiger = (cond: boolean, msg = "Action non autorisée pour votre rôle.") => { if (!cond) throw new ErreurApp(msg, "droits"); };
  const nom = (id: string | null) => db.profils.find((p) => p.id === id)?.nom ?? "Quelqu'un";
  const notifier = (dest: string | null, pid: string | null, type: string, message: string) => {
    if (!dest || dest === db.moi || !db.profils.find((p) => p.id === dest && p.actif)) return;
    db.notifications.unshift({ id: ++db.compteur, destinataire_id: dest, publication_id: pid, type, message, lue: false, cree_le: maintenant() });
  };
  const tracer = (p: Publication, action: string, ancien: Statut | null, nouveau: Statut | null, details: string | null = null) =>
    db.historique.unshift({ id: ++db.compteur, publication_id: p.id, titre_publication: p.titre, auteur_id: db.moi, action, ancien_statut: ancien, nouveau_statut: nouveau, details, cree_le: maintenant() });

  function apresChangementEtape(p: Publication, ancien: Statut | null) {
    const auteur = nom(db.moi);
    if (p.statut === "validation" && ancien !== "validation") {
      const dests = p.valideur_id ? [p.valideur_id] : db.profils.filter((x) => x.actif && (x.role === "valideur" || x.role === "admin")).map((x) => x.id);
      dests.forEach((d) => notifier(d, p.id, "a_valider", `${auteur} demande une validation pour « ${p.titre} ».`));
    } else if (ancien === "validation" && p.statut === "valide") {
      notifier(p.redacteur_id, p.id, "validee", `« ${p.titre} » a été validée par ${auteur}.`);
    } else if (ancien === "validation" && p.statut === "redaction") {
      notifier(p.redacteur_id, p.id, "renvoyee", `« ${p.titre} » vous est renvoyée par ${auteur}${p.motif_retour ? " : " + p.motif_retour : "."}`);
    }
  }

  function appliquerEtape(p: Publication, vers: Statut, role: Role) {
    const de = p.statut;
    if (de === vers) return;
    exiger(transitionAutorisee(de, vers, role), `Changement d'étape non autorisé (${de} vers ${vers}) pour votre rôle.`);
    if (vers === "valide" && de === "validation") { p.valide_par = db.moi; p.valide_le = maintenant(); p.motif_retour = null; }
    else if (["idee", "redaction", "validation", "annule"].includes(vers)) { p.valide_par = null; p.valide_le = null; }
    if (vers === "validation") p.motif_retour = null;
    p.statut = vers;
  }

  const signaler = (q: "publications" | "notifications") => { sauver(); ecouteursDonnees.forEach((cb) => cb(q)); };

  const api: Api = {
    demo: true,
    async profilCourant() { return copie(db.profils.find((p) => p.id === db.moi && p.actif) ?? null); },
    surSession(cb) { ecouteursSession.add(cb); return () => ecouteursSession.delete(cb); },
    async sessionOuverte() { return !!db.moi; },
    async connexion(email) {
      await attendre();
      const p = db.profils.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!p) throw new ErreurApp("Adresse ou mot de passe incorrect.", "identifiants");
      if (!p.actif) throw new ErreurApp("Ce compte est désactivé. Contactez l'administrateur.", "identifiants");
      db.moi = p.id; sauver(); ecouteursSession.forEach((cb) => cb("connexion"));
      return { mfaRequis: false };
    },
    async verifierMfa() { /* sans objet en démonstration */ },
    async deconnexion() { db.moi = null; sauver(); ecouteursSession.forEach((cb) => cb("deconnexion")); },
    async motDePasseOublie() { await attendre(); },
    async definirMotDePasse() { await attendre(); },
    async mfaEtat() { return { actif: false }; },
    async mfaInscrire() { throw new ErreurApp("La double authentification n'est pas disponible en démonstration."); },
    async mfaConfirmer() { /* */ },
    async mfaRetirer() { /* */ },
    async majMonProfil(champs) { const p = moi(); Object.assign(p, champs); sauver(); },

    async references() { await attendre(); return copie({ services: db.services, canaux: db.canaux, profils: db.profils }); },
    async publications() { await attendre(); moi(); return copie(db.publications); },
    async enregistrerPublication(s) {
      const m = moi(); exiger(peutEcrire(m.role)); await attendre();
      let p: Publication;
      if (s.id) {
        const ex = db.publications.find((x) => x.id === s.id);
        if (!ex) throw new ErreurApp("Publication introuvable.");
        if (s.modifie_le && ex.modifie_le !== s.modifie_le) throw new ErreurApp("Cette publication a été modifiée par quelqu'un d'autre pendant votre saisie. Rechargez-la avant d'enregistrer.", "conflit");
        p = ex;
        const ancien = p.statut;
        const contenuModifie = s.texte !== p.texte || s.titre !== p.titre ||
          s.canaux.some((c) => (p.canaux.find((x) => x.canal_id === c.canal_id)?.texte_specifique ?? "") !== (c.texte_specifique ?? ""));
        const champs = { ...s }; delete champs.id; delete champs.modifie_le;
        let cible = s.statut;
        if (["valide", "programme"].includes(ancien) && cible === ancien && contenuModifie && !peutValider(m.role)) cible = "validation";
        appliquerEtape(p, cible, m.role);
        Object.assign(p, { ...champs, statut: p.statut, canaux: s.canaux.map((c) => ({ ...(p.canaux.find((x) => x.canal_id === c.canal_id) ?? { url_publication: null, portee: null, interactions: null, partages: null, clics: null, stats_saisies_le: null }), ...c })) });
        p.modifie_le = maintenant();
        if (p.statut !== ancien) { tracer(p, "etape", ancien, p.statut); apresChangementEtape(p, ancien); } else tracer(p, "modification", null, p.statut);
      } else {
        exiger(m.role === "admin" || ["idee", "redaction", "validation"].includes(s.statut), "Une nouvelle publication commence à l'étape Idée, Rédaction ou À valider.");
        p = {
          id: uid(), ...s, redacteur_id: s.redacteur_id ?? m.id, valide_par: null, valide_le: null, motif_retour: null,
          cree_par: m.id, cree_le: maintenant(), modifie_le: maintenant(),
          canaux: s.canaux.map((c) => ({ ...c, url_publication: null, portee: null, interactions: null, partages: null, clics: null, stats_saisies_le: null })),
        } as Publication;
        db.publications.push(p); tracer(p, "creation", null, p.statut); apresChangementEtape(p, null);
      }
      signaler("publications");
      return copie(p);
    },
    async changerEtape(id, statut, motif) {
      const m = moi(); exiger(peutEcrire(m.role)); await attendre();
      const p = db.publications.find((x) => x.id === id); if (!p) throw new ErreurApp("Publication introuvable.");
      const ancien = p.statut;
      if (motif !== undefined) p.motif_retour = motif;
      appliquerEtape(p, statut, m.role);
      if (motif !== undefined && statut === "redaction") p.motif_retour = motif;
      p.modifie_le = maintenant();
      tracer(p, "etape", ancien, statut, statut === "redaction" && ancien === "validation" ? p.motif_retour : null);
      apresChangementEtape(p, ancien);
      signaler("publications");
      return copie(p);
    },
    async supprimerPublication(id) {
      const m = moi(); const p = db.publications.find((x) => x.id === id); if (!p) return;
      exiger(m.role === "admin" || (p.cree_par === m.id && peutEcrire(m.role) && ["idee", "redaction", "annule"].includes(p.statut)),
        "Suppression non autorisée : seul l'auteur (avant validation) ou un administrateur peut supprimer.");
      db.publications = db.publications.filter((x) => x.id !== id);
      db.historique.unshift({ id: ++db.compteur, publication_id: null, titre_publication: p.titre, auteur_id: m.id, action: "suppression", ancien_statut: p.statut, nouveau_statut: null, details: "Publication supprimée", cree_le: maintenant() });
      signaler("publications");
    },
    async enregistrerStats(pid, cid, s) {
      exiger(peutEcrire(moi().role));
      const c = db.publications.find((x) => x.id === pid)?.canaux.find((x) => x.canal_id === cid);
      if (!c) throw new ErreurApp("Canal introuvable.");
      for (const k of ["portee", "interactions", "partages", "clics"] as const) if ((s[k] ?? 0) < 0) throw new ErreurApp("Valeur refusée (format ou limite non respectés).");
      Object.assign(c, { portee: s.portee, interactions: s.interactions, partages: s.partages, clics: s.clics, url_publication: s.url_publication ?? null, stats_saisies_le: maintenant() });
      signaler("publications");
    },

    async historique(pid) { return copie(db.historique.filter((h) => h.publication_id === pid)); },
    async commentaires(pid) { return copie(db.commentaires.filter((c) => c.publication_id === pid)); },
    async ajouterCommentaire(pid, texte) {
      const m = moi(); const p = db.publications.find((x) => x.id === pid);
      db.commentaires.push({ id: uid(), publication_id: pid, auteur_id: m.id, texte, cree_le: maintenant() });
      if (p) {
        notifier(p.redacteur_id, p.id, "commentaire", `${m.nom} a commenté « ${p.titre} » : ${texte.slice(0, 200)}`);
        if (p.valideur_id !== p.redacteur_id) notifier(p.valideur_id, p.id, "commentaire", `${m.nom} a commenté « ${p.titre} » : ${texte.slice(0, 200)}`);
      }
      signaler("notifications");
    },
    async supprimerCommentaire(id) {
      const m = moi(); const c = db.commentaires.find((x) => x.id === id);
      exiger(!!c && (m.role === "admin" || c.auteur_id === m.id));
      db.commentaires = db.commentaires.filter((x) => x.id !== id); sauver();
    },

    async piecesJointes(pid) { return copie(db.pieces.filter((x) => x.publication_id === pid)); },
    async ajouterPieceJointe(pid, f) {
      const m = moi(); exiger(peutEcrire(m.role));
      if (f.size > 20 * 1024 * 1024) throw new ErreurApp("Fichier trop lourd : 20 Mo maximum.");
      if (!/^image\/|^application\/pdf$/.test(f.type)) throw new ErreurApp("Type de fichier refusé : images (JPG, PNG, WebP, GIF, SVG) ou PDF uniquement.");
      const dataUrl = await new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = ko; r.readAsDataURL(f); });
      db.pieces.push({ id: uid(), publication_id: pid, chemin: `${pid}/${f.name}`, nom_fichier: f.name, type_mime: f.type, taille: f.size, ajoute_par: m.id, ajoute_le: maintenant(), dataUrl });
      sauver();
    },
    async lienPieceJointe(chemin) {
      const p = db.pieces.find((x) => x.chemin === chemin);
      if (!p?.dataUrl) throw new ErreurApp("Fichier non conservé dans la démonstration (trop volumineux).");
      return p.dataUrl;
    },
    async supprimerPieceJointe(piece) {
      const m = moi(); exiger(m.role === "admin" || piece.ajoute_par === m.id);
      db.pieces = db.pieces.filter((x) => x.id !== piece.id); sauver();
    },

    async evenements() { return copie(db.evenements); },
    async enregistrerEvenement(e) {
      const m = moi(); exiger(peutEcrire(m.role));
      if (e.id) { const ex = db.evenements.find((x) => x.id === e.id)!; Object.assign(ex, e); sauver(); return copie(ex); }
      const n: Evenement = { id: uid(), date_fin: null, lieu: null, service_id: null, description: "", cree_par: m.id, ...e };
      db.evenements.push(n); sauver(); return copie(n);
    },
    async supprimerEvenement(id) {
      const m = moi(); const e = db.evenements.find((x) => x.id === id);
      exiger(m.role === "admin" || (e?.cree_par === m.id && peutEcrire(m.role)));
      db.evenements = db.evenements.filter((x) => x.id !== id);
      db.publications.forEach((p) => { if (p.evenement_id === id) p.evenement_id = null; });
      signaler("publications");
    },

    async notifications() {
      const m = moi();
      return copie(db.notifications.filter((n) => n.destinataire_id === m.id).map(({ destinataire_id: _d, ...n }) => n));
    },
    async marquerLues(ids) {
      const m = moi();
      db.notifications.forEach((n) => { if (n.destinataire_id === m.id && (ids === "toutes" || ids.includes(n.id))) n.lue = true; });
      signaler("notifications");
    },
    surChangements(cb) { ecouteursDonnees.add(cb); return () => ecouteursDonnees.delete(cb); },

    async inviter(email, nomU, role) {
      exiger(moi().role === "admin", "Action réservée aux administrateurs."); await attendre();
      if (db.profils.some((p) => p.email.toLowerCase() === email.toLowerCase())) throw new ErreurApp("Un compte existe déjà avec cette adresse.");
      db.profils.push({ id: uid(), nom: nomU || email.split("@")[0], email, role, actif: true, notif_email: true }); sauver();
    },
    async changerRole(id, role) {
      exiger(moi().role === "admin", "Seul un administrateur peut modifier le rôle, l'activation ou l'adresse d'un compte.");
      const p = db.profils.find((x) => x.id === id)!;
      if (p.role === "admin" && role !== "admin" && db.profils.filter((x) => x.role === "admin" && x.actif).length <= 1)
        throw new ErreurApp("Impossible : il doit rester au moins un administrateur actif.");
      p.role = role; sauver();
    },
    async activerCompte(id, actif) {
      exiger(moi().role === "admin", "Action réservée aux administrateurs.");
      if (id === db.moi) throw new ErreurApp("Vous ne pouvez pas désactiver votre propre compte.");
      db.profils.find((x) => x.id === id)!.actif = actif; sauver();
    },
    async supprimerCompte(id) {
      exiger(moi().role === "admin", "Action réservée aux administrateurs.");
      if (id === db.moi) throw new ErreurApp("Suppression impossible pour ce compte.");
      db.profils = db.profils.filter((x) => x.id !== id); sauver();
    },
    async enregistrerService(s) {
      exiger(moi().role === "admin");
      if (s.id) Object.assign(db.services.find((x) => x.id === s.id)!, s);
      else db.services.push({ id: ++db.compteur, couleur: "#1A3C6E", ordre: db.services.length + 1, actif: true, ...s } as Service);
      sauver();
    },
    async enregistrerCanal(c) {
      exiger(moi().role === "admin");
      if (c.id) Object.assign(db.canaux.find((x) => x.id === c.id)!, c);
      else db.canaux.push({ id: ++db.compteur, couleur: "#5B7BB0", limite_caracteres: null, ordre: db.canaux.length + 1, actif: true, type_publication: "manuel", ...c } as Canal);
      sauver();
    },

    async exportComplet() {
      exiger(moi().role === "admin", "Action réservée aux administrateurs.");
      return copie({
        services: db.services, canaux: db.canaux, profils: db.profils, evenements: db.evenements,
        publications: db.publications.map(({ canaux: _c, ...p }) => p),
        publication_canaux: db.publications.flatMap((p) => p.canaux.map((c) => ({ publication_id: p.id, ...c }))),
        commentaires: db.commentaires, pieces_jointes: db.pieces.map(({ dataUrl: _d, ...p }) => p), historique: db.historique,
      }) as Record<string, unknown[]>;
    },
    async publierReseaux(pid) {
      const m = moi(); exiger(peutEcrire(m.role), "Votre rôle ne permet pas de publier."); await new Promise((r) => setTimeout(r, 900));
      const p = db.publications.find((x) => x.id === pid); if (!p) throw new ErreurApp("Publication introuvable.");
      if (p.statut !== "valide" && p.statut !== "programme") throw new ErreurApp("Seule une publication validée peut être diffusée.");
      const image = db.pieces.find((x) => x.publication_id === pid && (x.type_mime ?? "").startsWith("image/"));
      const resultats: ResultatDiffusion[] = [];
      for (const pc of p.canaux) {
        const type = db.canaux.find((c) => c.id === pc.canal_id)?.type_publication;
        if (!type || type === "manuel" || pc.publie_le) continue;
        let erreur: string | null = null;
        if (type === "instagram" && !image) erreur = "Instagram exige un visuel : joignez une image (JPEG) à la publication.";
        else if (type === "instagram" && image?.type_mime !== "image/jpeg") erreur = "Instagram n'accepte que les images JPEG : remplacez le visuel par un .jpg.";
        if (erreur) { pc.erreur_publication = erreur; pc.tentatives = (pc.tentatives ?? 0) + 1; resultats.push({ reseau: type, reussi: false, message: erreur }); }
        else { pc.publie_le = maintenant(); pc.erreur_publication = null; resultats.push({ reseau: type, reussi: true, message: "Publication simulée (démonstration : rien n'est envoyé)" }); }
      }
      if (!resultats.length) return { message: "Rien à envoyer : déjà diffusée sur les réseaux connectés.", resultats };
      tracer(p, "modification", null, p.statut, "Diffusion : " + resultats.map((r) => `${r.reseau} ${r.reussi ? "OK" : "échec"}`).join(", "));
      const tout = p.canaux.every((pc) => pc.publie_le && db.canaux.find((c) => c.id === pc.canal_id)?.type_publication !== "manuel");
      if (tout) { const ancien = p.statut; p.statut = "publie"; tracer(p, "etape", ancien, "publie"); }
      signaler("publications");
      return { message: resultats.some((r) => !r.reussi) ? "Diffusion incomplète" : "Diffusion réussie", resultats };
    },
    async etatReseaux() {
      exiger(moi().role === "admin", "Action réservée aux administrateurs.");
      const m = { configure: false, message: "Démonstration : aucun compte réel n'est connecté" };
      return { facebook: m, instagram: m };
    },
    async assistant(action, d) {
      exiger(peutEcrire(moi().role)); await new Promise((r) => setTimeout(r, 700));
      const base = d.texte.trim() || d.titre;
      const exemples: Record<string, string> = {
        reformuler: `${base}\n\n(Démonstration : dans la version installée, l'assistant reformule réellement ce texte.)`,
        court: base.slice(0, 200) + (base.length > 200 ? "…" : "") + "\n\n(Démonstration)",
        relire: `Version corrigée :\n${base}\n\nRemarques :\n- Démonstration : la relecture réelle signale fautes, typographie et informations manquantes.`,
        adapter: d.canaux.map((c) => `${c.toUpperCase()}\n${base}`).join("\n\n") + "\n\n(Démonstration : chaque version sera adaptée au format du canal.)",
      };
      return { texte: exemples[action], coupe: false };
    },
  };
  // Permet de basculer d'un rôle à l'autre dans la démonstration
  (api as Api & { changerUtilisateurDemo: (id: string) => void }).changerUtilisateurDemo = (id: string) => {
    db.moi = id; sauver(); ecouteursSession.forEach((cb) => cb("connexion"));
  };
  (api as Api & { reinitialiserDemo: () => void }).reinitialiserDemo = () => {
    const m = db.moi; db = baseInitiale(); db.moi = m; sauver(); ecouteursSession.forEach((cb) => cb("connexion"));
  };
  return api;
}
