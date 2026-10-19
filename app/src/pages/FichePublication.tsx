import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Copy, FileText, Paperclip, Send, Sparkles, Trash2 } from "lucide-react";
import { api, ErreurApp } from "../data";
import { useDonnees } from "../etat/Donnees";
import { useSession } from "../etat/Session";
import { BoutonConfirmer, Chargement, Dialogue, Entete, PastilleEtape, useAction, useToast } from "../composants/ui";
import { copier, fmtHorodatage, fmtNombre, fmtTaille } from "../lib/outils";
import { ETAPES_CIRCUIT, libelleEtape, peutEcrire, peutValider, transitionAutorisee } from "../regles";
import type { ActionAssistant, Commentaire, EntreeHistorique, PieceJointe, Publication, PublicationSaisie, Stats, Statut } from "../types";

const vierge = (date?: string | null, evenement?: string | null, moi?: string): PublicationSaisie => ({
  titre: "", texte: "", service_id: null, evenement_id: evenement ?? null, statut: "redaction",
  date_diffusion: date ?? null, heure_diffusion: null, redacteur_id: moi ?? null, valideur_id: null, lien_visuel: null, notes: "", canaux: [],
});
const versSaisie = (p: Publication): PublicationSaisie => ({
  id: p.id, modifie_le: p.modifie_le, titre: p.titre, texte: p.texte, service_id: p.service_id, evenement_id: p.evenement_id,
  statut: p.statut, date_diffusion: p.date_diffusion, heure_diffusion: p.heure_diffusion ? p.heure_diffusion.slice(0, 5) : null,
  redacteur_id: p.redacteur_id, valideur_id: p.valideur_id, lien_visuel: p.lien_visuel, notes: p.notes,
  canaux: p.canaux.map((c) => ({ canal_id: c.canal_id, texte_specifique: c.texte_specifique })),
});

export function FichePublication() {
  const { id } = useParams();
  const [q] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const toast = useToast();
  const { profil } = useSession();
  const { publications, evenements, refs, pret, remplacerPublication, retirerPublication, personne, recharger } = useDonnees();
  const { enCours, executer } = useAction();
  const nouvelle = id === "nouvelle";
  const pub = nouvelle ? undefined : publications.find((p) => p.id === id);
  const role = profil?.role;
  const ecrit = peutEcrire(role);

  const initial = useMemo<PublicationSaisie | null>(() => {
    if (nouvelle) return (loc.state as { copie?: PublicationSaisie } | null)?.copie ?? vierge(q.get("date"), q.get("evenement"), profil?.id);
    return pub ? versSaisie(pub) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nouvelle, pub?.id, pub?.modifie_le]);
  const [f, setF] = useState<PublicationSaisie | null>(initial);
  const [base, setBase] = useState<string>(JSON.stringify(initial));
  useEffect(() => { setF(initial); setBase(JSON.stringify(initial)); }, [initial]);
  const modifie = f != null && JSON.stringify(f) !== base;
  const [renvoi, setRenvoi] = useState(false);

  // Avertit avant de quitter la page avec des modifications non enregistrées
  useEffect(() => {
    if (!modifie) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [modifie]);

  if (!pret) return <Chargement />;
  if (!f) return (
    <div className="pile"><Entete titre="Publication introuvable" />
      <div className="bandeau alerte">Cette publication n'existe plus ou a été supprimée.</div>
      <Link className="btn" to="/planning"><ArrowLeft size={16} /> Retour au planning</Link></div>
  );

  const maj = <K extends keyof PublicationSaisie>(k: K, v: PublicationSaisie[K]) => setF({ ...f, [k]: v });
  const statut = (pub?.statut ?? f.statut) as Statut;
  const lectureSeule = !ecrit || statut === "publie" && role !== "admin";
  const valideTouche = !peutValider(role) && (statut === "valide" || statut === "programme");

  async function enregistrer(etape?: Statut, message = "Publication enregistrée") {
    if (!f!.titre.trim()) { toast("Donnez un titre à la publication.", true); return; }
    if (etape === "programme" && !f!.date_diffusion) { toast("Indiquez une date de diffusion avant de programmer.", true); return; }
    const r = await executer(async () => {
      const p = await api.enregistrerPublication({ ...f!, statut: etape ?? f!.statut, heure_diffusion: f!.heure_diffusion || null, lien_visuel: f!.lien_visuel || null });
      remplacerPublication(p);
      return p;
    }, message);
    if (r) {
      const s = versSaisie(r); setF(s); setBase(JSON.stringify(s));
      if (nouvelle) nav(`/publication/${r.id}`, { replace: true });
      if (r.statut === "validation" && etape !== "validation" && statut !== "validation") toast("Texte modifié après validation : la publication repart en validation.");
    }
  }

  async function changerEtape(vers: Statut, motif?: string, message?: string) {
    if (modifie) { await enregistrer(vers, message); return; }
    const r = await executer(async () => { const p = await api.changerEtape(pub!.id, vers, motif); remplacerPublication(p); return p; }, message ?? `Étape : ${libelleEtape(vers)}`);
    if (r) { const s = versSaisie(r); setF(s); setBase(JSON.stringify(s)); }
  }

  const peut = (vers: Statut) => !nouvelle && transitionAutorisee(statut, vers, role);
  const canauxActifs = refs.canaux.filter((c) => c.actif || f.canaux.some((x) => x.canal_id === c.id));
  const longueur = f.texte.length;
  const evts = evenements.slice().sort((a, b) => b.date_debut.localeCompare(a.date_debut));
  const rangEtape = ETAPES_CIRCUIT.findIndex((e) => e.id === statut);

  return (
    <div className="pile">
      <Entete titre={nouvelle ? "Nouvelle publication" : f.titre || "Publication"} sous={!nouvelle && pub ? <>Créée par {personne(pub.cree_par)?.nom ?? "—"} · modifiée le {fmtHorodatage(pub.modifie_le)}</> : undefined}>
        <button className="btn discret" onClick={() => (history.length > 1 ? nav(-1) : nav("/planning"))}><ArrowLeft size={16} /> Retour</button>
      </Entete>

      {pub?.motif_retour && statut === "redaction" && <div className="bandeau alerte"><strong>Renvoyée par le valideur :</strong>&nbsp;{pub.motif_retour}</div>}
      {valideTouche && ecrit && <div className="bandeau">Cette publication est validée. Si vous modifiez le titre ou le texte, elle repartira automatiquement en validation.</div>}
      {statut === "publie" && role !== "admin" && <div className="bandeau">Publication diffusée : le contenu n'est plus modifiable. Vous pouvez saisir ses statistiques plus bas.</div>}

      <div className="fiche">
        <div className="pile zone-main">
          <section className="panneau"><h2>Contenu</h2>
            <div className="formulaire">
              <div className="champ large"><label htmlFor="p-titre">Titre interne</label>
                <input id="p-titre" type="text" value={f.titre} maxLength={200} disabled={lectureSeule} onChange={(e) => maj("titre", e.target.value)} placeholder="Ex. Annonce du marché de Noël" /></div>
              <div className="champ large"><label htmlFor="p-texte">Texte de la publication</label>
                <textarea id="p-texte" rows={9} value={f.texte} maxLength={20000} disabled={lectureSeule} onChange={(e) => maj("texte", e.target.value)} placeholder="Rédigez le message tel qu'il sera diffusé." />
                <div className="compteur">
                  <span>{fmtNombre(longueur)} caractères · {fmtNombre((f.texte.trim().match(/\S+/g) ?? []).length)} mots</span>
                  {f.canaux.map((c) => {
                    const ca = refs.canaux.find((x) => x.id === c.canal_id);
                    if (!ca?.limite_caracteres) return null;
                    const n = (c.texte_specifique ?? f.texte).length;
                    return <span key={ca.id} className={n > ca.limite_caracteres ? "depasse" : ""}>{ca.nom} : {fmtNombre(n)} / {fmtNombre(ca.limite_caracteres)}</span>;
                  })}
                </div>
              </div>
              <div className="champ large"><span className="etiquette">Canaux de diffusion</span>
                <div className="choix-canaux">
                  {canauxActifs.map((c) => (
                    <label key={c.id}>
                      <input type="checkbox" disabled={lectureSeule} checked={f.canaux.some((x) => x.canal_id === c.id)}
                        onChange={(e) => maj("canaux", e.target.checked ? [...f.canaux, { canal_id: c.id, texte_specifique: null }] : f.canaux.filter((x) => x.canal_id !== c.id))} />
                      <span className="canal" style={{ ["--c" as string]: c.couleur, color: "inherit" }}><i />{c.nom}</span>
                    </label>
                  ))}
                </div>
              </div>
              {f.canaux.map((c) => {
                const ca = refs.canaux.find((x) => x.id === c.canal_id); if (!ca) return null;
                const propre = c.texte_specifique != null;
                return (
                  <div className="champ large" key={c.canal_id}>
                    <label className="outils" style={{ fontSize: 12.5 }}>
                      <input type="checkbox" disabled={lectureSeule} checked={propre}
                        onChange={(e) => maj("canaux", f.canaux.map((x) => x.canal_id === c.canal_id ? { ...x, texte_specifique: e.target.checked ? f.texte : null } : x))} />
                      Texte différent pour {ca.nom}
                    </label>
                    {propre && <textarea aria-label={`Texte pour ${ca.nom}`} rows={4} disabled={lectureSeule} value={c.texte_specifique ?? ""}
                      onChange={(e) => maj("canaux", f.canaux.map((x) => x.canal_id === c.canal_id ? { ...x, texte_specifique: e.target.value } : x))} />}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panneau"><h2>Organisation</h2>
            <div className="formulaire">
              <div className="champ"><label htmlFor="p-service">Service</label>
                <select id="p-service" disabled={lectureSeule} value={f.service_id ?? ""} onChange={(e) => maj("service_id", e.target.value ? Number(e.target.value) : null)}>
                  <option value="">—</option>{refs.services.filter((s) => s.actif || s.id === f.service_id).map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select></div>
              <div className="champ"><label htmlFor="p-evt">Événement lié</label>
                <select id="p-evt" disabled={lectureSeule} value={f.evenement_id ?? ""} onChange={(e) => maj("evenement_id", e.target.value || null)}>
                  <option value="">Aucun</option>{evts.map((e) => <option key={e.id} value={e.id}>{e.titre} ({e.date_debut.split("-").reverse().join("/")})</option>)}
                </select></div>
              <div className="champ"><label htmlFor="p-date">Date de diffusion</label>
                <input id="p-date" type="date" disabled={lectureSeule} value={f.date_diffusion ?? ""} onChange={(e) => maj("date_diffusion", e.target.value || null)} /></div>
              <div className="champ"><label htmlFor="p-heure">Heure</label>
                <input id="p-heure" type="time" disabled={lectureSeule} value={f.heure_diffusion ?? ""} onChange={(e) => maj("heure_diffusion", e.target.value || null)} /></div>
              <div className="champ"><label htmlFor="p-redac">Rédigé par</label>
                <select id="p-redac" disabled={lectureSeule} value={f.redacteur_id ?? ""} onChange={(e) => maj("redacteur_id", e.target.value || null)}>
                  <option value="">—</option>{refs.profils.filter((p) => p.actif && p.role !== "lecteur" || p.id === f.redacteur_id).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select></div>
              <div className="champ"><label htmlFor="p-valid">Valideur</label>
                <select id="p-valid" disabled={lectureSeule} value={f.valideur_id ?? ""} onChange={(e) => maj("valideur_id", e.target.value || null)}>
                  <option value="">Tout valideur</option>{refs.profils.filter((p) => p.actif && (p.role === "valideur" || p.role === "admin") || p.id === f.valideur_id).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select></div>
              <div className="champ large"><label htmlFor="p-visuel">Lien vers le visuel (Canva, serveur…)</label>
                <input id="p-visuel" type="url" disabled={lectureSeule} value={f.lien_visuel ?? ""} onChange={(e) => maj("lien_visuel", e.target.value)} placeholder="https://…" /></div>
              <div className="champ large"><label htmlFor="p-notes">Notes internes</label>
                <textarea id="p-notes" rows={2} disabled={lectureSeule} value={f.notes} onChange={(e) => maj("notes", e.target.value)} placeholder="Contraintes, contacts, remarques de l'élu…" /></div>
            </div>
          </section>

          {pub && pub.canaux.length > 0 && ["valide", "programme", "publie"].includes(statut) && <BlocStats pub={pub} lectureSeule={!ecrit} onEnregistre={() => recharger("publications")} />}
        </div>

        <section className="panneau zone-etape"><h2>Étape <PastilleEtape statut={statut} /></h2>
            <div className="suivi-etapes" aria-label="Avancement">
              {ETAPES_CIRCUIT.map((e, i) => <span key={e.id} className={i === rangEtape ? "actuel" : i < rangEtape ? "fait" : ""}>{e.court}</span>)}
            </div>
            {pub?.valide_par && <p style={{ fontSize: 13, marginBottom: 0 }}>Validée par <strong>{personne(pub.valide_par)?.nom ?? "—"}</strong> le {fmtHorodatage(pub.valide_le!)}</p>}
            <div className="outils" style={{ marginTop: 12 }}>
              {(nouvelle || ["idee", "redaction"].includes(statut)) && ecrit &&
                <button className="btn primaire" disabled={enCours} onClick={() => (nouvelle ? enregistrer("validation", "Envoyée en validation") : changerEtape("validation", undefined, "Envoyée en validation"))}>Demander la validation</button>}
              {statut === "validation" && peut("valide") && <button className="btn succes" disabled={enCours} onClick={() => changerEtape("valide", undefined, "Publication validée")}>Valider</button>}
              {statut === "validation" && peutValider(role) && <button className="btn" disabled={enCours} onClick={() => setRenvoi(true)}>Renvoyer avec remarques</button>}
              {statut === "validation" && !peutValider(role) && peut("redaction") && <button className="btn" disabled={enCours} onClick={() => changerEtape("redaction", "", "Retirée de la validation")}>Retirer de la validation</button>}
              {peut("programme") && statut === "valide" && <button className="btn primaire" disabled={enCours} onClick={() => changerEtape("programme")}>Programmer</button>}
              {peut("publie") && <button className="btn succes" disabled={enCours} onClick={() => changerEtape("publie", undefined, "Marquée comme publiée")}>Marquer comme publiée</button>}
              {statut === "annule" && peut("redaction") && <button className="btn" disabled={enCours} onClick={() => changerEtape("redaction", undefined, "Publication réactivée")}>Réactiver</button>}
              {statut === "publie" && role === "admin" && <button className="btn" disabled={enCours} onClick={() => changerEtape("redaction", undefined, "Publication rouverte")}>Rouvrir (administrateur)</button>}
              {peut("annule") && statut !== "annule" && <BoutonConfirmer libelle="Annuler la diffusion" question="Annuler cette diffusion ?" onConfirmer={() => changerEtape("annule", undefined, "Diffusion annulée")} />}
            </div>
            {!ecrit && <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 0 }}>Vous consultez cette publication en lecture. Vous pouvez la commenter.</p>}
        </section>

        <div className="pile zone-cote">

          {!nouvelle && pub && <BlocPieces pub={pub} ecrit={ecrit} />}
          {ecrit && !lectureSeule && <BlocAssistant saisie={f} onRemplacer={(t) => maj("texte", t)} />}
          {!nouvelle && pub && <BlocCommentaires pub={pub} />}
          {!nouvelle && pub && <BlocHistorique pub={pub} />}
        </div>
      </div>

      {ecrit && (
        <div className="barre-actions">
          <div className="outils">
            {!nouvelle && pub && (role === "admin" || (pub.cree_par === profil?.id && ["idee", "redaction", "annule"].includes(statut))) &&
              <BoutonConfirmer libelle="Supprimer" question="Supprimer définitivement ?" onConfirmer={() => executer(async () => {
                await api.supprimerPublication(pub.id); retirerPublication(pub.id); nav("/planning", { replace: true });
              }, "Publication supprimée")} />}
            {!nouvelle && <button className="btn discret" onClick={() => nav("/publication/nouvelle", { state: { copie: { ...f, id: undefined, modifie_le: undefined, statut: "redaction", titre: `${f.titre} (copie)`, redacteur_id: profil?.id ?? null } } })}><Copy size={16} /> Dupliquer</button>}
          </div>
          <div className="outils">
            {modifie && <span style={{ fontSize: 13, color: "var(--muted)" }}>Modifications non enregistrées</span>}
            {modifie && !nouvelle && <button className="btn discret" onClick={() => setF(JSON.parse(base))}>Annuler les modifications</button>}
            {!lectureSeule && <button className="btn primaire" disabled={enCours || (!modifie && !nouvelle)} onClick={() => enregistrer()}>{nouvelle ? "Créer" : "Enregistrer"}</button>}
          </div>
        </div>
      )}

      {renvoi && <DialogueRenvoi onFermer={() => setRenvoi(false)} onEnvoyer={async (motif) => { setRenvoi(false); await changerEtape("redaction", motif, "Renvoyée au rédacteur"); }} />}
    </div>
  );
}

function DialogueRenvoi({ onFermer, onEnvoyer }: { onFermer: () => void; onEnvoyer: (m: string) => void }) {
  const [m, setM] = useState("");
  return (
    <Dialogue titre="Renvoyer avec remarques" onFermer={onFermer}
      pied={<><button className="btn" onClick={onFermer}>Annuler</button><button className="btn primaire" disabled={!m.trim()} onClick={() => onEnvoyer(m.trim())}>Renvoyer</button></>}>
      <div className="champ"><label htmlFor="motif">Ce qu'il faut modifier</label>
        <textarea id="motif" rows={4} maxLength={4000} value={m} onChange={(e) => setM(e.target.value)} placeholder="Ex. Préciser l'horaire et le lieu de rendez-vous." autoFocus /></div>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Le rédacteur est prévenu et retrouve vos remarques en tête de la fiche.</p>
    </Dialogue>
  );
}

function BlocStats({ pub, lectureSeule, onEnregistre }: { pub: Publication; lectureSeule: boolean; onEnregistre: () => void }) {
  const { canal } = useDonnees();
  const { enCours, executer } = useAction();
  const init = () => Object.fromEntries(pub.canaux.map((c) => [c.canal_id, { portee: c.portee, interactions: c.interactions, partages: c.partages, clics: c.clics, url_publication: c.url_publication } as Stats]));
  const [s, setS] = useState<Record<number, Stats>>(init);
  useEffect(() => setS(init()), [pub.modifie_le, pub.canaux]); // eslint-disable-line react-hooks/exhaustive-deps
  const champ = (cid: number, k: keyof Stats, v: string) =>
    setS({ ...s, [cid]: { ...s[cid], [k]: k === "url_publication" ? v || null : v === "" ? null : Math.max(0, Math.round(Number(v))) } });
  const enregistrer = () => executer(async () => {
    for (const c of pub.canaux) {
      const a = s[c.canal_id];
      if (JSON.stringify(a) !== JSON.stringify({ portee: c.portee, interactions: c.interactions, partages: c.partages, clics: c.clics, url_publication: c.url_publication }))
        await api.enregistrerStats(pub.id, c.canal_id, a);
    }
    onEnregistre();
  }, "Statistiques enregistrées");
  return (
    <section className="panneau"><h2>Statistiques après diffusion <span className="aide">relevées dans les outils de chaque réseau (Meta Business Suite…)</span></h2>
      <div className="stats-grille">
        <span className="t">Canal</span><span className="t">Portée</span><span className="t">Interactions</span><span className="t">Partages</span><span className="t">Clics</span>
        {pub.canaux.map((c) => {
          const ca = canal(c.canal_id);
          return [
            <span key={`n${c.canal_id}`} className="nom-canal">{ca?.nom}</span>,
            ...(["portee", "interactions", "partages", "clics"] as const).map((k) => (
              <input key={k + c.canal_id} type="number" min={0} step={1} inputMode="numeric" disabled={lectureSeule} aria-label={`${k} ${ca?.nom}`}
                placeholder={k === "portee" ? "Portée" : k === "interactions" ? "Interactions" : k === "partages" ? "Partages" : "Clics"}
                value={s[c.canal_id]?.[k] ?? ""} onChange={(e) => champ(c.canal_id, k, e.target.value)} />
            )),
          ];
        })}
      </div>
      <div className="formulaire" style={{ marginTop: 12 }}>
        {pub.canaux.map((c) => (
          <div className="champ" key={c.canal_id}><label htmlFor={`url-${c.canal_id}`}>Lien de la publication sur {canal(c.canal_id)?.nom}</label>
            <input id={`url-${c.canal_id}`} type="url" disabled={lectureSeule} value={s[c.canal_id]?.url_publication ?? ""} onChange={(e) => champ(c.canal_id, "url_publication", e.target.value)} placeholder="https://…" /></div>
        ))}
      </div>
      {!lectureSeule && <div className="outils" style={{ marginTop: 12 }}><button className="btn primaire" disabled={enCours} onClick={enregistrer}>Enregistrer les statistiques</button></div>}
    </section>
  );
}

function BlocPieces({ pub, ecrit }: { pub: Publication; ecrit: boolean }) {
  const { profil } = useSession();
  const { enCours, executer } = useAction();
  const [pieces, setPieces] = useState<PieceJointe[]>([]);
  const entree = useRef<HTMLInputElement>(null);
  const charger = useCallback(() => api.piecesJointes(pub.id).then(setPieces).catch(() => setPieces([])), [pub.id]);
  useEffect(() => { charger(); }, [charger]);
  const ouvrir = (p: PieceJointe) => executer(async () => { const u = await api.lienPieceJointe(p.chemin); window.open(u, "_blank", "noopener"); });
  return (
    <section className="panneau"><h2>Visuels et documents <span className="aide">images ou PDF, 20 Mo max.</span></h2>
      <div className="pieces">
        {pieces.length ? pieces.map((p) => (
          <div className="piece" key={p.id}>
            <FileText size={16} />
            <button className="lien" onClick={() => ouvrir(p)}>{p.nom_fichier}</button>
            <span className="canal">{fmtTaille(p.taille)}</span>
            {(profil?.role === "admin" || p.ajoute_par === profil?.id) &&
              <button className="btn-icone" style={{ width: 32, height: 32 }} aria-label={`Supprimer ${p.nom_fichier}`} disabled={enCours}
                onClick={() => executer(async () => { await api.supprimerPieceJointe(p); await charger(); }, "Fichier supprimé")}><Trash2 size={14} /></button>}
          </div>
        )) : <div className="vide" style={{ padding: 0 }}>Aucun fichier.</div>}
      </div>
      {ecrit && <>
        <input ref={entree} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf"
          onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; executer(async () => { for (const fi of fs) await api.ajouterPieceJointe(pub.id, fi); await charger(); }, fs.length > 1 ? "Fichiers ajoutés" : "Fichier ajouté"); }} />
        <button className="btn petit" style={{ marginTop: 10 }} disabled={enCours} onClick={() => entree.current?.click()}><Paperclip size={14} /> Ajouter un fichier</button>
      </>}
    </section>
  );
}

function BlocAssistant({ saisie, onRemplacer }: { saisie: PublicationSaisie; onRemplacer: (t: string) => void }) {
  const { refs, service } = useDonnees();
  const toast = useToast();
  const [sortie, setSortie] = useState<{ texte: string; action: ActionAssistant } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [indisponible, setIndisponible] = useState(false);
  if (indisponible) return null;
  async function lancer(action: ActionAssistant) {
    setEnCours(true); setSortie(null);
    try {
      const r = await api.assistant(action, {
        titre: saisie.titre, texte: saisie.texte, service: service(saisie.service_id)?.nom, date: saisie.date_diffusion ?? undefined,
        canaux: saisie.canaux.map((c) => refs.canaux.find((x) => x.id === c.canal_id)?.nom ?? "").filter(Boolean),
      });
      setSortie({ texte: r.texte + (r.coupe ? "\n\n(Réponse coupée : demandez moins à la fois.)" : ""), action });
    } catch (e) {
      if ((e as ErreurApp).code === "non_configure" || (e as Error).message === "non_configure") setIndisponible(true);
      else toast((e as Error).message, true);
    } finally { setEnCours(false); }
  }
  const remplacer = () => {
    if (!sortie) return;
    let t = sortie.texte;
    if (sortie.action === "relire") t = t.replace(/^\s*Version corrigée\s*:\s*/i, "").split(/\n\s*Remarques\s*:/i)[0].trim();
    onRemplacer(t); toast("Texte remplacé : pensez à enregistrer");
  };
  return (
    <section className="assistant" aria-busy={enCours}>
      <h2><Sparkles size={16} /> Assistant de rédaction</h2>
      <div className="outils">
        <button className="btn petit or" disabled={enCours} onClick={() => lancer("reformuler")}>Reformuler</button>
        <button className="btn petit or" disabled={enCours} onClick={() => lancer("adapter")}>Adapter à chaque canal</button>
        <button className="btn petit or" disabled={enCours} onClick={() => lancer("relire")}>Relire</button>
        <button className="btn petit or" disabled={enCours} onClick={() => lancer("court")}>Version courte</button>
      </div>
      {enCours && <div className="sortie">Rédaction en cours…</div>}
      {sortie && <>
        <div className="sortie">{sortie.texte}</div>
        <div className="outils">
          {sortie.action !== "adapter" && <button className="btn petit" onClick={remplacer}>Remplacer le texte</button>}
          <button className="btn petit" onClick={async () => toast((await copier(sortie.texte)) ? "Texte copié" : "Copie impossible : sélectionnez le texte.")}>Copier</button>
        </div>
      </>}
      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Propositions à relire : l'assistant signale entre crochets les informations manquantes, il n'en invente pas.</p>
    </section>
  );
}

function BlocCommentaires({ pub }: { pub: Publication }) {
  const { profil } = useSession();
  const { personne } = useDonnees();
  const { enCours, executer } = useAction();
  const [liste, setListe] = useState<Commentaire[]>([]);
  const [texte, setTexte] = useState("");
  const charger = useCallback(() => api.commentaires(pub.id).then(setListe).catch(() => setListe([])), [pub.id]);
  useEffect(() => { charger(); }, [charger, pub.modifie_le]);
  return (
    <section className="panneau"><h2>Commentaires</h2>
      <div className="fil">
        {liste.length ? liste.map((c) => (
          <div className="message" key={c.id}>
            <div className="qui"><span>{personne(c.auteur_id)?.nom ?? "Compte supprimé"} · {fmtHorodatage(c.cree_le)}</span>
              {(c.auteur_id === profil?.id || profil?.role === "admin") &&
                <button className="lien-btn" style={{ fontSize: 12 }} onClick={() => executer(async () => { await api.supprimerCommentaire(c.id); await charger(); })}>Supprimer</button>}
            </div>
            <p>{c.texte}</p>
          </div>
        )) : <div className="vide" style={{ padding: 0 }}>Aucun commentaire.</div>}
        <form onSubmit={(e) => { e.preventDefault(); if (!texte.trim()) return; executer(async () => { await api.ajouterCommentaire(pub.id, texte.trim()); setTexte(""); await charger(); }, "Commentaire ajouté"); }}>
          <label className="sr" htmlFor="com">Votre commentaire</label>
          <textarea id="com" rows={2} maxLength={4000} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Écrire un commentaire…" />
          <button className="btn petit" style={{ marginTop: 6 }} disabled={enCours || !texte.trim()}><Send size={14} /> Envoyer</button>
        </form>
      </div>
    </section>
  );
}

function BlocHistorique({ pub }: { pub: Publication }) {
  const { personne } = useDonnees();
  const [h, setH] = useState<EntreeHistorique[]>([]);
  useEffect(() => { api.historique(pub.id).then(setH).catch(() => setH([])); }, [pub.id, pub.modifie_le]);
  const decrire = (e: EntreeHistorique) =>
    e.action === "creation" ? `Création (${libelleEtape(e.nouveau_statut!)})`
      : e.action === "etape" ? `${libelleEtape(e.ancien_statut!)} → ${libelleEtape(e.nouveau_statut!)}${e.details ? ` : « ${e.details} »` : ""}`
        : e.action === "modification" ? "Contenu modifié" : e.action;
  return (
    <section className="panneau"><h2>Historique</h2>
      {h.length ? <ul className="histo">{h.slice(0, 30).map((e) => (
        <li key={e.id}><time>{fmtHorodatage(e.cree_le)} · {personne(e.auteur_id)?.nom ?? "Système"}</time>{decrire(e)}</li>
      ))}</ul> : <div className="vide" style={{ padding: 0 }}>Aucune entrée.</div>}
    </section>
  );
}
