import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ErreurApp } from "../data";
import type { Canal, Evenement, Notification, Profil, Publication, References, Service } from "../types";
import { ecrireStockage, lireStockage } from "../lib/outils";
import { useSession } from "./Session";

interface EtatDonnees {
  pret: boolean;
  horsLigne: boolean;
  erreur: string | null;
  refs: References;
  publications: Publication[];
  evenements: Evenement[];
  notifications: Notification[];
  service: (id: number | null) => Service | undefined;
  canal: (id: number) => Canal | undefined;
  personne: (id: string | null) => Profil | undefined;
  recharger: (quoi?: "tout" | "publications" | "notifications" | "references" | "evenements") => Promise<void>;
  remplacerPublication: (p: Publication) => void;
  retirerPublication: (id: string) => void;
}

const Ctx = createContext<EtatDonnees | null>(null);
const VIDE: References = { services: [], canaux: [], profils: [] };

export function FournisseurDonnees({ children }: { children: ReactNode }) {
  const { profil } = useSession();
  const cleCache = profil ? `gc-cache-${profil.id}` : "";
  const [pret, setPret] = useState(false);
  const [horsLigne, setHorsLigne] = useState(!navigator.onLine);
  const [erreur, setErreur] = useState<string | null>(null);
  const [refs, setRefs] = useState<References>(VIDE);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const minuteur = useRef<number | undefined>(undefined);

  const recharger = useCallback<EtatDonnees["recharger"]>(async (quoi = "tout") => {
    try {
      if (quoi === "tout") {
        const [r, p, e, n] = await Promise.all([api.references(), api.publications(), api.evenements(), api.notifications()]);
        setRefs(r); setPublications(p); setEvenements(e); setNotifications(n);
        // Copie locale pour consulter le planning sans réseau (effacée à la déconnexion).
        if (cleCache) ecrireStockage(cleCache, { refs: r, publications: p, evenements: e, le: new Date().toISOString() });
      } else if (quoi === "publications") setPublications(await api.publications());
      else if (quoi === "notifications") setNotifications(await api.notifications());
      else if (quoi === "references") setRefs(await api.references());
      else if (quoi === "evenements") setEvenements(await api.evenements());
      setErreur(null); setHorsLigne(false);
    } catch (e) {
      const err = e as ErreurApp;
      if (err.code === "reseau" && cleCache) {
        const c = lireStockage<{ refs: References; publications: Publication[]; evenements: Evenement[] } | null>(cleCache, null);
        if (c) { setRefs(c.refs); setPublications(c.publications); setEvenements(c.evenements); }
        setHorsLigne(true);
      } else setErreur(err.message);
    } finally {
      setPret(true);
    }
  }, [cleCache]);

  useEffect(() => {
    if (!profil) return;
    setPret(false);
    recharger("tout");
    const stop = api.surChangements((quoi) => {
      // Regroupe les rafales de changements en un seul rechargement
      window.clearTimeout(minuteur.current);
      minuteur.current = window.setTimeout(() => recharger(quoi), 400);
    });
    const enLigne = () => recharger("tout");
    const horsL = () => setHorsLigne(true);
    const auRetour = () => { if (document.visibilityState === "visible") recharger("tout"); };
    window.addEventListener("online", enLigne);
    window.addEventListener("offline", horsL);
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      stop(); window.removeEventListener("online", enLigne); window.removeEventListener("offline", horsL);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, [profil, recharger]);

  const valeur = useMemo<EtatDonnees>(() => ({
    pret, horsLigne, erreur, refs, publications, evenements, notifications, recharger,
    service: (id) => refs.services.find((s) => s.id === id),
    canal: (id) => refs.canaux.find((c) => c.id === id),
    personne: (id) => refs.profils.find((p) => p.id === id),
    remplacerPublication: (p) => setPublications((l) => (l.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? p : x)) : [...l, p])),
    retirerPublication: (id) => setPublications((l) => l.filter((x) => x.id !== id)),
  }), [pret, horsLigne, erreur, refs, publications, evenements, notifications, recharger]);

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useDonnees() {
  const c = useContext(Ctx);
  if (!c) throw new Error("FournisseurDonnees manquant");
  return c;
}
