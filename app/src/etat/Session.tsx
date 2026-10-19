import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../data";
import type { Profil } from "../types";
import { effacerStockage } from "../lib/outils";

interface EtatSession {
  chargement: boolean;
  profil: Profil | null;
  /** Session ouverte mais compte désactivé ou sans profil */
  compteBloque: boolean;
  /** Arrivée par un lien d'invitation ou de réinitialisation */
  recuperation: boolean;
  finRecuperation: () => void;
  rafraichirProfil: () => Promise<void>;
  deconnexion: (partout?: boolean) => Promise<void>;
}

const Ctx = createContext<EtatSession | null>(null);
const INACTIVITE_MIN = Number(import.meta.env.VITE_DECONNEXION_INACTIVITE_MIN ?? 240);

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [chargement, setChargement] = useState(true);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [compteBloque, setCompteBloque] = useState(false);
  const [recuperation, setRecuperation] = useState(
    () => /type=(invite|recovery)/.test(location.hash) || location.pathname.endsWith("/definir-mot-de-passe"),
  );
  const derniereActivite = useRef(Date.now());

  const rafraichirProfil = useCallback(async () => {
    try {
      const p = await api.profilCourant();
      const ouverte = await api.sessionOuverte();
      setProfil(p && p.actif ? p : null);
      setCompteBloque(ouverte && (!p || !p.actif));
    } catch {
      setProfil(null);
    } finally {
      setChargement(false);
    }
  }, []);

  const deconnexion = useCallback(async (partout = false) => {
    effacerStockage("gc-cache-");
    await api.deconnexion(partout);
    setProfil(null); setCompteBloque(false);
  }, []);

  useEffect(() => {
    rafraichirProfil();
    return api.surSession((e) => {
      if (e === "recuperation") setRecuperation(true);
      if (e === "deconnexion") { setProfil(null); setCompteBloque(false); }
      else rafraichirProfil();
    });
  }, [rafraichirProfil]);

  // Déconnexion automatique après une période d'inactivité (postes partagés, téléphones perdus).
  useEffect(() => {
    if (!profil || !INACTIVITE_MIN || api.demo) return;
    const marquer = () => { derniereActivite.current = Date.now(); };
    const evts = ["pointerdown", "keydown", "visibilitychange"];
    evts.forEach((e) => window.addEventListener(e, marquer, { passive: true }));
    const t = setInterval(() => {
      if (Date.now() - derniereActivite.current > INACTIVITE_MIN * 60_000) deconnexion();
    }, 60_000);
    return () => { clearInterval(t); evts.forEach((e) => window.removeEventListener(e, marquer)); };
  }, [profil, deconnexion]);

  return (
    <Ctx.Provider value={{ chargement, profil, compteBloque, recuperation, finRecuperation: () => setRecuperation(false), rafraichirProfil, deconnexion }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error("FournisseurSession manquant");
  return c;
}
