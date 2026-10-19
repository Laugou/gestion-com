import { useState, type FormEvent } from "react";
import { api } from "../data";
import { useSession } from "../etat/Session";

function Marque() {
  return <div className="marque"><small>Commune de Cabannes</small><strong>Gestion COM</strong><i /></div>;
}

export function Connexion() {
  const { rafraichirProfil } = useSession();
  const [etape, setEtape] = useState<"identifiants" | "mfa" | "oubli" | "oubli-envoye">("identifiants");
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function agir(e: FormEvent, fn: () => Promise<void>) {
    e.preventDefault(); setErreur(""); setEnCours(true);
    try { await fn(); } catch (x) { setErreur((x as Error).message); } finally { setEnCours(false); }
  }

  return (
    <div className="connexion">
      <div className="carte-connexion">
        <Marque />
        {api.demo && etape === "identifiants" && (
          <div className="bandeau alerte">Démonstration : choisissez un compte fictif ci-dessous (aucun mot de passe requis).</div>
        )}
        {etape === "identifiants" && (
          <form onSubmit={(e) => agir(e, async () => {
            const r = await api.connexion(email, mdp);
            if (r.mfaRequis) setEtape("mfa"); else await rafraichirProfil();
          })}>
            <div className="champ"><label htmlFor="c-email">Adresse électronique</label>
              <input id="c-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            {!api.demo && <div className="champ"><label htmlFor="c-mdp">Mot de passe</label>
              <input id="c-mdp" type="password" autoComplete="current-password" required value={mdp} onChange={(e) => setMdp(e.target.value)} /></div>}
            {erreur && <div className="bandeau erreur" role="alert">{erreur}</div>}
            <button className="btn primaire" disabled={enCours}>{enCours ? "Connexion…" : "Se connecter"}</button>
            {!api.demo && <button type="button" className="lien-btn" onClick={() => { setErreur(""); setEtape("oubli"); }}>Mot de passe oublié ?</button>}
            {api.demo && (
              <div className="outils">
                {[["responsable.vacc@exemple.fr", "Administrateur"], ["communication@exemple.fr", "Rédacteur"], ["elu@exemple.fr", "Valideur (élu)"], ["dgs@exemple.fr", "Lecteur"]].map(([m, l]) => (
                  <button type="button" key={m} className="btn petit" onClick={() => setEmail(m)}>{l}</button>
                ))}
              </div>
            )}
          </form>
        )}
        {etape === "mfa" && (
          <form onSubmit={(e) => agir(e, async () => { await api.verifierMfa(code); await rafraichirProfil(); })}>
            <p style={{ margin: 0 }}>Saisissez le code à 6 chiffres affiché par votre application d'authentification.</p>
            <div className="champ"><label htmlFor="c-code">Code de vérification</label>
              <input id="c-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></div>
            {erreur && <div className="bandeau erreur" role="alert">{erreur}</div>}
            <button className="btn primaire" disabled={enCours}>Valider</button>
            <button type="button" className="lien-btn" onClick={() => api.deconnexion().then(() => setEtape("identifiants"))}>Annuler</button>
          </form>
        )}
        {etape === "oubli" && (
          <form onSubmit={(e) => agir(e, async () => { await api.motDePasseOublie(email); setEtape("oubli-envoye"); })}>
            <p style={{ margin: 0 }}>Indiquez votre adresse : vous recevrez un lien pour choisir un nouveau mot de passe.</p>
            <div className="champ"><label htmlFor="o-email">Adresse électronique</label>
              <input id="o-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            {erreur && <div className="bandeau erreur" role="alert">{erreur}</div>}
            <button className="btn primaire" disabled={enCours}>Envoyer le lien</button>
            <button type="button" className="lien-btn" onClick={() => setEtape("identifiants")}>Retour</button>
          </form>
        )}
        {etape === "oubli-envoye" && (
          <>
            <div className="bandeau ok">Si un compte existe pour {email}, un courriel vient d'être envoyé. Pensez à vérifier les indésirables.</div>
            <button className="lien-btn" onClick={() => setEtape("identifiants")}>Retour à la connexion</button>
          </>
        )}
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Accès réservé aux agents et élus autorisés. Les comptes sont créés par l'administrateur du service.</p>
      </div>
    </div>
  );
}

export const reglesMotDePasse = (m: string) =>
  m.length >= 12 && /[a-z]/.test(m) && /[A-Z]/.test(m) && /\d/.test(m);

export function DefinirMotDePasse({ onTermine }: { onTermine: () => void }) {
  const [mdp, setMdp] = useState("");
  const [mdp2, setMdp2] = useState("");
  const [erreur, setErreur] = useState("");
  const [fait, setFait] = useState(false);
  const [enCours, setEnCours] = useState(false);
  async function envoyer(e: FormEvent) {
    e.preventDefault(); setErreur("");
    if (!reglesMotDePasse(mdp)) return setErreur("12 caractères minimum, avec au moins une majuscule, une minuscule et un chiffre.");
    if (mdp !== mdp2) return setErreur("Les deux saisies ne sont pas identiques.");
    setEnCours(true);
    try {
      if (!(await api.sessionOuverte())) throw new Error("Lien expiré ou déjà utilisé. Demandez un nouveau lien depuis « Mot de passe oublié ».");
      await api.definirMotDePasse(mdp); setFait(true);
    } catch (x) { setErreur((x as Error).message); } finally { setEnCours(false); }
  }
  return (
    <div className="connexion">
      <div className="carte-connexion">
        <Marque />
        {fait ? (
          <>
            <div className="bandeau ok">Mot de passe enregistré.</div>
            <button className="btn primaire" onClick={() => { history.replaceState(null, "", import.meta.env.BASE_URL); onTermine(); }}>Accéder à l'application</button>
          </>
        ) : (
          <form onSubmit={envoyer}>
            <h2 style={{ fontSize: 18 }}>Choisissez votre mot de passe</h2>
            <div className="champ"><label htmlFor="n-mdp">Nouveau mot de passe</label>
              <input id="n-mdp" type="password" autoComplete="new-password" value={mdp} onChange={(e) => setMdp(e.target.value)} required /></div>
            <div className="champ"><label htmlFor="n-mdp2">Confirmation</label>
              <input id="n-mdp2" type="password" autoComplete="new-password" value={mdp2} onChange={(e) => setMdp2(e.target.value)} required /></div>
            <div className="compteur"><span className={mdp && !reglesMotDePasse(mdp) ? "depasse" : ""}>12 caractères minimum, majuscule, minuscule et chiffre.</span></div>
            {erreur && <div className="bandeau erreur" role="alert">{erreur}</div>}
            <button className="btn primaire" disabled={enCours}>Enregistrer</button>
          </form>
        )}
      </div>
    </div>
  );
}

export function CompteBloque() {
  const { deconnexion } = useSession();
  return (
    <div className="connexion"><div className="carte-connexion">
      <Marque />
      <div className="bandeau alerte">Votre compte est désactivé ou n'a pas encore été configuré. Contactez l'administrateur du service VACC.</div>
      <button className="btn" onClick={() => deconnexion()}>Se déconnecter</button>
    </div></div>
  );
}

export function ConfigManquante() {
  return (
    <div className="connexion"><div className="carte-connexion">
      <Marque />
      <div className="bandeau erreur">Application non configurée : l'adresse du serveur (VITE_SUPABASE_URL) et la clé publique (VITE_SUPABASE_ANON_KEY) n'ont pas été renseignées lors de la construction. Voir le guide de déploiement, étape 4.</div>
    </div></div>
  );
}
