import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { CONFIG_MANQUANTE, MODE_DEMO } from "./data";
import { FournisseurSession, useSession } from "./etat/Session";
import { FournisseurDonnees, useDonnees } from "./etat/Donnees";
import { Chargement, FournisseurToast } from "./composants/ui";
import { Cadre } from "./composants/Cadre";
import { CompteBloque, ConfigManquante, Connexion, DefinirMotDePasse } from "./pages/Connexion";
import { TableauDeBord } from "./pages/TableauDeBord";
import { Planning } from "./pages/Planning";
import { Validation } from "./pages/Validation";
import { FichePublication } from "./pages/FichePublication";
import { Evenements } from "./pages/Evenements";
import { Statistiques } from "./pages/Statistiques";
import { Menu, Notifications } from "./pages/Notifications";
import { Administration } from "./pages/Administration";
import { MonCompte } from "./pages/MonCompte";

function Application() {
  const { pret, erreur, recharger } = useDonnees();
  if (!pret) return <Chargement texte="Chargement des publications…" />;
  return (
    <Cadre>
      {erreur && <div className="bandeau erreur" role="alert">{erreur} <button className="btn petit" onClick={() => recharger()}>Réessayer</button></div>}
      <Routes>
        <Route path="/" element={<TableauDeBord />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/validation" element={<Validation />} />
        <Route path="/publication/:id" element={<FichePublication />} />
        <Route path="/evenements" element={<Evenements />} />
        <Route path="/statistiques" element={<Statistiques />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/administration" element={<Administration />} />
        <Route path="/compte" element={<MonCompte />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Cadre>
  );
}

function Aiguillage() {
  const { chargement, profil, compteBloque, recuperation, finRecuperation } = useSession();
  if (CONFIG_MANQUANTE) return <ConfigManquante />;
  if (chargement) return <Chargement />;
  if (recuperation) return <DefinirMotDePasse onTermine={finRecuperation} />;
  if (compteBloque) return <CompteBloque />;
  if (!profil) return <Connexion />;
  return <FournisseurDonnees><Application /></FournisseurDonnees>;
}

export function App() {
  // La démonstration tourne dans une page unique : la navigation reste en mémoire.
  const Routeur = MODE_DEMO ? MemoryRouter : BrowserRouter;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;
  return (
    <Routeur basename={MODE_DEMO ? undefined : base}>
      <FournisseurToast>
        <FournisseurSession>
          <Aiguillage />
        </FournisseurSession>
      </FournisseurToast>
    </Routeur>
  );
}
