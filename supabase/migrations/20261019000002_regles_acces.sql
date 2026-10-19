-- =====================================================================
-- Gestion COM — Migration 2 : règles d'accès (Row Level Security)
-- =====================================================================
-- Principe : personne n'accède à rien sans être connecté avec un compte actif.
--   lecteur    : lit tout
--   redacteur  : lit tout, crée et modifie publications, événements, statistiques
--   valideur   : comme rédacteur + valide ou renvoie les publications
--   admin      : tout, y compris comptes, services, canaux et suppressions
-- Ces règles sont appliquées par la base elle-même : même un appel direct à l'API,
-- sans passer par l'application, y est soumis.
-- =====================================================================

alter table public.profils            enable row level security;
alter table public.services           enable row level security;
alter table public.canaux             enable row level security;
alter table public.evenements         enable row level security;
alter table public.publications       enable row level security;
alter table public.publication_canaux enable row level security;
alter table public.pieces_jointes     enable row level security;
alter table public.commentaires       enable row level security;
alter table public.historique         enable row level security;
alter table public.notifications      enable row level security;

-- Les visiteurs non connectés n'ont aucun droit.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function public.mon_role(), public.est_actif(), public.est_admin(),
  public.peut_ecrire(), public.peut_valider(), public.est_systeme(),
  public.transition_autorisee(public.statut_publication, public.statut_publication, public.role_utilisateur)
  to authenticated;
-- Ces fonctions ne sont appelées que par la base (déclencheurs, tâche planifiée).
revoke execute on function public.rappels_quotidiens(), public.notifier(uuid, uuid, text, text) from authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
-- L'historique ne s'écrit que par déclencheur ; personne ne le modifie ni ne l'efface.
revoke insert, update, delete on public.historique from authenticated;

-- ---------- profils ----------
create policy "profils : lecture par les comptes actifs" on public.profils
  for select to authenticated using (public.est_actif() or id = auth.uid());
create policy "profils : chacun modifie son nom et ses préférences" on public.profils
  for update to authenticated using (id = auth.uid() and public.est_actif()) with check (id = auth.uid());
create policy "profils : l'administrateur modifie tous les comptes" on public.profils
  for update to authenticated using (public.est_admin()) with check (public.est_admin());
-- Pas de création ni de suppression depuis l'application : elles passent par la fonction serveur.

-- ---------- services et canaux ----------
create policy "services : lecture" on public.services for select to authenticated using (public.est_actif());
create policy "services : gestion par l'administrateur" on public.services for all to authenticated
  using (public.est_admin()) with check (public.est_admin());
create policy "canaux : lecture" on public.canaux for select to authenticated using (public.est_actif());
create policy "canaux : gestion par l'administrateur" on public.canaux for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- ---------- événements ----------
create policy "evenements : lecture" on public.evenements for select to authenticated using (public.est_actif());
create policy "evenements : création" on public.evenements for insert to authenticated with check (public.peut_ecrire());
create policy "evenements : modification" on public.evenements for update to authenticated
  using (public.peut_ecrire()) with check (public.peut_ecrire());
create policy "evenements : suppression" on public.evenements for delete to authenticated
  using (public.est_admin() or (cree_par = auth.uid() and public.peut_ecrire()));

-- ---------- publications ----------
create policy "publications : lecture" on public.publications for select to authenticated using (public.est_actif());
create policy "publications : création" on public.publications for insert to authenticated with check (public.peut_ecrire());
create policy "publications : modification" on public.publications for update to authenticated
  using (public.peut_ecrire()) with check (public.peut_ecrire());
-- Suppression : l'administrateur, ou l'auteur tant que la publication n'est pas validée.
create policy "publications : suppression" on public.publications for delete to authenticated
  using (public.est_admin()
         or (cree_par = auth.uid() and public.peut_ecrire() and statut in ('idee', 'redaction', 'annule')));

-- ---------- canaux d'une publication + statistiques ----------
create policy "publication_canaux : lecture" on public.publication_canaux for select to authenticated using (public.est_actif());
create policy "publication_canaux : écriture" on public.publication_canaux for all to authenticated
  using (public.peut_ecrire()) with check (public.peut_ecrire());

-- ---------- pièces jointes ----------
create policy "pieces_jointes : lecture" on public.pieces_jointes for select to authenticated using (public.est_actif());
create policy "pieces_jointes : ajout" on public.pieces_jointes for insert to authenticated
  with check (public.peut_ecrire() and ajoute_par = auth.uid());
create policy "pieces_jointes : suppression" on public.pieces_jointes for delete to authenticated
  using (public.est_admin() or (ajoute_par = auth.uid() and public.peut_ecrire()));

-- ---------- commentaires ----------
-- Les lecteurs (élus en consultation) peuvent aussi commenter.
create policy "commentaires : lecture" on public.commentaires for select to authenticated using (public.est_actif());
create policy "commentaires : ajout" on public.commentaires for insert to authenticated
  with check (public.est_actif() and auteur_id = auth.uid());
create policy "commentaires : suppression" on public.commentaires for delete to authenticated
  using (public.est_admin() or auteur_id = auth.uid());

-- ---------- historique ----------
create policy "historique : lecture" on public.historique for select to authenticated using (public.est_actif());

-- ---------- notifications : chacun ne voit que les siennes ----------
create policy "notifications : lecture des siennes" on public.notifications for select to authenticated
  using (destinataire_id = auth.uid());
create policy "notifications : marquer comme lue" on public.notifications for update to authenticated
  using (destinataire_id = auth.uid()) with check (destinataire_id = auth.uid());
create policy "notifications : effacer les siennes" on public.notifications for delete to authenticated
  using (destinataire_id = auth.uid());
-- Seule la colonne « lue » est modifiable par l'utilisateur.
revoke update on public.notifications from authenticated;
grant update (lue) on public.notifications to authenticated;
revoke insert on public.notifications from authenticated;
