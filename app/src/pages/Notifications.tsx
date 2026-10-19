import { Link, useNavigate } from "react-router-dom";
import { Bell, CalendarDays, LogOut, Settings, Star, User } from "lucide-react";
import { api } from "../data";
import { useDonnees } from "../etat/Donnees";
import { useSession } from "../etat/Session";
import { Entete, useAction } from "../composants/ui";
import { fmtHorodatage } from "../lib/outils";
import { libelleRole } from "../regles";

export function Notifications() {
  const { notifications, recharger } = useDonnees();
  const { executer } = useAction();
  const nav = useNavigate();
  const nonLues = notifications.filter((n) => !n.lue);
  const ouvrir = async (id: number, pid: string | null, lue: boolean) => {
    if (!lue) await executer(async () => { await api.marquerLues([id]); await recharger("notifications"); });
    if (pid) nav(`/publication/${pid}`);
  };
  return (
    <div className="pile">
      <Entete titre="Notifications" sous={`${nonLues.length} non lue${nonLues.length > 1 ? "s" : ""}`}>
        {nonLues.length > 0 && <button className="btn" onClick={() => executer(async () => { await api.marquerLues("toutes"); await recharger("notifications"); }, "Tout est marqué comme lu")}>Tout marquer comme lu</button>}
      </Entete>
      <section className="panneau">
        {notifications.length ? notifications.map((n) => (
          <button key={n.id} className={"notif" + (n.lue ? "" : " non-lue")} onClick={() => ouvrir(n.id, n.publication_id, n.lue)}>
            <Bell size={16} style={{ marginTop: 3, flex: "none" }} />
            <span><span style={{ display: "block", fontWeight: n.lue ? 500 : 700 }}>{n.message}</span><time>{fmtHorodatage(n.cree_le)}</time></span>
          </button>
        )) : <div className="vide">Aucune notification. Vous serez prévenu ici des validations demandées, des renvois et des commentaires.</div>}
      </section>
    </div>
  );
}

/** Menu « Plus » du téléphone */
export function Menu() {
  const { profil, deconnexion } = useSession();
  const { notifications } = useDonnees();
  const n = notifications.filter((x) => !x.lue).length;
  return (
    <div className="pile">
      <Entete titre="Menu" sous={profil ? `${profil.nom} · ${libelleRole(profil.role)}` : undefined} />
      <section className="panneau liste">
        <Link className="ligne" to="/evenements"><Star size={18} /> <span className="titre">Événements</span></Link>
        <Link className="ligne" to="/notifications"><Bell size={18} /> <span className="titre">Notifications {n > 0 && `(${n})`}</span></Link>
        <Link className="ligne" to="/planning"><CalendarDays size={18} /> <span className="titre">Planning</span></Link>
        {profil?.role === "admin" && <Link className="ligne" to="/administration"><Settings size={18} /> <span className="titre">Administration</span></Link>}
        <Link className="ligne" to="/compte"><User size={18} /> <span className="titre">Mon compte</span></Link>
        <button className="ligne" style={{ all: "unset", display: "flex", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)", cursor: "pointer" }} onClick={() => deconnexion()}>
          <LogOut size={18} /> <span className="titre">Se déconnecter</span>
        </button>
      </section>
    </div>
  );
}
