import { useEffect, useState, type FormEvent } from "react";
import { Download, ShieldCheck, Smartphone } from "lucide-react";
import { api } from "../data";
import type { EtatMfa } from "../data/api";
import { useSession } from "../etat/Session";
import { Entete, useAction } from "../composants/ui";
import { usePwa } from "../composants/Cadre";
import { installer } from "../pwa";
import { libelleRole } from "../regles";
import { reglesMotDePasse } from "./Connexion";

export function MonCompte() {
  const { profil, rafraichirProfil, deconnexion } = useSession();
  const { enCours, executer } = useAction();
  const pwa = usePwa();
  const [nom, setNom] = useState(profil?.nom ?? "");
  const [mdp, setMdp] = useState("");
  const [mdp2, setMdp2] = useState("");
  const [mfa, setMfa] = useState<EtatMfa | null>(null);
  const [inscription, setInscription] = useState<{ facteurId: string; qrSvg: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  useEffect(() => { api.mfaEtat().then(setMfa).catch(() => setMfa(null)); }, []);
  if (!profil) return null;

  const changerMdp = (e: FormEvent) => {
    e.preventDefault();
    if (!reglesMotDePasse(mdp)) return void executer(async () => { throw new Error("12 caractères minimum, avec majuscule, minuscule et chiffre."); });
    if (mdp !== mdp2) return void executer(async () => { throw new Error("Les deux saisies ne sont pas identiques."); });
    executer(async () => { await api.definirMotDePasse(mdp); setMdp(""); setMdp2(""); }, "Mot de passe modifié");
  };
  const qrSrc = inscription ? (inscription.qrSvg.startsWith("data:") ? inscription.qrSvg : `data:image/svg+xml;utf8,${encodeURIComponent(inscription.qrSvg)}`) : "";

  return (
    <div className="pile">
      <Entete titre="Mon compte" sous={`${profil.email} · ${libelleRole(profil.role)}`} />
      <div className="grille2">
        <section className="panneau"><h2>Profil et notifications</h2>
          <div className="pile">
            <div className="champ"><label htmlFor="m-nom">Nom affiché</label>
              <div className="outils"><input id="m-nom" type="text" maxLength={120} value={nom} onChange={(e) => setNom(e.target.value)} style={{ flex: 1 }} />
                <button className="btn" disabled={enCours || !nom.trim() || nom === profil.nom} onClick={() => executer(async () => { await api.majMonProfil({ nom: nom.trim() }); await rafraichirProfil(); }, "Nom enregistré")}>Enregistrer</button></div></div>
            <label className="outils" style={{ fontSize: 14 }}>
              <input type="checkbox" checked={profil.notif_email} onChange={(e) => executer(async () => { await api.majMonProfil({ notif_email: e.target.checked }); await rafraichirProfil(); }, "Préférence enregistrée")} />
              Recevoir aussi les notifications par courriel
            </label>
          </div>
        </section>

        <section className="panneau"><h2>Installer sur ce téléphone ou cet ordinateur</h2>
          {pwa.dejaInstallee ? <div className="bandeau ok"><Smartphone size={18} /> L'application est installée sur cet appareil.</div>
            : pwa.installable ? <button className="btn primaire" onClick={installer}><Download size={16} /> Installer l'application</button>
              : pwa.ios ? <p style={{ margin: 0, fontSize: 14 }}>Sur iPhone ou iPad : ouvrez cette page dans <b>Safari</b>, touchez le bouton <b>Partager</b>, puis <b>Sur l'écran d'accueil</b>.</p>
                : <p style={{ margin: 0, fontSize: 14 }}>Sur Android (Chrome) : menu <b>⋮</b> puis <b>Installer l'application</b>. Sur ordinateur (Chrome ou Edge) : icône d'installation à droite de la barre d'adresse.</p>}
        </section>
      </div>

      <div className="grille2">
        {!api.demo && <section className="panneau"><h2>Mot de passe</h2>
          <form className="pile" onSubmit={changerMdp}>
            <input type="text" autoComplete="username" value={profil.email} readOnly hidden />
            <div className="champ"><label htmlFor="m-mdp">Nouveau mot de passe</label><input id="m-mdp" type="password" autoComplete="new-password" value={mdp} onChange={(e) => setMdp(e.target.value)} /></div>
            <div className="champ"><label htmlFor="m-mdp2">Confirmation</label><input id="m-mdp2" type="password" autoComplete="new-password" value={mdp2} onChange={(e) => setMdp2(e.target.value)} /></div>
            <button className="btn" disabled={enCours || !mdp}>Changer le mot de passe</button>
          </form>
        </section>}

        {!api.demo && <section className="panneau"><h2><span><ShieldCheck size={16} /> Double authentification</span> <span className="aide">fortement conseillée pour les administrateurs</span></h2>
          {mfa?.actif ? (
            <div className="pile">
              <div className="bandeau ok">Activée : un code à 6 chiffres est demandé à chaque connexion.</div>
              <button className="btn danger" disabled={enCours} onClick={() => executer(async () => { await api.mfaRetirer(mfa.facteurId!); setMfa(await api.mfaEtat()); }, "Double authentification désactivée")}>Désactiver</button>
            </div>
          ) : inscription ? (
            <form className="pile" onSubmit={(e) => { e.preventDefault(); executer(async () => { await api.mfaConfirmer(inscription.facteurId, code); setInscription(null); setCode(""); setMfa(await api.mfaEtat()); }, "Double authentification activée"); }}>
              <p style={{ margin: 0, fontSize: 14 }}>1. Scannez ce code avec une application d'authentification (Microsoft Authenticator, Google Authenticator, FreeOTP…).</p>
              <div className="qr"><img src={qrSrc} alt="Code QR d'inscription" /></div>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", overflowWrap: "anywhere" }}>Ou saisissez la clé : <code>{inscription.secret}</code></p>
              <div className="champ"><label htmlFor="m-code">2. Code affiché par l'application</label><input id="m-code" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} /></div>
              <button className="btn primaire" disabled={enCours || code.replace(/\s/g, "").length !== 6}>Activer</button>
            </form>
          ) : (
            <button className="btn" disabled={enCours} onClick={() => executer(async () => setInscription(await api.mfaInscrire()))}>Activer la double authentification</button>
          )}
        </section>}
      </div>

      <section className="panneau"><h2>Sécurité de la session</h2>
        <div className="outils">
          <button className="btn" onClick={() => deconnexion()}>Se déconnecter</button>
          {!api.demo && <button className="btn danger" onClick={() => deconnexion(true)}>Se déconnecter de tous les appareils</button>}
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 0 }}>Téléphone perdu ou poste partagé : « tous les appareils » ferme immédiatement toutes vos sessions ouvertes.</p>
      </section>
    </div>
  );
}
