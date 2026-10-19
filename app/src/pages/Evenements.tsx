import { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Plus } from "lucide-react";
import { api } from "../data";
import { useDonnees } from "../etat/Donnees";
import { useSession } from "../etat/Session";
import { BoutonConfirmer, Dialogue, Entete, PastilleEtape, useAction } from "../composants/ui";
import { aujourdhui, fmtDateLongue } from "../lib/outils";
import { peutEcrire } from "../regles";
import type { Evenement } from "../types";

export function Evenements() {
  const { evenements, publications, service, recharger } = useDonnees();
  const { profil } = useSession();
  const [edition, setEdition] = useState<Partial<Evenement> | null>(null);
  const [passes, setPasses] = useState(false);
  const t = aujourdhui();
  const ecrit = peutEcrire(profil?.role);
  const liste = evenements
    .filter((e) => (passes ? (e.date_fin ?? e.date_debut) < t : (e.date_fin ?? e.date_debut) >= t))
    .sort((a, b) => (passes ? b.date_debut.localeCompare(a.date_debut) : a.date_debut.localeCompare(b.date_debut)));

  return (
    <div className="pile">
      <Entete titre="Événements" sous="Rattachez les publications à un événement pour suivre toute sa communication.">
        <div className="outils" role="group" aria-label="Période">
          <button className="btn petit" aria-pressed={!passes} onClick={() => setPasses(false)} style={!passes ? { borderColor: "var(--navy)" } : undefined}>À venir</button>
          <button className="btn petit" aria-pressed={passes} onClick={() => setPasses(true)} style={passes ? { borderColor: "var(--navy)" } : undefined}>Passés</button>
        </div>
        {ecrit && <button className="btn primaire" onClick={() => setEdition({ titre: "", date_debut: t })}><Plus size={16} /> Nouvel événement</button>}
      </Entete>

      {liste.length ? liste.map((e) => {
        const pubs = publications.filter((p) => p.evenement_id === e.id && p.statut !== "annule");
        const s = service(e.service_id);
        return (
          <section className="panneau" key={e.id}>
            <h2>
              <span>{e.titre}</span>
              <span className="outils">
                {ecrit && <Link className="btn petit" to={`/publication/nouvelle?evenement=${e.id}`}><Plus size={14} /> Publication</Link>}
                {ecrit && <button className="btn petit" onClick={() => setEdition(e)}>Modifier</button>}
              </span>
            </h2>
            <div className="meta" style={{ marginTop: -6 }}>
              <span className="pill" style={{ textTransform: "capitalize" }}>{fmtDateLongue(e.date_debut)}{e.date_fin && e.date_fin !== e.date_debut ? ` → ${fmtDateLongue(e.date_fin)}` : ""}</span>
              {e.lieu && <span className="canal"><MapPin size={13} /> {e.lieu}</span>}
              {s && <span className="pill">{s.nom}</span>}
            </div>
            {e.description && <p style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{e.description}</p>}
            <div className="liste" style={{ marginTop: 8 }}>
              {pubs.length ? pubs.map((p) => (
                <Link key={p.id} className="ligne" to={`/publication/${p.id}`}>
                  <div className="corps"><div className="titre">{p.titre}</div></div><PastilleEtape statut={p.statut} />
                </Link>
              )) : <div className="vide" style={{ padding: "4px 0" }}>Aucune publication rattachée.</div>}
            </div>
          </section>
        );
      }) : <div className="panneau vide">{passes ? "Aucun événement passé." : "Aucun événement à venir."}</div>}

      {edition && <DialogueEvenement e={edition} onFermer={() => setEdition(null)} onFini={() => { setEdition(null); recharger("evenements"); recharger("publications"); }} />}
    </div>
  );
}

function DialogueEvenement({ e, onFermer, onFini }: { e: Partial<Evenement>; onFermer: () => void; onFini: () => void }) {
  const { refs } = useDonnees();
  const { profil } = useSession();
  const { enCours, executer } = useAction();
  const [f, setF] = useState<Partial<Evenement>>(e);
  const ok = !!f.titre?.trim() && !!f.date_debut && (!f.date_fin || f.date_fin >= f.date_debut);
  const enregistrer = () => executer(async () => {
    await api.enregistrerEvenement({
      id: f.id, titre: f.titre!.trim(), date_debut: f.date_debut!, date_fin: f.date_fin || null, lieu: f.lieu || null,
      service_id: f.service_id ?? null, description: f.description ?? "",
    });
    onFini();
  }, "Événement enregistré");
  return (
    <Dialogue titre={f.id ? "Modifier l'événement" : "Nouvel événement"} onFermer={onFermer}
      pied={<>
        {f.id && (profil?.role === "admin" || e.cree_par === profil?.id) &&
          <BoutonConfirmer libelle="Supprimer" question="Supprimer l'événement ? (les publications restent)" onConfirmer={() => executer(async () => { await api.supprimerEvenement(f.id!); onFini(); }, "Événement supprimé")} />}
        <button className="btn" onClick={onFermer}>Annuler</button>
        <button className="btn primaire" disabled={!ok || enCours} onClick={enregistrer}>Enregistrer</button>
      </>}>
      <div className="formulaire">
        <div className="champ large"><label htmlFor="e-titre">Titre</label><input id="e-titre" type="text" maxLength={200} value={f.titre ?? ""} onChange={(x) => setF({ ...f, titre: x.target.value })} /></div>
        <div className="champ"><label htmlFor="e-debut">Début</label><input id="e-debut" type="date" value={f.date_debut ?? ""} onChange={(x) => setF({ ...f, date_debut: x.target.value })} /></div>
        <div className="champ"><label htmlFor="e-fin">Fin (si plusieurs jours)</label><input id="e-fin" type="date" min={f.date_debut} value={f.date_fin ?? ""} onChange={(x) => setF({ ...f, date_fin: x.target.value || null })} /></div>
        <div className="champ"><label htmlFor="e-lieu">Lieu</label><input id="e-lieu" type="text" maxLength={200} value={f.lieu ?? ""} onChange={(x) => setF({ ...f, lieu: x.target.value })} /></div>
        <div className="champ"><label htmlFor="e-service">Service</label>
          <select id="e-service" value={f.service_id ?? ""} onChange={(x) => setF({ ...f, service_id: x.target.value ? Number(x.target.value) : null })}>
            <option value="">—</option>{refs.services.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select></div>
        <div className="champ large"><label htmlFor="e-desc">Description</label><textarea id="e-desc" rows={3} value={f.description ?? ""} onChange={(x) => setF({ ...f, description: x.target.value })} /></div>
      </div>
    </Dialogue>
  );
}
