import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import type { Publication, Statut } from "../types";
import { libelleEtape } from "../regles";
import { useDonnees } from "../etat/Donnees";
import { fmtDateCourte, fmtHeure } from "../lib/outils";

/* ---------- Messages éphémères ---------- */
type Toast = { texte: string; erreur?: boolean } | null;
const CtxToast = createContext<(texte: string, erreur?: boolean) => void>(() => {});
export function FournisseurToast({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Toast>(null);
  const minuteur = useRef<number | undefined>(undefined);
  const afficher = useCallback((texte: string, erreur = false) => {
    setT({ texte, erreur });
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => setT(null), erreur ? 6000 : 2800);
  }, []);
  return (
    <CtxToast.Provider value={afficher}>
      {children}
      {t && <div className={"toast" + (t.erreur ? " erreur" : "")} role={t.erreur ? "alert" : "status"}>{t.texte}</div>}
    </CtxToast.Provider>
  );
}
export const useToast = () => useContext(CtxToast);

/** Exécute une action asynchrone : état « en cours » + message d'erreur lisible. */
export function useAction() {
  const toast = useToast();
  const [enCours, setEnCours] = useState(false);
  const executer = useCallback(async <T,>(fn: () => Promise<T>, succes?: string): Promise<T | undefined> => {
    setEnCours(true);
    try {
      const r = await fn();
      if (succes) toast(succes);
      return r;
    } catch (e) {
      toast((e as Error).message || "Une erreur est survenue.", true);
      return undefined;
    } finally {
      setEnCours(false);
    }
  }, [toast]);
  return { enCours, executer };
}

/* ---------- Pastilles ---------- */
export const PastilleEtape = ({ statut }: { statut: Statut }) => (
  <span className="etape" style={{ ["--c" as string]: `var(--st-${statut})` }}>{libelleEtape(statut)}</span>
);

export function PastillesCanaux({ ids }: { ids: number[] }) {
  const { canal } = useDonnees();
  return <>{ids.map((id) => {
    const c = canal(id); if (!c) return null;
    return <span key={id} className="canal" style={{ ["--c" as string]: c.couleur }}><i />{c.nom}</span>;
  })}</>;
}

export function MetaPublication({ p, sansEtape = false }: { p: Publication; sansEtape?: boolean }) {
  const { service } = useDonnees();
  const s = service(p.service_id);
  return (
    <div className="meta">
      {!sansEtape && <PastilleEtape statut={p.statut} />}
      {s && <span className="pill">{s.nom}</span>}
      <PastillesCanaux ids={p.canaux.map((c) => c.canal_id)} />
    </div>
  );
}

export function LignePublication({ p, droite }: { p: Publication; droite?: ReactNode }) {
  return (
    <Link className="ligne" to={`/publication/${p.id}`}>
      <div className="quand">{fmtDateCourte(p.date_diffusion)}{p.heure_diffusion && <><br />{fmtHeure(p.heure_diffusion)}</>}</div>
      <div className="corps"><div className="titre">{p.titre}</div><MetaPublication p={p} /></div>
      {droite}
    </Link>
  );
}

/* ---------- Fenêtre de dialogue ---------- */
export function Dialogue({ titre, onFermer, children, pied }: { titre: string; onFermer: () => void; children: ReactNode; pied?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onFermer]);
  return (
    <div className="voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="dialogue" role="dialog" aria-modal="true" aria-label={titre}>
        <header><h2>{titre}</h2><button className="btn-icone" onClick={onFermer} aria-label="Fermer"><X size={18} /></button></header>
        {children}
        {pied && <footer>{pied}</footer>}
      </div>
    </div>
  );
}

/** Bouton qui demande une confirmation sur place avant une action irréversible. */
export function BoutonConfirmer({ libelle, question, onConfirmer, petit = false, disabled = false }:
  { libelle: string; question: string; onConfirmer: () => void; petit?: boolean; disabled?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) return <button className={"btn danger" + (petit ? " petit" : "")} disabled={disabled} onClick={() => setOuvert(true)}>{libelle}</button>;
  return (
    <span className="confirmer">{question}
      <button className="btn danger petit" onClick={() => { setOuvert(false); onConfirmer(); }}>Oui</button>
      <button className="btn petit" onClick={() => setOuvert(false)}>Non</button>
    </span>
  );
}

export const Chargement = ({ texte = "Chargement…" }: { texte?: string }) => <div className="chargement" role="status">{texte}</div>;

export function Entete({ titre, sous, children }: { titre: string; sous?: ReactNode; children?: ReactNode }) {
  useEffect(() => { document.title = `${titre} — Gestion COM`; }, [titre]);
  return (
    <div className="entete">
      <div><h1>{titre}</h1>{sous && <div className="sous">{sous}</div>}</div>
      {children && <div className="outils">{children}</div>}
    </div>
  );
}
