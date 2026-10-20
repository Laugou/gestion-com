# Guide de mise en ligne — Gestion COM

Public : la personne qui installe (agent informatique, prestataire, intercommunalité).
Durée estimée : une demi-journée pour une personne habituée aux outils web.
Les points marqués **[À VÉRIFIER]** dépendent d'informations susceptibles d'évoluer (tarifs, menus).

---

## 0. Décisions à prendre avant de commencer

1. **Les comptes d'hébergement doivent appartenir à la commune**, pas à une personne :
   créez-les avec une adresse générique (ex. `informatique@mairie-cabannes.fr`) et notez les accès
   dans le coffre-fort de mots de passe de la mairie.
2. **RGPD — consultez le délégué à la protection des données (DPO)** avant la mise en service :
   - inscrire le traitement au registre (finalité : organisation de la communication municipale ;
     données : nom, adresse professionnelle, rôle des utilisateurs, contenus et commentaires) ;
   - Supabase propose un accord de sous-traitance (DPA) à signer ;
   - les données sont stockées à Paris, mais Supabase est une société américaine. Le DPO doit
     valider ce point. Alternative si refus : Supabase est un logiciel libre, il peut être installé
     chez un hébergeur français (OVHcloud, Scaleway, Clever Cloud) ; le code de Gestion COM
     fonctionne sans modification, seule l'installation change (plus technique).
3. **Adresse de l'application** : de préférence un sous-domaine de la mairie,
   ex. `com.mairie-cabannes.fr` (demande au gestionnaire du nom de domaine).
4. **Envoi de courriels** : un compte Brevo (société française) au nom de la mairie.
   Indispensable : sans prestataire d'envoi, Supabase n'envoie que quelques courriels par heure
   (environ 4) et ils arrivent souvent en indésirables. **[À VÉRIFIER]**

### Coûts indicatifs [À VÉRIFIER au moment de la souscription]

| Poste | Offre | Coût |
|---|---|---|
| Supabase | Pro (recommandé : pas de mise en veille, sauvegardes quotidiennes conservées 7 jours) | à partir de 25 $/mois |
| Supabase | Gratuit (essai uniquement : projet mis en pause après 1 semaine sans activité, pas de sauvegarde) | 0 € |
| Hébergement de l'application | GitHub Pages (dépôt public) ; ou Netlify / Cloudflare Pages | 0 € |
| Brevo | offre gratuite (quota quotidien limité) | 0 € |
| Assistant de rédaction (optionnel) | API Claude d'Anthropic, facturation à l'usage | quelques euros/mois pour un usage de service ; fixer un plafond |

---

## 1. Créer le projet Supabase

1. Créer un compte sur supabase.com (adresse générique de la mairie), puis une **organisation** « Commune de Cabannes ».
2. **New project** : nom `gestion-com`, mot de passe de base de données fort (à conserver),
   **région : West EU (Paris) — eu-west-3**.
3. Noter, dans *Project Settings > API* : l'**URL du projet**, la clé **anon** (publique) et la clé
   **service_role** (secrète : ne jamais la mettre dans l'application ni la transmettre par courriel).

## 2. Créer la base de données

Dans *SQL Editor*, exécuter **dans cet ordre** le contenu de chaque fichier :

1. `supabase/migrations/20261019000001_schema.sql`
2. `supabase/migrations/20261019000002_regles_acces.sql`
3. `supabase/migrations/20261019000003_fichiers_temps_reel.sql`
4. `supabase/seed.sql`

Chaque exécution doit afficher « Success ». (Variante en ligne de commande : `supabase link` puis `supabase db push`.)

## 3. Régler l'authentification

*Authentication > Sign In / Providers* :
- **Allow new users to sign up : désactivé** (les comptes ne s'ouvrent que sur invitation).
- Email : activé ; « Confirm email » : activé.

*Authentication > URL Configuration* :
- **Site URL** : l'adresse de l'application, ex. `https://com.mairie-cabannes.fr`
- **Redirect URLs** : ajouter `https://com.mairie-cabannes.fr/definir-mot-de-passe`

*Authentication > Emails* :
- **SMTP Settings** : renseigner les paramètres SMTP de Brevo (hôte, port, identifiant, clé),
  expéditeur `communication@mairie-cabannes.fr` (adresse à valider dans Brevo).
- **Templates** : remplacer « Invite user » et « Reset password » par les modèles français du dossier
  `supabase/modeles-courriels/` (objets conseillés en tête de chaque fichier).

*Authentication > Multi-Factor* : TOTP activé (permet la double authentification).

*Authentication > Policies (mots de passe)* : longueur minimale 12, avec minuscules, majuscules et chiffres.

## 4. Créer le premier compte (administrateur)

1. *Authentication > Users > Add user > Create new user* : votre adresse, un mot de passe
   (12 caractères minimum), « Auto Confirm User » coché.
2. Par sécurité, **aucun compte ne devient administrateur automatiquement** (sinon un inconnu
   pourrait s'inscrire avant vous et prendre ce rôle). Désignez-vous dans *SQL Editor* :
   ```sql
   update public.profils set role = 'admin', actif = true where email = 'votre.adresse@exemple.fr';
   ```
Les comptes suivants s'invitent depuis l'écran *Administration* de l'application. Un compte créé
autrement (console, inscription libre) reste inactif tant qu'un administrateur ne l'a pas activé.

## 5. Déployer les fonctions serveur

Sur un poste avec Node.js 20+ :

```bash
npm install -g supabase            # ou : npx supabase ...
supabase login
cd gestion-com
supabase link --project-ref VOTRE-REF-PROJET
supabase functions deploy admin-utilisateurs
supabase functions deploy assistant-redaction
supabase functions deploy notifier-email --no-verify-jwt

# Paramètres secrets (jamais dans le code)
supabase secrets set APP_URL=https://com.mairie-cabannes.fr
supabase secrets set WEBHOOK_SECRET=$(openssl rand -hex 24)   # conserver la valeur
supabase secrets set BREVO_API_KEY=xkeysib-...  EXPEDITEUR_EMAIL=communication@mairie-cabannes.fr  EXPEDITEUR_NOM="Gestion COM Cabannes"
# Optionnel : assistant de rédaction
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Sans `ANTHROPIC_API_KEY`, le bloc « Assistant de rédaction » disparaît simplement de l'application.
Si vous l'activez, ouvrez un compte sur console.anthropic.com au nom de la mairie et **fixez un plafond
de dépense mensuel**. Le modèle utilisé se règle avec `ASSISTANT_MODELE` (par défaut `claude-sonnet-5-5`).
Les textes envoyés à l'assistant sont transmis à Anthropic : à mentionner au DPO.

## 6. Courriels de notification (optionnel mais conseillé)

*Database > Webhooks > Create a new hook* :
- Table `notifications`, événement **Insert**
- Type : **Supabase Edge Functions**, fonction `notifier-email`, méthode POST
- En-tête HTTP : `x-webhook-secret` = la valeur de `WEBHOOK_SECRET`

Chaque utilisateur peut couper les courriels dans *Mon compte* ; les notifications restent visibles dans l'application.

## 7. Rappels quotidiens (optionnel)

*Database > Extensions* : activer **pg_cron**, puis exécuter `supabase/optionnel/rappels_quotidiens.sql`
dans le SQL Editor. Chaque matin vers 7 h : diffusion du lendemain non validée, validation en attente
depuis plus de 2 jours, statistiques non saisies 3 jours après diffusion.

## 8. Mettre en ligne l'application

### Option retenue : GitHub Pages (mise en ligne automatique)

Le dépôt GitHub contient tout le nécessaire (dossier `.github/workflows/`).

1. Dépôt GitHub > **Settings > Pages** > *Build and deployment* > Source : **GitHub Actions**.
2. Dès le premier envoi du code, l'onglet **Actions** lance « Application » : en l'absence de
   configuration Supabase, c'est la **version de démonstration** qui est publiée à l'adresse
   `https://<compte>.github.io/<nom-du-depot>/`.
3. Quand le projet Supabase est prêt : **Settings > Secrets and variables > Actions > New repository secret** :
   - `VITE_SUPABASE_URL` : l'URL du projet ;
   - `VITE_SUPABASE_ANON_KEY` : la clé **anon** (jamais la clé service_role).
   Puis *Actions > Application > Run workflow* : la vraie version remplace la démonstration.
4. Dans Supabase (étape 3), mettre comme **Site URL** `https://<compte>.github.io/<nom-du-depot>` et
   comme Redirect URL `https://<compte>.github.io/<nom-du-depot>/definir-mot-de-passe` ;
   et dans les secrets des fonctions (étape 5) `APP_URL=https://<compte>.github.io/<nom-du-depot>`.
5. **Domaine de la mairie (facultatif)** : *Settings > Pages > Custom domain* (ex. `com.mairie-cabannes.fr`,
   enregistrement DNS CNAME vers `<compte>.github.io`), cocher *Enforce HTTPS*, puis créer la variable
   `VITE_BASE` = `/` (*Secrets and variables > Actions > Variables*) et relancer « Application ».
   Mettre à jour les adresses Supabase et `APP_URL` en conséquence.

Les autres automatismes :
- **Tests** : à chaque modification, les 40 contrôles d'accès de la base et la vérification du code
  sont rejoués. Une croix rouge dans l'onglet Actions signale un problème : ne pas mettre en production.
- **Supabase** (lancement manuel) : applique les nouvelles migrations et redéploie les fonctions serveur.
  Secrets à créer : `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.
  Remplace les commandes de l'étape 5 (les secrets `supabase secrets set` restent à faire une fois).

Le dépôt est **public** : le code est lisible par tous, les données non (elles sont dans Supabase,
protégées par les règles d'accès). Ne jamais déposer dans le dépôt un fichier `.env`, une clé
service_role, un mot de passe ou un export de données (le fichier `.gitignore` bloque les `.env`).

### Autre possibilité : Netlify ou Cloudflare Pages

```bash
cd gestion-com/app
cp .env.example .env      # renseigner VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (VITE_BASE=/)
npm ci
npm run build             # produit le dossier app/dist
```

Netlify : *Deploy manually*, glisser `dist` (le fichier `_redirects` gère les adresses internes).
Cloudflare Pages : *Upload assets*, envoyer `dist`.

## 9. Installer sur les appareils

- **Android (Chrome)** : ouvrir l'adresse, menu ⋮ > *Installer l'application*.
- **iPhone / iPad (Safari)** : bouton *Partager* > *Sur l'écran d'accueil*.
- **Ordinateur (Chrome, Edge)** : icône d'installation dans la barre d'adresse.
L'écran *Mon compte* rappelle la marche à suivre selon l'appareil.

## 10. Recette avant ouverture (30 minutes)

1. Inviter un compte de chaque rôle (adresses de test) ; vérifier la réception du courriel d'invitation.
2. Rédacteur : créer une publication, l'envoyer en validation → le valideur reçoit la notification.
3. Valideur : renvoyer avec remarques → le rédacteur voit le motif ; puis valider.
4. Rédacteur : modifier le texte validé → la publication repasse « À valider ».
5. Lecteur : vérifier qu'il ne peut rien modifier mais peut commenter.
6. Déposer une image, l'ouvrir depuis un téléphone.
7. Désactiver un compte de test → il ne peut plus se connecter.
8. Saisir des statistiques, exporter le CSV, l'ouvrir dans Excel.

## 11. Exploitation

- **Sauvegardes** : quotidiennes avec l'offre Pro (7 jours). En complément, exporter chaque mois
  le CSV de l'année (écran Statistiques) dans le dossier partagé du service.
- **Départ d'un agent** : *Administration > Désactiver* le jour du départ (ses publications restent).
- **Tests** : après toute modification de la base, lancer `tests/lancer_tests.sh` (40 contrôles d'accès).
- **Mises à jour de sécurité** : une fois par trimestre, `npm outdated` dans `app/`, mise à jour, `npm run build`, redéploiement.
