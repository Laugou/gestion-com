import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useDonnees } from "../etat/Donnees";
import { useSession } from "../etat/Session";
import { Entete, LignePublication, PastilleEtape } from "../composants/ui";
import { aujourdhui, cleMois, decalerMois, fmtHeure, fmtMois, isoDate, lireIso, lireStockage, ecrireStockage, premierDuMois, triParDate } from "../lib/outils";
import { ETAPES, peutEcrire } from "../regles";
import type { Publication } from "../types";

export function Planning() {
  const { publications, evenements, refs } = useDonnees();
  const { profil } = useSession();
  const nav = useNavigate();
  const [mois, setMois] = useState(() => premierDuMois(new Date()));
  const [filtres, setFiltres] = useState(() => lireStockage("gc-filtres-planning", { service: "", canal: "", annules: false }));
  const majFiltres = (f: typeof filtres) => { setFiltres(f); ecrireStockage("gc-filtres-planning", f); };
  const ecrit = peutEcrire(profil?.role);

  const visibles = useMemo(() => publications.filter((p) =>
    (filtres.annules || p.statut !== "annule") &&
    (!filtres.service || String(p.service_id) === filtres.service) &&
    (!filtres.canal || p.canaux.some((c) => String(c.canal_id) === filtres.canal))), [publications, filtres]);

  const parJour = useMemo(() => {
    const m: Record<string, Publication[]> = {};
    for (const p of visibles) if (p.date_diffusion) (m[p.date_diffusion] ??= []).push(p);
    Object.values(m).forEach((l) => l.sort(triParDate));
    return m;
  }, [visibles]);
  const evtsParJour = useMemo(() => {
    const m: Record<string, typeof evenements> = {};
    for (const e of evenements) (m[e.date_debut] ??= []).push(e);
    return m;
  }, [evenements]);

  const debut = new Date(mois); const decalage = (debut.getDay() + 6) % 7; debut.setDate(debut.getDate() - decalage);
  const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
  const cases = Math.ceil((decalage + nbJours) / 7) * 7;
  const t = aujourdhui(), cle = cleMois(mois);
  const jours = Array.from({ length: cases }, (_, i) => { const d = new Date(debut); d.setDate(d.getDate() + i); return d; });
  const joursDuMois = [...new Set([...Object.keys(parJour), ...Object.keys(evtsParJour)])].filter((k) => k.startsWith(cle)).sort();
  const sansDate = visibles.filter((p) => !p.date_diffusion && p.statut !== "annule");

  const Puce = ({ p }: { p: Publication }) => (
    <Link className="puce" to={`/publication/${p.id}`} style={{ ["--c" as string]: `var(--st-${p.statut})` }} title={p.titre}>
      {p.heure_diffusion && <b>{fmtHeure(p.heure_diffusion)} </b>}{p.titre}
    </Link>
  );

  return (
    <div className="pile">
      <Entete titre="Planning" sous="Toutes les diffusions prévues, tous canaux confondus">
        <select aria-label="Service" value={filtres.service} onChange={(e) => majFiltres({ ...filtres, service: e.target.value })} style={{ width: "auto" }}>
          <option value="">Tous les services</option>{refs.services.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
        <select aria-label="Canal" value={filtres.canal} onChange={(e) => majFiltres({ ...filtres, canal: e.target.value })} style={{ width: "auto" }}>
          <option value="">Tous les canaux</option>{refs.canaux.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
      </Entete>

      <div className="entete">
        <div className="outils">
          <button className="btn-icone" onClick={() => setMois(decalerMois(mois, -1))} aria-label="Mois précédent"><ChevronLeft size={18} /></button>
          <strong style={{ fontSize: 17, textTransform: "capitalize", minWidth: 150, textAlign: "center" }}>{fmtMois(mois)}</strong>
          <button className="btn-icone" onClick={() => setMois(decalerMois(mois, 1))} aria-label="Mois suivant"><ChevronRight size={18} /></button>
          <button className="btn petit discret" onClick={() => setMois(premierDuMois(new Date()))}>Aujourd'hui</button>
        </div>
        <div className="meta">{ETAPES.filter((e) => e.id !== "annule").map((e) => <PastilleEtape key={e.id} statut={e.id} />)}</div>
      </div>

      <div className="calendrier">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((j) => <div key={j} className="jsem">{j}</div>)}
        {jours.map((d) => {
          const k = isoDate(d), l = parJour[k] ?? [], ev = evtsParJour[k] ?? [];
          return (
            <div key={k} className={"jour" + (d.getMonth() !== mois.getMonth() ? " hors" : "") + (k === t ? " auj" : "")}>
              <button className="num" disabled={!ecrit} onClick={() => nav(`/publication/nouvelle?date=${k}`)} title={ecrit ? "Créer une publication ce jour" : undefined}>{d.getDate()}</button>
              {ev.map((e) => <Link key={e.id} className="puce evt" to="/evenements" style={{ ["--c" as string]: "var(--gold)" }}>{e.titre}</Link>)}
              {l.slice(0, 4).map((p) => <Puce key={p.id} p={p} />)}
              {l.length > 4 && <span className="canal">+{l.length - 4} autres</span>}
            </div>
          );
        })}
      </div>

      <div className="panneau agenda">
        {joursDuMois.length ? joursDuMois.map((k) => (
          <div className="ajour" key={k}>
            <h3>{lireIso(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</h3>
            {(evtsParJour[k] ?? []).map((e) => <Link key={e.id} className="puce evt" to="/evenements" style={{ ["--c" as string]: "var(--gold)" }}>Événement : {e.titre}</Link>)}
            {(parJour[k] ?? []).map((p) => <Puce key={p.id} p={p} />)}
          </div>
        )) : <div className="vide">Aucune diffusion datée ce mois-ci.</div>}
        {ecrit && <Link className="btn" to="/publication/nouvelle"><Plus size={16} /> Nouvelle publication</Link>}
      </div>

      <section className="panneau"><h2>Idées sans date <span className="aide">{sansDate.length}</span></h2>
        <div className="liste">
          {sansDate.length ? sansDate.map((p) => <LignePublication key={p.id} p={p} />) : <div className="vide">Notez ici les sujets à programmer plus tard : créez une publication sans date.</div>}
        </div>
      </section>
      <label className="outils" style={{ fontSize: 13 }}>
        <input type="checkbox" checked={filtres.annules} onChange={(e) => majFiltres({ ...filtres, annules: e.target.checked })} /> Afficher les publications annulées
      </label>
    </div>
  );
}
