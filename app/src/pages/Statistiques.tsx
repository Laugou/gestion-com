import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useDonnees } from "../etat/Donnees";
import { Entete } from "../composants/ui";
import { BarresHorizontales, Colonnes } from "../composants/Graphiques";
import { cleMois, decalerMois, fmtDateCourte, fmtMois, fmtNombre, premierDuMois, pubADesStats, telecharger, totalStats, versCsv } from "../lib/outils";
import { libelleEtape, METRIQUES, type Metrique } from "../regles";
import type { Publication } from "../types";

export function Statistiques() {
  const { publications, refs, service, canal, personne } = useDonnees();
  const [mois, setMois] = useState(() => premierDuMois(new Date()));
  const [metrique, setMetrique] = useState<Metrique>("interactions");
  const [filtreService, setFiltreService] = useState("");
  const libMetrique = METRIQUES.find((m) => m.id === metrique)!.libelle;

  const publiees = useMemo(() => publications.filter((p) => p.statut === "publie" && p.date_diffusion && (!filtreService || String(p.service_id) === filtreService)), [publications, filtreService]);
  const duMois = (d: Date) => publiees.filter((p) => p.date_diffusion!.startsWith(cleMois(d)));
  const liste = duMois(mois);
  const totaux = liste.reduce((t, p) => { const s = totalStats(p); METRIQUES.forEach((m) => (t[m.id] += s[m.id])); return t; }, { portee: 0, interactions: 0, partages: 0, clics: 0 } as Record<Metrique, number>);
  const sansStats = liste.filter((p) => !pubADesStats(p)).length;

  const parCanal = refs.canaux
    .map((c) => ({ libelle: c.nom, couleur: c.couleur, valeur: liste.reduce((a, p) => a + totalStats(p, c.id)[metrique], 0), utilise: liste.some((p) => p.canaux.some((x) => x.canal_id === c.id)) }))
    .filter((x) => x.utilise);
  const parService = refs.services
    .map((s) => ({ libelle: s.nom, couleur: s.couleur, valeur: liste.filter((p) => p.service_id === s.id).reduce((a, p) => a + totalStats(p)[metrique], 0), n: liste.filter((p) => p.service_id === s.id).length }))
    .filter((x) => x.n > 0);
  const evolution = Array.from({ length: 6 }, (_, i) => decalerMois(mois, i - 5)).map((d) => ({
    libelle: d.toLocaleDateString("fr-FR", { month: "short" }), valeur: duMois(d).reduce((a, p) => a + totalStats(p)[metrique], 0),
  }));
  const tri = liste.slice().sort((a, b) => totalStats(b)[metrique] - totalStats(a)[metrique]);

  function exporter(pubs: Publication[], nom: string) {
    const lignes: (string | number | null)[][] = [["Date", "Heure", "Titre", "Service", "Étape", "Canal", "Portée", "Interactions", "Partages", "Clics", "Lien", "Rédigé par", "Validé par"]];
    for (const p of pubs.slice().sort((a, b) => (a.date_diffusion ?? "").localeCompare(b.date_diffusion ?? ""))) {
      const cs = p.canaux.length ? p.canaux : [null];
      for (const c of cs) lignes.push([
        p.date_diffusion, p.heure_diffusion?.slice(0, 5) ?? "", p.titre, service(p.service_id)?.nom ?? "", libelleEtape(p.statut),
        c ? canal(c.canal_id)?.nom ?? "" : "", c?.portee ?? "", c?.interactions ?? "", c?.partages ?? "", c?.clics ?? "", c?.url_publication ?? "",
        personne(p.redacteur_id)?.nom ?? "", personne(p.valide_par)?.nom ?? "",
      ]);
    }
    telecharger(nom, versCsv(lignes));
  }

  return (
    <div className="pile">
      <Entete titre="Statistiques" sous="Chiffres saisis après chaque diffusion">
        <select aria-label="Service" value={filtreService} onChange={(e) => setFiltreService(e.target.value)} style={{ width: "auto" }}>
          <option value="">Tous les services</option>{refs.services.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
        <select aria-label="Indicateur" value={metrique} onChange={(e) => setMetrique(e.target.value as Metrique)} style={{ width: "auto" }}>
          {METRIQUES.map((m) => <option key={m.id} value={m.id}>{m.libelle}</option>)}
        </select>
      </Entete>

      <div className="entete">
        <div className="outils">
          <button className="btn-icone" onClick={() => setMois(decalerMois(mois, -1))} aria-label="Mois précédent"><ChevronLeft size={18} /></button>
          <strong style={{ fontSize: 17, textTransform: "capitalize", minWidth: 150, textAlign: "center" }}>{fmtMois(mois)}</strong>
          <button className="btn-icone" onClick={() => setMois(decalerMois(mois, 1))} aria-label="Mois suivant"><ChevronRight size={18} /></button>
        </div>
        <div className="outils">
          <button className="btn" onClick={() => exporter(liste, `communication-${cleMois(mois)}.csv`)}><Download size={16} /> Exporter le mois</button>
          <button className="btn" onClick={() => exporter(publications.filter((p) => p.date_diffusion?.startsWith(String(mois.getFullYear()))), `communication-${mois.getFullYear()}.csv`)}><Download size={16} /> Exporter l'année</button>
        </div>
      </div>

      <div className="chiffres">
        {METRIQUES.map((m) => (
          <div key={m.id} className="chiffre"><span className="lib">{m.libelle}</span><span className="val">{fmtNombre(totaux[m.id])}</span>
            <span className="note">{liste.length} publication{liste.length > 1 ? "s" : ""} diffusée{liste.length > 1 ? "s" : ""}</span></div>
        ))}
      </div>
      {sansStats > 0 && <div className="bandeau alerte">{sansStats} publication{sansStats > 1 ? "s" : ""} de ce mois sans statistiques : les totaux sont incomplets.</div>}

      <div className="grille2">
        <section className="panneau"><h2>{libMetrique} par canal</h2><BarresHorizontales barres={parCanal} titre={`${libMetrique} par canal`} /></section>
        <section className="panneau"><h2>Évolution sur 6 mois <span className="aide">{libMetrique.toLowerCase()}</span></h2><Colonnes colonnes={evolution} titre="Évolution sur six mois" /></section>
      </div>
      <section className="panneau"><h2>{libMetrique} par service</h2><BarresHorizontales barres={parService} titre={`${libMetrique} par service`} /></section>

      <section className="panneau"><h2>Publications du mois <span className="aide">triées par {libMetrique.toLowerCase()}</span></h2>
        <div className="tableau">
          <table>
            <thead><tr><th>Date</th><th>Publication</th><th>Service</th>{METRIQUES.map((m) => <th key={m.id} className="n">{m.libelle}</th>)}</tr></thead>
            <tbody>
              {tri.length ? tri.map((p) => {
                const s = totalStats(p), a = pubADesStats(p);
                return (
                  <tr key={p.id}>
                    <td>{fmtDateCourte(p.date_diffusion)}</td>
                    <td><Link to={`/publication/${p.id}`}><b>{p.titre}</b></Link>{!a && <div className="signal info" style={{ display: "inline-block", marginLeft: 6 }}>à saisir</div>}</td>
                    <td>{service(p.service_id)?.nom ?? ""}</td>
                    {METRIQUES.map((m) => <td key={m.id} className="n">{a ? fmtNombre(s[m.id]) : "–"}</td>)}
                  </tr>
                );
              }) : <tr><td colSpan={7} className="vide">Aucune publication marquée « Publié » sur ce mois.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
