import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Download, Radio, UserPlus } from "lucide-react";
import { api } from "../data";
import { useDonnees } from "../etat/Donnees";
import { useSession } from "../etat/Session";
import { BoutonConfirmer, Entete, useAction } from "../composants/ui";
import { ROLES, libelleRole } from "../regles";
import type { Canal, EtatReseau, Role, Service, TypePublication } from "../types";
import { ecrireStockage, fmtHorodatage, lireStockage, telecharger, versCsv } from "../lib/outils";

export function Administration() {
  const { profil } = useSession();
  if (profil?.role !== "admin") return <Navigate to="/" replace />;
  return (
    <div className="pile">
      <Entete titre="Administration" sous="Comptes, services et canaux de diffusion" />
      <Comptes />
      <div className="grille2">
        <ListeReference type="services" />
        <ListeReference type="canaux" />
      </div>
      <Reseaux />
      <Sauvegarde />
    </div>
  );
}

function Comptes() {
  const { profil } = useSession();
  const { refs, recharger } = useDonnees();
  const { enCours, executer } = useAction();
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [role, setRole] = useState<Role>("redacteur");
  const inviter = (e: FormEvent) => {
    e.preventDefault();
    executer(async () => { await api.inviter(email.trim(), nom.trim(), role); setEmail(""); setNom(""); await recharger("references"); },
      api.demo ? "Compte créé (démonstration)" : `Invitation envoyée à ${email.trim()}`);
  };
  const comptes = refs.profils.slice().sort((a, b) => Number(b.actif) - Number(a.actif) || a.nom.localeCompare(b.nom));
  return (
    <section className="panneau"><h2>Comptes <span className="aide">{refs.profils.filter((p) => p.actif).length} actifs</span></h2>
      <form className="formulaire" onSubmit={inviter} style={{ marginBottom: 14 }}>
        <div className="champ"><label htmlFor="i-nom">Nom et prénom</label><input id="i-nom" type="text" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} /></div>
        <div className="champ"><label htmlFor="i-email">Adresse électronique professionnelle</label><input id="i-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="champ"><label htmlFor="i-role">Rôle</label>
          <select id="i-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.libelle} — {r.description}</option>)}</select></div>
        <div className="champ" style={{ justifyContent: "flex-end" }}><button className="btn primaire" disabled={enCours || !email}><UserPlus size={16} /> Inviter</button></div>
      </form>
      <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>La personne reçoit un courriel pour choisir son mot de passe. Un compte désactivé ne peut plus se connecter ; ses publications restent. La suppression efface le compte (demande d'effacement RGPD, départ définitif).</p>
      <div className="lignes-admin">
        {comptes.map((p) => (
          <div className="ligne-admin" key={p.id} style={p.actif ? undefined : { opacity: 0.6 }}>
            <div className="qui"><strong>{p.nom}</strong>{p.id === profil?.id && " (vous)"}{!p.actif && " — désactivé"}<small>{p.email}</small></div>
            <select aria-label={`Rôle de ${p.nom}`} value={p.role} disabled={enCours || p.id === profil?.id}
              onChange={(e) => executer(async () => { await api.changerRole(p.id, e.target.value as Role); await recharger("references"); }, `Rôle : ${libelleRole(e.target.value as Role)}`)}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.libelle}</option>)}
            </select>
            <div className="actions">
              {p.id !== profil?.id && (p.actif
                ? <button className="btn petit" disabled={enCours} onClick={() => executer(async () => { await api.activerCompte(p.id, false); await recharger("references"); }, "Compte désactivé")}>Désactiver</button>
                : <button className="btn petit" disabled={enCours} onClick={() => executer(async () => { await api.activerCompte(p.id, true); await recharger("references"); }, "Compte réactivé")}>Réactiver</button>)}
              {p.id !== profil?.id && <BoutonConfirmer petit libelle="Supprimer" question="Effacer ce compte ?" onConfirmer={() => executer(async () => { await api.supprimerCompte(p.id); await recharger("references"); }, "Compte supprimé")} />}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ListeReference({ type }: { type: "services" | "canaux" }) {
  const { refs, recharger } = useDonnees();
  const { enCours, executer } = useAction();
  const [nouveau, setNouveau] = useState("");
  const liste: (Service | Canal)[] = type === "services" ? refs.services : refs.canaux;
  const enregistrer = (x: Partial<Service & Canal> & { nom: string }) => executer(async () => {
    if (type === "services") await api.enregistrerService(x); else await api.enregistrerCanal(x);
    await recharger("references");
  }, "Enregistré");
  return (
    <section className="panneau"><h2>{type === "services" ? "Services" : "Canaux de diffusion"}</h2>
      {liste.map((x) => (
        <div className="ligne-ref" key={x.id} style={x.actif ? undefined : { opacity: 0.6 }}>
          <input type="color" aria-label={`Couleur de ${x.nom}`} defaultValue={x.couleur} onBlur={(e) => e.target.value.toUpperCase() !== x.couleur.toUpperCase() && enregistrer({ id: x.id, nom: x.nom, couleur: e.target.value })} />
          <input type="text" aria-label="Nom" defaultValue={x.nom} maxLength={80} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== x.nom && enregistrer({ id: x.id, nom: e.target.value.trim() })} />
          {type === "canaux"
            ? <input type="number" min={1} aria-label={`Limite de caractères pour ${x.nom}`} placeholder="Limite car." defaultValue={(x as Canal).limite_caracteres ?? ""}
                onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== (x as Canal).limite_caracteres) enregistrer({ id: x.id, nom: x.nom, limite_caracteres: v }); }} />
            : <span />}
          <button className="btn petit" disabled={enCours} onClick={() => enregistrer({ id: x.id, nom: x.nom, actif: !x.actif })}>{x.actif ? "Masquer" : "Rétablir"}</button>
        </div>
      ))}
      <form className="outils" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); if (nouveau.trim()) { enregistrer({ nom: nouveau.trim() }); setNouveau(""); } }}>
        <input type="text" aria-label="Nouveau" placeholder={type === "services" ? "Nouveau service" : "Nouveau canal (ex. PanneauPocket)"} value={nouveau} onChange={(e) => setNouveau(e.target.value)} style={{ flex: 1 }} />
        <button className="btn" disabled={enCours || !nouveau.trim()}>Ajouter</button>
      </form>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 0 }}>Un élément masqué n'est plus proposé, mais les publications qui l'utilisent le conservent.</p>
    </section>
  );
}

/** Publication directe : choix du canal relié à chaque réseau et test de la connexion aux comptes Meta. */
function Reseaux() {
  const { refs, recharger } = useDonnees();
  const { enCours, executer } = useAction();
  const [etat, setEtat] = useState<{ facebook: EtatReseau; instagram: EtatReseau } | null>(null);
  const reseaux: { id: Exclude<TypePublication, "manuel">; nom: string }[] = [{ id: "facebook", nom: "Page Facebook" }, { id: "instagram", nom: "Compte Instagram professionnel" }];
  const relier = (type: Exclude<TypePublication, "manuel">, canalId: number | null) => executer(async () => {
    const actuel = refs.canaux.find((c) => c.type_publication === type);
    if (actuel && actuel.id !== canalId) await api.enregistrerCanal({ id: actuel.id, nom: actuel.nom, type_publication: "manuel" });
    const cible = refs.canaux.find((c) => c.id === canalId);
    if (cible && cible.type_publication !== type) await api.enregistrerCanal({ id: cible.id, nom: cible.nom, type_publication: type });
    await recharger("references");
  }, "Réglage enregistré");
  return (
    <section className="panneau"><h2><Radio size={18} style={{ verticalAlign: -3 }} /> Réseaux sociaux <span className="aide">publication directe depuis la plateforme</span></h2>
      <p style={{ fontSize: 14, marginTop: 0 }}>
        Une publication <strong>validée</strong> part sur ces réseaux par le bouton « Publier maintenant » de sa fiche, ou toute seule à la date
        et à l'heure prévues lorsqu'elle est <strong>programmée</strong>. Les autres canaux (site internet, affichage…) restent publiés par l'équipe.
      </p>
      <div className="formulaire">
        {reseaux.map((r) => (
          <div className="champ" key={r.id}><label htmlFor={`res-${r.id}`}>Canal relié à la {r.nom}</label>
            <select id={`res-${r.id}`} disabled={enCours} value={refs.canaux.find((c) => c.type_publication === r.id)?.id ?? ""}
              onChange={(e) => relier(r.id, e.target.value ? Number(e.target.value) : null)}>
              <option value="">Aucun (publication manuelle)</option>
              {refs.canaux.filter((c) => c.actif).map((c: Canal) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select></div>
        ))}
      </div>
      <button className="btn" style={{ marginTop: 12 }} disabled={enCours} onClick={() => executer(async () => setEtat(await api.etatReseaux()))}>Tester la connexion aux comptes</button>
      {etat && <div className="etat-reseaux" role="status">
        {reseaux.map((r) => { const e = etat[r.id]; return (
          <div key={r.id}><strong>{r.nom} :</strong>{" "}
            {e.ok ? <span className="ok">connecté — {e.compte}</span> : <span className="ko">{e.message ?? "non connecté"}</span>}</div>); })}
      </div>}
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 0 }}>
        Les accès aux comptes Meta (identifiants de la Page et du compte Instagram, jeton d'accès) sont enregistrés par l'administrateur technique
        dans les paramètres secrets du serveur, jamais dans l'application : voir le guide de mise en ligne, section « Connecter Facebook et Instagram ».
      </p>
    </section>
  );
}

/** Sauvegarde manuelle : l'offre gratuite de l'hébergeur ne fait pas de sauvegarde automatique. */
function Sauvegarde() {
  const { enCours, executer } = useAction();
  const [derniere, setDerniere] = useState<string | null>(() => lireStockage<string | null>("gc-derniere-sauvegarde", null));
  const jours = derniere ? Math.floor((Date.now() - new Date(derniere).getTime()) / 86_400_000) : null;
  const enRetard = jours == null || jours > 31;

  const exporter = () => executer(async () => {
    const donnees = await api.exportComplet();
    const maintenant = new Date();
    const jour = maintenant.toISOString().slice(0, 10);
    const fichier = {
      application: "Gestion COM — Commune de Cabannes",
      format: 1,
      exporte_le: maintenant.toISOString(),
      remarque: "Sauvegarde complète des données. Les fichiers joints (visuels, PDF) ne sont pas inclus : seule leur liste l'est.",
      totaux: Object.fromEntries(Object.entries(donnees).map(([k, v]) => [k, v.length])),
      donnees,
    };
    telecharger(`gestion-com-sauvegarde-${jour}.json`, JSON.stringify(fichier, null, 2), "application/json;charset=utf-8");
    // Copie lisible dans Excel des publications, en complément
    const pubs = (donnees.publications ?? []) as Record<string, unknown>[];
    if (pubs.length) {
      const cols = Object.keys(pubs[0]);
      telecharger(`gestion-com-publications-${jour}.csv`, versCsv([cols, ...pubs.map((p) => cols.map((c) => (p[c] == null ? "" : String(p[c]))))]));
    }
    ecrireStockage("gc-derniere-sauvegarde", maintenant.toISOString());
    setDerniere(maintenant.toISOString());
  }, "Sauvegarde téléchargée");

  return (
    <section className="panneau"><h2>Sauvegarde des données <span className="aide">à faire au moins une fois par mois</span></h2>
      <div className={"bandeau" + (enRetard ? " alerte" : " ok")} style={{ marginBottom: 12 }}>
        {derniere
          ? <>Dernière sauvegarde depuis cet appareil : {fmtHorodatage(derniere)}{jours != null && jours > 31 ? ` (il y a ${jours} jours)` : ""}.</>
          : <>Aucune sauvegarde enregistrée depuis cet appareil.</>}
      </div>
      <p style={{ fontSize: 14, marginTop: 0 }}>
        Télécharge deux fichiers : une sauvegarde complète (.json : publications, canaux et statistiques, événements, commentaires,
        historique, comptes) et la liste des publications lisible dans Excel (.csv). Rangez-les dans le dossier partagé du service.
        Les visuels et PDF déposés ne sont pas inclus.
      </p>
      <button className="btn primaire" disabled={enCours} onClick={exporter}><Download size={16} /> Exporter toutes les données</button>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 0 }}>Ces fichiers contiennent des données personnelles (noms, adresses des agents) : ne les envoyez pas par messagerie personnelle et ne les déposez pas sur GitHub.</p>
    </section>
  );
}
