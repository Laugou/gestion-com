import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import type { Api } from "./api";
import { ErreurApp } from "./api";
import type { Publication, PublicationSaisie } from "../types";

/** Traduit les erreurs techniques en messages compréhensibles. */
function traduire(e: PostgrestError | Error | { message: string; code?: string } | null | undefined): ErreurApp {
  const msg = e?.message ?? "Erreur inconnue";
  const code = (e as PostgrestError)?.code;
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return new ErreurApp("Connexion au serveur impossible. Vérifiez votre accès à Internet.", "reseau");
  if (code === "42501" && /row-level security|permission denied/i.test(msg)) return new ErreurApp("Action non autorisée pour votre rôle.", "droits");
  if (/row-level security/i.test(msg)) return new ErreurApp("Action non autorisée pour votre rôle.", "droits");
  if (/JWT expired|invalid JWT|refresh_token/i.test(msg)) return new ErreurApp("Votre session a expiré : reconnectez-vous.", "session");
  if (/Invalid login credentials/i.test(msg)) return new ErreurApp("Adresse ou mot de passe incorrect.", "identifiants");
  if (/Email not confirmed/i.test(msg)) return new ErreurApp("Compte non confirmé : utilisez le lien reçu par courriel.", "identifiants");
  if (/User is banned/i.test(msg)) return new ErreurApp("Ce compte est désactivé. Contactez l'administrateur.", "identifiants");
  if (/Password should|weak password/i.test(msg)) return new ErreurApp("Mot de passe trop faible : 12 caractères minimum, avec majuscules, minuscules et chiffres.", "mdp");
  if (/rate limit/i.test(msg)) return new ErreurApp("Trop de tentatives. Patientez quelques minutes.", "limite");
  if (/Invalid TOTP|invalid.*code/i.test(msg)) return new ErreurApp("Code incorrect ou expiré.", "mfa");
  if (code === "23503") return new ErreurApp("Élément encore utilisé ailleurs : impossible de le supprimer.", "lien");
  if (code === "23505") return new ErreurApp("Cet élément existe déjà.", "doublon");
  if (code === "23514") return new ErreurApp("Valeur refusée (format ou limite non respectés).", "controle");
  // Les messages des règles métier de la base sont déjà rédigés en français.
  return new ErreurApp(msg, code);
}

function ok<T>(r: { data: T; error: PostgrestError | null }): NonNullable<T> {
  if (r.error) throw traduire(r.error);
  return r.data as NonNullable<T>;
}

const CHAMPS_PUBLICATION = "*, canaux:publication_canaux(canal_id, texte_specifique, url_publication, portee, interactions, partages, clics, stats_saisies_le, publie_le, erreur_publication, tentatives)";

export function creerApiSupabase(url: string, cle: string): Api {
  const sb: SupabaseClient = createClient(url, cle, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
  });

  async function moi(): Promise<string> {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new ErreurApp("Votre session a expiré : reconnectez-vous.", "session");
    return id;
  }

  async function appelerFonction<T>(nom: string, corps: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.functions.invoke(nom, { body: corps });
    if (error) {
      let detail: { erreur?: string } | null = null;
      try { detail = await (error as { context?: Response }).context?.json(); } catch { /* */ }
      throw new ErreurApp(detail?.erreur ?? "Le serveur n'a pas répondu. Réessayez.", detail?.erreur);
    }
    return data as T;
  }

  const api: Api = {
    demo: false,

    async profilCourant() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      const r = await sb.from("profils").select("*").eq("id", data.session.user.id).maybeSingle();
      if (r.error) throw traduire(r.error);
      return r.data;
    },
    surSession(cb) {
      const { data } = sb.auth.onAuthStateChange((evt) => {
        if (evt === "SIGNED_OUT") cb("deconnexion");
        else if (evt === "PASSWORD_RECOVERY") cb("recuperation");
        else if (evt === "SIGNED_IN" || evt === "MFA_CHALLENGE_VERIFIED") cb("connexion");
      });
      return () => data.subscription.unsubscribe();
    },
    async sessionOuverte() {
      const { data } = await sb.auth.getSession();
      return !!data.session;
    },
    async connexion(email, motDePasse) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: motDePasse });
      if (error) throw traduire(error);
      const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      return { mfaRequis: data?.nextLevel === "aal2" && data.currentLevel !== "aal2" };
    },
    async verifierMfa(code) {
      const f = await sb.auth.mfa.listFactors();
      const facteur = f.data?.totp.find((x) => x.status === "verified");
      if (!facteur) throw new ErreurApp("Aucune double authentification active sur ce compte.");
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: facteur.id, code: code.replace(/\s/g, "") });
      if (error) throw traduire(error);
    },
    async deconnexion(partout = false) {
      await sb.auth.signOut({ scope: partout ? "global" : "local" });
    },
    async motDePasseOublie(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}${import.meta.env.BASE_URL}definir-mot-de-passe` });
      if (error) throw traduire(error);
    },
    async definirMotDePasse(motDePasse) {
      const { error } = await sb.auth.updateUser({ password: motDePasse });
      if (error) throw traduire(error);
    },
    async mfaEtat() {
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) throw traduire(error);
      const f = data.totp.find((x) => x.status === "verified");
      return { actif: !!f, facteurId: f?.id };
    },
    async mfaInscrire() {
      // Nettoie une inscription précédente non terminée
      const l = await sb.auth.mfa.listFactors();
      for (const f of l.data?.all ?? []) if (f.status === "unverified") await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Gestion COM" });
      if (error) throw traduire(error);
      if (data.type !== "totp") throw new ErreurApp("Type d'authentification inattendu.");
      return { facteurId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret };
    },
    async mfaConfirmer(facteurId, code) {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: facteurId, code: code.replace(/\s/g, "") });
      if (error) throw traduire(error);
    },
    async mfaRetirer(facteurId) {
      const { error } = await sb.auth.mfa.unenroll({ factorId: facteurId });
      if (error) throw traduire(error);
    },
    async majMonProfil(champs) {
      ok(await sb.from("profils").update(champs).eq("id", await moi()));
    },

    async references() {
      const [s, c, p] = await Promise.all([
        sb.from("services").select("*").order("ordre").order("nom"),
        sb.from("canaux").select("*").order("ordre").order("nom"),
        sb.from("profils").select("*").order("nom"),
      ]);
      return { services: ok(s), canaux: ok(c), profils: ok(p) };
    },
    async publications() {
      return ok(await sb.from("publications").select(CHAMPS_PUBLICATION).order("date_diffusion", { nullsFirst: false })) as Publication[];
    },
    async enregistrerPublication(p: PublicationSaisie) {
      const { canaux, id, modifie_le, ...champs } = p;
      let pub: Publication;
      if (id) {
        // Contrôle de version : refuse d'écraser une modification faite entre-temps par quelqu'un d'autre.
        let q = sb.from("publications").update(champs).eq("id", id);
        if (modifie_le) q = q.eq("modifie_le", modifie_le);
        const r = await q.select(CHAMPS_PUBLICATION);
        const lignes = ok(r) as Publication[];
        if (!lignes.length) {
          throw new ErreurApp("Cette publication a été modifiée par quelqu'un d'autre pendant votre saisie. Rechargez-la avant d'enregistrer.", "conflit");
        }
        pub = lignes[0];
      } else {
        pub = ok(await sb.from("publications").insert(champs).select(CHAMPS_PUBLICATION).single()) as Publication;
      }
      // Canaux : retire ceux décochés, ajoute ou met à jour les autres.
      const voulus = new Map(canaux.map((c) => [c.canal_id, c]));
      const retires = pub.canaux.filter((c) => !voulus.has(c.canal_id)).map((c) => c.canal_id);
      if (retires.length) ok(await sb.from("publication_canaux").delete().eq("publication_id", pub.id).in("canal_id", retires));
      const aEcrire = canaux.filter((c) => {
        const actuel = pub.canaux.find((x) => x.canal_id === c.canal_id);
        return !actuel || (actuel.texte_specifique ?? "") !== (c.texte_specifique ?? "");
      });
      if (aEcrire.length) {
        ok(await sb.from("publication_canaux").upsert(
          aEcrire.map((c) => ({ publication_id: pub.id, canal_id: c.canal_id, texte_specifique: c.texte_specifique || null })),
          { onConflict: "publication_id,canal_id" }));
      }
      return ok(await sb.from("publications").select(CHAMPS_PUBLICATION).eq("id", pub.id).single()) as Publication;
    },
    async changerEtape(id, statut, motif) {
      const champs: Record<string, unknown> = { statut };
      if (motif !== undefined) champs.motif_retour = motif;
      return ok(await sb.from("publications").update(champs).eq("id", id).select(CHAMPS_PUBLICATION).single()) as Publication;
    },
    async supprimerPublication(id) {
      const r = await sb.from("publications").delete().eq("id", id).select("id");
      if (!ok(r).length) throw new ErreurApp("Suppression non autorisée : seul l'auteur (avant validation) ou un administrateur peut supprimer.", "droits");
    },
    async enregistrerStats(publicationId, canalId, s) {
      ok(await sb.from("publication_canaux").update({
        portee: s.portee, interactions: s.interactions, partages: s.partages, clics: s.clics,
        url_publication: s.url_publication ?? null,
      }).eq("publication_id", publicationId).eq("canal_id", canalId));
    },

    async historique(pid) {
      return ok(await sb.from("historique").select("*").eq("publication_id", pid).order("cree_le", { ascending: false }).limit(200));
    },
    async commentaires(pid) {
      return ok(await sb.from("commentaires").select("*").eq("publication_id", pid).order("cree_le"));
    },
    async ajouterCommentaire(pid, texte) {
      ok(await sb.from("commentaires").insert({ publication_id: pid, texte, auteur_id: await moi() }));
    },
    async supprimerCommentaire(id) {
      ok(await sb.from("commentaires").delete().eq("id", id));
    },

    async piecesJointes(pid) {
      return ok(await sb.from("pieces_jointes").select("*").eq("publication_id", pid).order("ajoute_le"));
    },
    async ajouterPieceJointe(pid, fichier) {
      if (fichier.size > 20 * 1024 * 1024) throw new ErreurApp("Fichier trop lourd : 20 Mo maximum.");
      const nomSur = fichier.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-120);
      const chemin = `${pid}/${crypto.randomUUID()}-${nomSur}`;
      const up = await sb.storage.from("visuels").upload(chemin, fichier, { contentType: fichier.type, upsert: false });
      if (up.error) throw new ErreurApp(/mime|type/i.test(up.error.message) ? "Type de fichier refusé : images (JPG, PNG, WebP, GIF, SVG) ou PDF uniquement." : traduire(up.error).message);
      const r = await sb.from("pieces_jointes").insert({
        publication_id: pid, chemin, nom_fichier: fichier.name.slice(0, 255), type_mime: fichier.type, taille: fichier.size, ajoute_par: await moi(),
      });
      if (r.error) { await sb.storage.from("visuels").remove([chemin]); throw traduire(r.error); }
    },
    async lienPieceJointe(chemin) {
      const { data, error } = await sb.storage.from("visuels").createSignedUrl(chemin, 600);
      if (error) throw traduire(error);
      return data.signedUrl;
    },
    async supprimerPieceJointe(piece) {
      const r = await sb.from("pieces_jointes").delete().eq("id", piece.id).select("id");
      if (!ok(r).length) throw new ErreurApp("Suppression non autorisée.", "droits");
      await sb.storage.from("visuels").remove([piece.chemin]);
    },

    async evenements() {
      return ok(await sb.from("evenements").select("*").order("date_debut"));
    },
    async enregistrerEvenement(e) {
      const { id, ...champs } = e;
      delete (champs as Record<string, unknown>).cree_par;
      if (id) return ok(await sb.from("evenements").update(champs).eq("id", id).select("*").single());
      return ok(await sb.from("evenements").insert(champs).select("*").single());
    },
    async supprimerEvenement(id) {
      const r = await sb.from("evenements").delete().eq("id", id).select("id");
      if (!ok(r).length) throw new ErreurApp("Suppression non autorisée.", "droits");
    },

    async notifications() {
      return ok(await sb.from("notifications").select("id, publication_id, type, message, lue, cree_le")
        .order("cree_le", { ascending: false }).limit(100));
    },
    async marquerLues(ids) {
      let q = sb.from("notifications").update({ lue: true }).eq("destinataire_id", await moi()).eq("lue", false);
      if (ids !== "toutes") q = q.in("id", ids);
      ok(await q);
    },

    surChangements(cb) {
      let canal: ReturnType<SupabaseClient["channel"]> | null = null;
      let annule = false;
      (async () => {
        const id = (await sb.auth.getSession()).data.session?.user.id;
        if (!id || annule) return;
        canal = sb.channel("gestion-com")
          .on("postgres_changes", { event: "*", schema: "public", table: "publications" }, () => cb("publications"))
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `destinataire_id=eq.${id}` }, () => cb("notifications"))
          .subscribe();
      })();
      return () => { annule = true; if (canal) sb.removeChannel(canal); };
    },

    async inviter(email, nom, role) {
      await appelerFonction("admin-utilisateurs", { action: "inviter", email, nom, role });
    },
    async changerRole(id, role) {
      ok(await sb.from("profils").update({ role }).eq("id", id));
    },
    async activerCompte(id, actif) {
      await appelerFonction("admin-utilisateurs", { action: actif ? "reactiver" : "desactiver", user_id: id });
    },
    async supprimerCompte(id) {
      await appelerFonction("admin-utilisateurs", { action: "supprimer", user_id: id });
    },
    async enregistrerService(s) {
      const { id, ...champs } = s;
      ok(id ? await sb.from("services").update(champs).eq("id", id) : await sb.from("services").insert(champs));
    },
    async enregistrerCanal(c) {
      const { id, ...champs } = c;
      ok(id ? await sb.from("canaux").update(champs).eq("id", id) : await sb.from("canaux").insert(champs));
    },

    async exportComplet() {
      // Lecture par tranches de 1 000 lignes (limite par requête du serveur).
      const tout = async (table: string, colonnes = "*") => {
        const lignes: unknown[] = [];
        for (let debut = 0; ; debut += 1000) {
          const r = await sb.from(table).select(colonnes).range(debut, debut + 999);
          const lot = ok(r) as unknown[];
          lignes.push(...lot);
          if (lot.length < 1000) return lignes;
        }
      };
      const tables: [string, string?][] = [
        ["services"], ["canaux"], ["profils", "id, nom, email, role, actif, notif_email, cree_le"], ["evenements"],
        ["publications"], ["publication_canaux"], ["commentaires"], ["pieces_jointes"], ["historique"], ["journal_publications"],
      ];
      const sortie: Record<string, unknown[]> = {};
      for (const [t, c] of tables) sortie[t] = await tout(t, c);
      return sortie;
    },
    async publierReseaux(publicationId) {
      return appelerFonction("publier-reseaux", { action: "publier", publication_id: publicationId });
    },
    async etatReseaux() {
      return appelerFonction("publier-reseaux", { action: "etat" });
    },
    async assistant(action, donnees) {
      return appelerFonction("assistant-redaction", { action, ...donnees });
    },
  };
  return api;
}
