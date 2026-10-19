import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { api } from "../data";
import { useDonnees } from "../etat/Donnees";
import { useSession } from "../etat/Session";
import { BoutonConfirmer, Entete, useAction } from "../composants/ui";
import { ROLES, libelleRole } from "../regles";
import type { Canal, Role, Service } from "../types";

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
