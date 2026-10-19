import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useDonnees } from "../etat/Donnees";
import { useSession } from "../etat/Session";
import { Entete, LignePublication } from "../composants/ui";
import { ajouterJours, aujourdhui, cleMois, fmtDateLongue, fmtMois, fmtNombre, pubADesStats, totalStats, triParDate } from "../lib/outils";
import { peutEcrire, peutValider } from "../regles";
import type { Publication } from "../types";

type Alerte = { p: Publication; niveau: "grave" | "moyen" | "info"; texte: string };

export function TableauDeBord() {
  const { publications, refs } = useDonnees();
  const { profil } = useSession();
  const t = aujourdhui(), dans7 = ajouterJours(t, 7), mois = cleMois(new Date());
  const actives = publications.filter((p) => p.statut !== "annule");

  const aValider = actives.filter((p) => p.statut === "validation").sort(triParDate);
  const prochains = actives.filter((p) => p.date_diffusion && p.date_diffusion >= t && p.date_diffusion <= dans7 && p.statut !== "publie").sort(triParDate);
  const publiesMois = actives.filter((p) => p.statut === "publie" && p.date_diffusion?.startsWith(mois));
  const interactions = publiesMois.reduce((a, p) => a + totalStats(p).interactions, 0);

  const alertes: Alerte[] = [];
  for (const p of actives) {
    const d = p.date_diffusion;
    if (d && d < t && p.statut !== "publie") alertes.push({ p, niveau: "grave", texte: "Date dépassée, non publiée" });
    else if (p.statut === "validation" && d && d <= ajouterJours(t, 3)) alertes.push({ p, niveau: "moyen", texte: "Validation urgente" });
    else if (["idee", "redaction"].includes(p.statut) && d && d <= ajouterJours(t, 3)) alertes.push({ p, niveau: "moyen", texte: "Pas encore soumise à validation" });
    else if (["valide", "programme"].includes(p.statut) && d && d <= dans7 && !p.canaux.length) alertes.push({ p, niveau: "moyen", texte: "Aucun canal choisi" });
    else if (p.statut === "publie" && d && d <= ajouterJours(t, -2) && d >= ajouterJours(t, -60) && !pubADesStats(p)) alertes.push({ p, niveau: "info", texte: "Statistiques à saisir" });
  }
  alertes.sort((a, b) => triParDate(a.p, b.p));

  const parService = refs.services.filter((s) => s.actif).map((s) => ({ s, n: actives.filter((p) => p.service_id === s.id && p.date_diffusion?.startsWith(mois)).length }));
  const maxS = Math.max(1, ...parService.map((x) => x.n));
  const mesValidations = peutValider(profil?.role) ? aValider.filter((p) => !p.valideur_id || p.valideur_id === profil?.id) : [];

  return (
    <div className="pile">
      <Entete titre="Tableau de bord" sous={fmtDateLongue(t)}>
        {peutEcrire(profil?.role) && <Link className="btn primaire" to="/publication/nouvelle"><Plus size={16} /> Nouvelle publication</Link>}
      </Entete>

      <div className="chiffres">
        <Link to="/validation" className={"chiffre" + (aValider.length ? " alerte" : "")}><span className="lib">À valider</span><span className="val">{aValider.length}</span><span className="note">{mesValidations.length ? `dont ${mesValidations.length} pour vous` : "en attente d'accord"}</span></Link>
        <Link to="/planning" className="chiffre"><span className="lib">7 prochains jours</span><span className="val">{prochains.length}</span><span className="note">diffusions prévues</span></Link>
        <Link to="/statistiques" className="chiffre"><span className="lib">Publiées ce mois</span><span className="val">{publiesMois.length}</span><span className="note">{fmtMois(new Date())}</span></Link>
        <Link to="/statistiques" className="chiffre"><span className="lib">Interactions ce mois</span><span className="val">{fmtNombre(interactions)}</span><span className="note">chiffres saisis</span></Link>
      </div>

      <div className="grille2">
        <section className="panneau"><h2>Points d'attention <span className="aide">{alertes.length} élément{alertes.length > 1 ? "s" : ""}</span></h2>
          <div className="liste">
            {alertes.length ? alertes.slice(0, 12).map((a) => <LignePublication key={a.p.id} p={a.p} droite={<span className={"signal " + a.niveau}>{a.texte}</span>} />)
              : <div className="vide">Rien à signaler : pas de retard, pas de validation urgente, statistiques à jour.</div>}
          </div>
        </section>
        <section className="panneau"><h2>Les 7 prochains jours</h2>
          <div className="liste">
            {prochains.length ? prochains.map((p) => <LignePublication key={p.id} p={p} />)
              : <div className="vide">Aucune diffusion prévue cette semaine.</div>}
          </div>
        </section>
      </div>

      <div className="grille2">
        <section className="panneau"><h2>À valider</h2>
          <div className="liste">
            {aValider.length ? aValider.map((p) => <LignePublication key={p.id} p={p} />) : <div className="vide">Aucune publication en attente de validation.</div>}
          </div>
        </section>
        <section className="panneau"><h2>Équilibre entre services <span className="aide">diffusions datées de ce mois</span></h2>
          {parService.map(({ s, n }) => (
            <div className="barre-h" key={s.id}><span>{s.nom}</span><div className="piste"><div className="rempli" style={{ width: `${(n / maxS) * 100}%`, background: s.couleur }} /></div><span className="n">{n}</span></div>
          ))}
        </section>
      </div>
    </div>
  );
}
