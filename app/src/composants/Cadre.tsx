import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  Bell, CalendarDays, CheckSquare, ChartColumn, Download, LayoutDashboard, LogOut, Menu, Plus, RefreshCw, Settings, Star, User, WifiOff,
} from "lucide-react";
import { useSession } from "../etat/Session";
import { useDonnees } from "../etat/Donnees";
import { libelleRole, peutEcrire, peutValider } from "../regles";
import { api, type ApiDemo } from "../data";
import { appliquerMiseAJour, etatPwa, installer, surPwa } from "../pwa";

export function usePwa() {
  const [etat, setEtat] = useState(etatPwa);
  useEffect(() => surPwa(() => setEtat(etatPwa())), []);
  return etat;
}

function BarreDemo() {
  const { profil } = useSession();
  const { refs } = useDonnees();
  if (!api.demo) return null;
  const d = api as ApiDemo;
  return (
    <div className="demo-barre" role="note">
      <strong>Démonstration</strong>
      <span>Données fictives, conservées dans ce navigateur. Essayez chaque rôle :</span>
      <label className="sr" htmlFor="demo-role">Utilisateur</label>
      <select id="demo-role" value={profil?.id} onChange={(e) => d.changerUtilisateurDemo(e.target.value)}>
        {refs.profils.filter((p) => p.actif).map((p) => <option key={p.id} value={p.id}>{p.nom} ({libelleRole(p.role)})</option>)}
      </select>
      <button className="btn petit discret" onClick={() => d.reinitialiserDemo()}>Réinitialiser</button>
    </div>
  );
}

export function Cadre({ children }: { children: ReactNode }) {
  const { profil, deconnexion } = useSession();
  const { notifications, publications, horsLigne } = useDonnees();
  const pwa = usePwa();
  const nonLues = notifications.filter((n) => !n.lue).length;
  const aValider = publications.filter((p) => p.statut === "validation" && (peutValider(profil?.role) ? (!p.valideur_id || p.valideur_id === profil?.id) : p.redacteur_id === profil?.id)).length;
  const ecrit = peutEcrire(profil?.role);

  return (
    <div className="app">
      <aside className="lateral">
        <div className="marque"><small>Commune de Cabannes</small><strong>Gestion COM</strong><i /></div>
        <nav className="nav" aria-label="Navigation principale">
          <NavLink to="/" end><LayoutDashboard size={18} />Tableau de bord</NavLink>
          <NavLink to="/planning"><CalendarDays size={18} />Planning</NavLink>
          <NavLink to="/validation"><CheckSquare size={18} />Validation{aValider > 0 && <span className="compte">{aValider}</span>}</NavLink>
          <NavLink to="/evenements"><Star size={18} />Événements</NavLink>
          <NavLink to="/statistiques"><ChartColumn size={18} />Statistiques</NavLink>
          <NavLink to="/notifications"><Bell size={18} />Notifications{nonLues > 0 && <span className="compte">{nonLues}</span>}</NavLink>
          {profil?.role === "admin" && <NavLink to="/administration"><Settings size={18} />Administration</NavLink>}
          <NavLink to="/compte"><User size={18} />Mon compte</NavLink>
        </nav>
        <div className="pied">
          <div><strong>{profil?.nom}</strong><br />{profil && libelleRole(profil.role)}</div>
          {pwa.installable && <button onClick={installer}><Download size={14} /> Installer l'application</button>}
          <button onClick={() => deconnexion()}><LogOut size={14} /> Se déconnecter</button>
        </div>
      </aside>

      <header className="haut-mobile">
        <strong>Gestion COM</strong>
        <div className="outils">
          {ecrit && <Link className="btn-icone" to="/publication/nouvelle" aria-label="Nouvelle publication"><Plus size={20} /></Link>}
          <Link className="btn-icone cloche" to="/notifications" aria-label={`Notifications, ${nonLues} non lues`}>
            <Bell size={20} />{nonLues > 0 && <span className="pastille-n">{nonLues}</span>}
          </Link>
        </div>
      </header>

      <main className="principal">
        {horsLigne && <div className="bandeau alerte"><WifiOff size={18} /> Hors ligne : vous consultez la dernière copie enregistrée sur cet appareil. Les modifications sont impossibles jusqu'au retour du réseau.</div>}
        {pwa.miseAJour && <div className="bandeau"><RefreshCw size={18} /> Une nouvelle version de l'application est disponible. <button className="btn petit primaire" onClick={appliquerMiseAJour}>Mettre à jour</button></div>}
        <BarreDemo />
        {children}
      </main>

      <nav className="onglets" aria-label="Navigation">
        <NavLink to="/" end><LayoutDashboard size={21} />Accueil</NavLink>
        <NavLink to="/planning"><CalendarDays size={21} />Planning</NavLink>
        <NavLink to="/validation"><CheckSquare size={21} />Validation{aValider > 0 && <span className="compte">{aValider}</span>}</NavLink>
        <NavLink to="/statistiques"><ChartColumn size={21} />Stats</NavLink>
        <NavLink to="/menu"><Menu size={21} />Plus</NavLink>
      </nav>
    </div>
  );
}
