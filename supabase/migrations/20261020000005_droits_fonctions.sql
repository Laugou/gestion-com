-- =====================================================================
-- Gestion COM — Migration 5 : les fonctions déclenchées par la base ne sont pas appelables
-- directement par les utilisateurs (recommandation du contrôle de sécurité Supabase).
-- Les fonctions de contrôle des droits (mon_role, est_actif, est_admin, peut_ecrire,
-- peut_valider) restent appelables : les règles d'accès en ont besoin, et elles ne
-- renvoient que des informations sur la personne connectée elle-même.
-- =====================================================================
revoke execute on function
  public.creer_profil(), public.proteger_profil(),
  public.avant_ecriture_publication(), public.apres_ecriture_publication(),
  public.avant_ecriture_canal(), public.apres_ecriture_canal(),
  public.apres_commentaire(), public.maj_evenement(),
  public.notifier(uuid, uuid, text, text), public.rappels_quotidiens()
from public, anon, authenticated;
