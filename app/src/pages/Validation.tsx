import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../data";
import { useDonnees } from "../etat/Donnees";
import { useSession } from "../etat/Session";
import { Entete, PastilleEtape, PastillesCanaux, useAction } from "../composants/ui";
import { fmtDateCourte, fmtHeure, lireStockage, ecrireStockage, triParDate } from "../lib/outils";
import { ETAPES_CIRCUIT, transitionAutorisee } from "../regles";
import type { Publication, Statut } from "../types";

export function Validation() {
  const { publications, service, personne, remplacerPublication } = useDonnees();
  const { profil } = useSession();
  const { enCours, executer } = useAction();
  const [choisie, setChoisie] = useState<Statut>(() => lireStockage<Statut>("gc-etape-mobile", "validation"));
  const choisir = (s: Statut) => { setChoisie(s); ecrireStockage("gc-etape-mobile", s); };
  const liste = publications.filter((p) => p.statut !== "annule").sort(triParDate);

  // Les publications « À valider » se traitent depuis leur fiche (lecture du texte, motif de renvoi).
  const deplacer = (p: Publication, vers: Statut) => executer(async () => {
    remplacerPublication(await api.changerEtape(p.id, vers));
  }, "Étape mise à jour");

  return (
    <div className="pile">
      <Entete titre="Circuit de validation" sous="Chaque publication avance d'étape en étape. « À valider » attend l'accord de l'élu ou de la direction." />
      <div className="selecteur-etapes" role="group" aria-label="Étape affichée">
        {ETAPES_CIRCUIT.map((e) => (
          <button key={e.id} className="btn petit" aria-pressed={choisie === e.id} onClick={() => choisir(e.id)}>
            {e.court} ({liste.filter((p) => p.statut === e.id).length})
          </button>
        ))}
      </div>
      <div className="tableau-etapes">
        {ETAPES_CIRCUIT.map((e, i) => {
          const items = liste.filter((p) => p.statut === e.id);
          const suivante = ETAPES_CIRCUIT[i + 1], precedente = ETAPES_CIRCUIT[i - 1];
          return (
            <div key={e.id} className={"colonne" + (choisie === e.id ? " choisie" : "")}>
              <h3><PastilleEtape statut={e.id} /><span className="pill">{items.length}</span></h3>
              {items.length ? items.map((p) => {
                const s = service(p.service_id), v = personne(p.valideur_id);
                const avancer = suivante && transitionAutorisee(p.statut, suivante.id, profil?.role) && !(p.statut === "validation");
                const reculer = precedente && transitionAutorisee(p.statut, precedente.id, profil?.role) && !(p.statut === "validation");
                return (
                  <div className="carte" key={p.id}>
                    <Link to={`/publication/${p.id}`}><div className="titre">{p.titre}</div></Link>
                    <div className="canal">{fmtDateCourte(p.date_diffusion)}{p.heure_diffusion && ` · ${fmtHeure(p.heure_diffusion)}`}{s && ` · ${s.nom}`}</div>
                    <div className="meta"><PastillesCanaux ids={p.canaux.map((c) => c.canal_id)} /></div>
                    {p.statut === "validation" && v && <div className="canal">Valideur : {v.nom}</div>}
                    {p.statut === "redaction" && p.motif_retour && <div className="signal moyen">Renvoyée : {p.motif_retour}</div>}
                    <div className="actions">
                      {p.statut === "validation"
                        ? <Link className="btn petit primaire" to={`/publication/${p.id}`}>{transitionAutorisee("validation", "valide", profil?.role) ? "Examiner et valider" : "Ouvrir"}</Link>
                        : <>
                            {reculer && <button className="btn petit discret" disabled={enCours} onClick={() => deplacer(p, precedente.id)} aria-label={`Revenir à ${precedente.libelle}`}><ChevronLeft size={14} /></button>}
                            {avancer && <button className="btn petit" disabled={enCours} onClick={() => deplacer(p, suivante.id)}>{suivante.court} <ChevronRight size={14} /></button>}
                          </>}
                    </div>
                  </div>
                );
              }) : <div className="vide" style={{ fontSize: 13 }}>Vide</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
