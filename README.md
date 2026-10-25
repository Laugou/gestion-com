# Gestion COM — Commune de Cabannes

Application web installable (ordinateur, tablette, téléphone) pour planifier, faire valider et suivre
toutes les diffusions de la communication municipale du service VACC.

## Ce que fait l'application

| Écran | Rôle |
|---|---|
| Tableau de bord | À valider, 7 prochains jours, publiées du mois, points d'attention (retards, validations urgentes, statistiques manquantes), équilibre entre services |
| Planning | Calendrier mensuel tous canaux (agenda en liste sur téléphone), événements, idées sans date, filtres |
| Validation | Circuit Idée → Rédaction → À valider → Validé → Programmé → Publié (onglets sur téléphone) |
| Fiche publication | Texte, canaux, texte propre à chaque canal, compteur de caractères, visuels et PDF, commentaires, historique, assistant de rédaction, statistiques après diffusion, **publication directe sur Facebook et Instagram** une fois validée (bouton « Publier maintenant » ou envoi automatique à la date programmée) |
| Événements | Programmation municipale, et toutes les publications rattachées à chaque événement |
| Statistiques | Totaux, par canal, par service, évolution sur 6 mois, export CSV (Excel) du mois ou de l'année |
| Notifications | Validation demandée, validée, renvoyée avec motif, commentaire, rappels quotidiens (dans l'application et, en option, par courriel) |
| Administration | Invitation des comptes, rôles, désactivation, suppression ; listes des services et des canaux ; réseaux sociaux reliés et test de connexion ; sauvegarde |
| Mon compte | Nom, courriels on/off, mot de passe, double authentification, installation sur l'appareil, déconnexion de tous les appareils |

## Rôles

| Rôle | Droits |
|---|---|
| Administrateur | Tout, y compris comptes et listes ; peut forcer une étape |
| Rédacteur | Créer, modifier, envoyer en validation, programmer, marquer publié, saisir les statistiques |
| Valideur (élu, direction) | Comme rédacteur, et **valider** ou **renvoyer avec remarques** |
| Lecteur | Consulter et commenter |

Règles garanties **par la base de données elle-même** (et pas seulement par l'écran) :
un rédacteur ne peut pas valider ; un texte validé puis modifié par un non-valideur repart
automatiquement en validation ; l'historique n'est ni modifiable ni effaçable ; un compte
désactivé ne voit plus rien ; il reste toujours au moins un administrateur.

## Architecture

```
app/                    Application web (React + TypeScript + Vite), installable (PWA)
  src/data/             Accès aux données : supabaseApi.ts (réel) / demoApi.ts (démonstration)
  src/pages/            Écrans
supabase/
  migrations/           Structure de la base, règles d'accès, stockage des fichiers (à appliquer dans l'ordre)
  seed.sql              Services et canaux de départ
  functions/            Fonctions serveur : comptes, courriels, assistant de rédaction
  modeles-courriels/    Courriels d'invitation et de mot de passe en français
  optionnel/            Rappels quotidiens automatiques
tests/                  Tests des règles d'accès (40) et parcours automatisé de l'application (25)
GUIDE_DEPLOIEMENT.md    Mise en ligne pas à pas
.github/workflows/       Publication automatique sur GitHub Pages, tests, mise à jour Supabase
```

- **Hébergement des données** : Supabase (PostgreSQL), région Paris (`eu-west-3`).
- **Application** : fichiers statiques, publiés automatiquement sur GitHub Pages (ou Netlify, Cloudflare Pages, OVH…).
  Tant que Supabase n'est pas configuré, GitHub Pages publie la version de démonstration.
- **Sécurité** : comptes sur invitation uniquement, mots de passe de 12 caractères minimum, double
  authentification possible, déconnexion après 4 h d'inactivité (réglable), fichiers privés à liens
  temporaires (10 min), polices hébergées avec l'application (aucun appel à Google).

## Commandes utiles

```bash
cd app
npm ci                 # installer
npm run demo           # démonstration locale, sans serveur
npm run build          # version de production (nécessite le fichier .env)
npm run build:demo     # démonstration en un seul fichier HTML

# Tests des règles d'accès (PostgreSQL 15+ local)
PGHOST=... PGUSER=postgres tests/lancer_tests.sh
# Parcours automatisé (après npm run build:demo ; Python + Playwright)
python3 tests/parcours_demo.py /tmp/captures
```
