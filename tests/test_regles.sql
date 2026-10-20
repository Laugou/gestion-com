-- Tests des règles d'accès et du circuit de validation.
-- Lancer avec : tests/lancer_tests.sh  (PostgreSQL 15+ requis)
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create schema tests;
create table tests.resultats (n serial, test text, ok boolean, detail text);
grant usage on schema tests to authenticated, anon;
grant insert, select on tests.resultats to authenticated, anon;
grant usage on sequence tests.resultats_n_seq to authenticated, anon;

-- Vérifie qu'une requête échoue
create function tests.doit_echouer(p_test text, p_sql text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into tests.resultats (test, ok, detail) values (p_test, false, 'aucune erreur');
  exception when others then
    insert into tests.resultats (test, ok, detail) values (p_test, true, sqlerrm);
  end;
end $$;
create function tests.verifier(p_test text, p_cond boolean, p_detail text default null) returns void language plpgsql as $$
begin insert into tests.resultats (test, ok, detail) values (p_test, coalesce(p_cond, false), p_detail); end $$;
grant execute on all functions in schema tests to authenticated, anon;

-- Comptes de test
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.fr', '{"nom":"Administrateur"}'),
  ('00000000-0000-0000-0000-00000000000b', 'redac@test.fr',   '{"nom":"Rédactrice"}'),
  ('00000000-0000-0000-0000-00000000000c', 'elu@test.fr',     '{"nom":"Élu valideur"}'),
  ('00000000-0000-0000-0000-00000000000d', 'lecteur@test.fr', '{"nom":"Lecteur"}'),
  ('00000000-0000-0000-0000-00000000000e', 'parti@test.fr',   '{"nom":"Ancien agent"}');

select tests.verifier('Premier compte = administrateur',
  (select role from public.profils where email = 'admin@test.fr') = 'admin');
select tests.verifier('Comptes suivants = lecteur par défaut',
  (select bool_and(role = 'lecteur') from public.profils where email <> 'admin@test.fr'));
select tests.verifier('Compte créé hors invitation = inactif par défaut',
  (select bool_and(not actif) from public.profils where email <> 'admin@test.fr'));
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000000f', 'invite@test.fr', '{"role":"redacteur"}');
select tests.verifier('Compte invité (rôle fixé côté serveur) = actif avec son rôle',
  (select actif and role = 'redacteur' from public.profils where email = 'invite@test.fr'));
update public.profils set actif = true where email in ('redac@test.fr', 'elu@test.fr', 'lecteur@test.fr');

update public.profils set role = 'redacteur' where email = 'redac@test.fr';
update public.profils set role = 'valideur'  where email = 'elu@test.fr';
update public.profils set actif = false      where email = 'parti@test.fr';
\i supabase/seed.sql

-- ===================== Visiteur non connecté =====================
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select tests.doit_echouer('Non connecté : lecture refusée', 'select * from public.publications');
reset role;

-- ===================== Rédactrice =====================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
set role authenticated;
insert into public.publications (id, titre, texte, statut, service_id, date_diffusion)
values ('11111111-1111-1111-1111-111111111111', 'Marché de Noël', 'Brouillon', 'redaction', 1, current_date + 5);
select tests.verifier('Rédactrice : création OK + rédacteur renseigné',
  (select redacteur_id from public.publications where id = '11111111-1111-1111-1111-111111111111')
   = '00000000-0000-0000-0000-00000000000b');
select tests.doit_echouer('Rédactrice : ne peut pas créer directement « publié »',
  $$insert into public.publications (titre, statut) values ('Triche', 'publie')$$);
select tests.doit_echouer('Rédactrice : ne peut pas falsifier l''auteur (cree_par forcé)',
  $q$do $x$ begin
     insert into public.publications (id, titre, cree_par) values ('22222222-2222-2222-2222-222222222222', 'Test', '00000000-0000-0000-0000-00000000000a');
     if (select cree_par from public.publications where id = '22222222-2222-2222-2222-222222222222') <> '00000000-0000-0000-0000-00000000000a'
       then raise exception 'cree_par corrigé'; end if; end $x$ $q$);
insert into public.publication_canaux (publication_id, canal_id) values ('11111111-1111-1111-1111-111111111111', 1), ('11111111-1111-1111-1111-111111111111', 2);
update public.publications set statut = 'validation' where id = '11111111-1111-1111-1111-111111111111';
select tests.doit_echouer('Rédactrice : ne peut pas valider elle-même',
  $$update public.publications set statut = 'valide' where id = '11111111-1111-1111-1111-111111111111'$$);
select tests.doit_echouer('Rédactrice : ne peut pas se donner le rôle admin',
  $$update public.profils set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b'$$);
update public.profils set nom = 'Rédactrice VACC' where id = '00000000-0000-0000-0000-00000000000b';
select tests.verifier('Rédactrice : peut changer son propre nom',
  (select nom from public.profils where id = '00000000-0000-0000-0000-00000000000b') = 'Rédactrice VACC');
select tests.doit_echouer('Rédactrice : ne peut pas écrire dans l''historique',
  $$insert into public.historique (action) values ('faux')$$);
select tests.doit_echouer('Rédactrice : ne peut pas créer de notification',
  $$insert into public.notifications (destinataire_id, type, message) values ('00000000-0000-0000-0000-00000000000c', 'x', 'spam')$$);
select tests.doit_echouer('Rédactrice : ne peut pas modifier les canaux de référence',
  $$insert into public.canaux (nom) values ('Canal pirate')$$);
select tests.doit_echouer('Rédactrice : ne peut pas lancer les rappels',
  'select public.rappels_quotidiens()');
reset role;

select tests.verifier('Demande de validation : valideur et admin notifiés',
  (select count(*) from public.notifications where type = 'a_valider'
     and publication_id = '11111111-1111-1111-1111-111111111111') = 2);

-- ===================== Lecteur =====================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', false);
set role authenticated;
select tests.verifier('Lecteur : lit les publications', (select count(*) from public.publications) >= 1);
select tests.doit_echouer('Lecteur : ne peut pas créer', $$insert into public.publications (titre) values ('x')$$);
update public.publications set titre = 'Piraté' where id = '11111111-1111-1111-1111-111111111111';
select tests.verifier('Lecteur : modification sans effet',
  (select titre from public.publications where id = '11111111-1111-1111-1111-111111111111') = 'Marché de Noël');
insert into public.commentaires (publication_id, texte) values ('11111111-1111-1111-1111-111111111111', 'Penser au vin chaud');
select tests.verifier('Lecteur : peut commenter', true);
select tests.verifier('Lecteur : ne voit pas les notifications des autres',
  (select count(*) from public.notifications where destinataire_id <> auth.uid()) = 0);
select tests.doit_echouer('Lecteur : ne peut pas déposer de visuel',
  $$insert into storage.objects (bucket_id, name) values ('visuels', 'x.png')$$);
reset role;

select tests.verifier('Commentaire : rédactrice notifiée',
  exists (select 1 from public.notifications where type = 'commentaire' and destinataire_id = '00000000-0000-0000-0000-00000000000b'));

-- ===================== Valideur =====================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', false);
set role authenticated;
update public.publications set texte = 'Texte corrigé par l''élu' where id = '11111111-1111-1111-1111-111111111111';
update public.publications set statut = 'valide' where id = '11111111-1111-1111-1111-111111111111';
select tests.verifier('Valideur : validation enregistrée avec son nom et la date',
  (select valide_par = auth.uid() and valide_le is not null from public.publications where id = '11111111-1111-1111-1111-111111111111'));
update public.notifications set lue = true where destinataire_id = auth.uid();
select tests.verifier('Valideur : marque ses notifications comme lues',
  (select bool_and(lue) from public.notifications where destinataire_id = auth.uid()));
select tests.doit_echouer('Valideur : ne peut pas réécrire le texte d''une notification',
  $$update public.notifications set message = 'x' where destinataire_id = auth.uid()$$);
reset role;
select tests.verifier('Validation : rédactrice notifiée',
  exists (select 1 from public.notifications where type = 'validee' and destinataire_id = '00000000-0000-0000-0000-00000000000b'));

-- ===================== Rédactrice modifie un texte validé =====================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
set role authenticated;
update public.publications set texte = 'Modifié après validation' where id = '11111111-1111-1111-1111-111111111111';
select tests.verifier('Texte validé modifié par la rédactrice : retour automatique en validation',
  (select statut = 'validation' and valide_par is null from public.publications where id = '11111111-1111-1111-1111-111111111111'));
select tests.doit_echouer('Rédactrice : ne peut pas forcer valide_par',
  $q$do $x$ begin
     update public.publications set valide_par = auth.uid() where id = '11111111-1111-1111-1111-111111111111';
     if (select valide_par from public.publications where id = '11111111-1111-1111-1111-111111111111') is null
       then raise exception 'ignoré'; end if; end $x$ $q$);
delete from public.publications where id = '11111111-1111-1111-1111-111111111111';
select tests.verifier('Rédactrice : ne peut pas supprimer une publication en validation',
  exists (select 1 from public.publications where id = '11111111-1111-1111-1111-111111111111'));
reset role;

-- ===================== Valideur renvoie avec motif =====================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', false);
set role authenticated;
update public.publications set statut = 'redaction', motif_retour = 'Préciser l''horaire'
 where id = '11111111-1111-1111-1111-111111111111';
reset role;
select tests.verifier('Renvoi : rédactrice notifiée avec le motif',
  exists (select 1 from public.notifications where type = 'renvoyee' and message like '%Préciser l''horaire%'));

-- ===================== Statistiques =====================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
set role authenticated;
update public.publication_canaux set portee = 1200, interactions = 85
 where publication_id = '11111111-1111-1111-1111-111111111111' and canal_id = 1;
select tests.verifier('Statistiques : date et auteur de saisie enregistrés',
  (select stats_saisies_le is not null and stats_saisies_par = auth.uid() from public.publication_canaux
    where publication_id = '11111111-1111-1111-1111-111111111111' and canal_id = 1));
select tests.doit_echouer('Statistiques : valeur négative refusée',
  $$update public.publication_canaux set clics = -5 where canal_id = 1$$);
insert into storage.objects (bucket_id, name) values ('visuels', 'affiche.png');
select tests.verifier('Rédactrice : peut déposer un visuel', true);
reset role;

-- ===================== Compte désactivé =====================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}', false);
set role authenticated;
select tests.verifier('Compte désactivé : ne voit aucune publication', (select count(*) from public.publications) = 0);
select tests.doit_echouer('Compte désactivé : ne peut pas créer', $$insert into public.publications (titre) values ('x')$$);
reset role;

-- ===================== Administrateur =====================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
set role authenticated;
select tests.doit_echouer('Admin : ne peut pas retirer le dernier administrateur',
  $$update public.profils set role = 'lecteur' where id = '00000000-0000-0000-0000-00000000000a'$$);
update public.profils set role = 'valideur' where email = 'lecteur@test.fr';
select tests.verifier('Admin : change le rôle d''un compte',
  (select role from public.profils where email = 'lecteur@test.fr') = 'valideur');
insert into public.canaux (nom, couleur) values ('PanneauPocket', '#2E8B57');
select tests.verifier('Admin : ajoute un canal', exists (select 1 from public.canaux where nom = 'PanneauPocket'));
update public.publications set statut = 'publie' where id = '11111111-1111-1111-1111-111111111111';
select tests.verifier('Admin : peut forcer une étape', (select statut from public.publications where id = '11111111-1111-1111-1111-111111111111') = 'publie');
delete from public.publications where id = '11111111-1111-1111-1111-111111111111';
reset role;
select tests.verifier('Suppression : l''historique est conservé',
  exists (select 1 from public.historique where action = 'suppression' and titre_publication = 'Marché de Noël')
  and (select count(*) from public.historique where titre_publication = 'Marché de Noël') >= 5);

-- ===================== Rappels =====================
insert into public.publications (titre, statut, date_diffusion, redacteur_id)
values ('Loto', 'redaction', current_date + 1, '00000000-0000-0000-0000-00000000000b');
select tests.verifier('Rappels : diffusion de demain non validée détectée', public.rappels_quotidiens() >= 1);

-- ===================== Bilan =====================
\set QUIET off
\o
select n, case when ok then 'OK ' else 'ÉCHEC' end as res, test, left(detail, 90) as detail from tests.resultats order by n;
select count(*) filter (where ok) as reussis, count(*) filter (where not ok) as echecs from tests.resultats;

-- Code de sortie non nul si un test échoue (utilisé par l'intégration continue GitHub)
do $$ begin
  if exists (select 1 from tests.resultats where not ok) then
    raise exception 'Au moins un test d''accès a échoué';
  end if;
end $$;
