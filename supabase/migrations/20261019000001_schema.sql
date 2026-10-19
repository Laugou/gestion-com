-- =====================================================================
-- Gestion COM — Commune de Cabannes
-- Migration 1 : structure de la base de données
-- =====================================================================
-- Tables principales :
--   profils            : un profil par compte utilisateur (nom, rôle, actif)
--   services, canaux   : listes de référence modifiables par un administrateur
--   evenements         : événements de la programmation municipale
--   publications       : chaque message à diffuser, avec son circuit de validation
--   publication_canaux : sur quels canaux une publication part + statistiques
--   pieces_jointes     : visuels et documents (fichiers stockés à part)
--   commentaires       : échanges entre rédacteurs et valideurs
--   historique         : trace non modifiable de qui a fait quoi et quand
--   notifications      : alertes adressées à un utilisateur
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.role_utilisateur as enum ('admin', 'redacteur', 'valideur', 'lecteur');
comment on type public.role_utilisateur is
  'admin : tout gérer ; redacteur : créer et modifier ; valideur : valider ou renvoyer (et modifier) ; lecteur : consulter';

create type public.statut_publication as enum
  ('idee', 'redaction', 'validation', 'valide', 'programme', 'publie', 'annule');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.profils (
  id           uuid primary key references auth.users (id) on delete cascade,
  nom          text not null default '' check (length(nom) <= 120),
  email        text not null default '',
  role         public.role_utilisateur not null default 'lecteur',
  actif        boolean not null default true,
  notif_email  boolean not null default true,
  cree_le      timestamptz not null default now()
);

create table public.services (
  id       smallint generated always as identity primary key,
  nom      text not null unique check (length(nom) between 1 and 80),
  couleur  text not null default '#1A3C6E' check (couleur ~ '^#[0-9A-Fa-f]{6}$'),
  ordre    smallint not null default 0,
  actif    boolean not null default true
);

create table public.canaux (
  id                 smallint generated always as identity primary key,
  nom                text not null unique check (length(nom) between 1 and 80),
  couleur            text not null default '#5B7BB0' check (couleur ~ '^#[0-9A-Fa-f]{6}$'),
  limite_caracteres  integer check (limite_caracteres > 0),
  ordre              smallint not null default 0,
  actif              boolean not null default true
);

create table public.evenements (
  id           uuid primary key default gen_random_uuid(),
  titre        text not null check (length(titre) between 1 and 200),
  date_debut   date not null,
  date_fin     date,
  lieu         text check (length(lieu) <= 200),
  service_id   smallint references public.services (id) on delete set null,
  description  text not null default '' check (length(description) <= 10000),
  cree_par     uuid references public.profils (id) on delete set null default auth.uid(),
  cree_le      timestamptz not null default now(),
  modifie_le   timestamptz not null default now(),
  check (date_fin is null or date_fin >= date_debut)
);

create table public.publications (
  id               uuid primary key default gen_random_uuid(),
  titre            text not null check (length(titre) between 1 and 200),
  texte            text not null default '' check (length(texte) <= 20000),
  service_id       smallint references public.services (id) on delete set null,
  evenement_id     uuid references public.evenements (id) on delete set null,
  statut           public.statut_publication not null default 'idee',
  date_diffusion   date,
  heure_diffusion  time,
  redacteur_id     uuid references public.profils (id) on delete set null,
  valideur_id      uuid references public.profils (id) on delete set null,
  lien_visuel      text check (length(lien_visuel) <= 1000),
  notes            text not null default '' check (length(notes) <= 10000),
  valide_par       uuid references public.profils (id) on delete set null,
  valide_le        timestamptz,
  motif_retour     text check (length(motif_retour) <= 4000),
  cree_par         uuid references public.profils (id) on delete set null default auth.uid(),
  cree_le          timestamptz not null default now(),
  modifie_par      uuid references public.profils (id) on delete set null,
  modifie_le       timestamptz not null default now()
);
create index publications_date_idx   on public.publications (date_diffusion);
create index publications_statut_idx on public.publications (statut);
create index publications_evt_idx    on public.publications (evenement_id);

create table public.publication_canaux (
  publication_id     uuid not null references public.publications (id) on delete cascade,
  canal_id           smallint not null references public.canaux (id) on delete restrict,
  texte_specifique   text check (length(texte_specifique) <= 20000),
  url_publication    text check (length(url_publication) <= 1000),
  portee             integer check (portee >= 0),
  interactions       integer check (interactions >= 0),
  partages           integer check (partages >= 0),
  clics              integer check (clics >= 0),
  stats_saisies_le   timestamptz,
  stats_saisies_par  uuid references public.profils (id) on delete set null,
  primary key (publication_id, canal_id)
);

create table public.pieces_jointes (
  id              uuid primary key default gen_random_uuid(),
  publication_id  uuid not null references public.publications (id) on delete cascade,
  chemin          text not null unique,
  nom_fichier     text not null check (length(nom_fichier) <= 255),
  type_mime       text,
  taille          bigint check (taille >= 0),
  ajoute_par      uuid references public.profils (id) on delete set null default auth.uid(),
  ajoute_le       timestamptz not null default now()
);
create index pieces_jointes_pub_idx on public.pieces_jointes (publication_id);

create table public.commentaires (
  id              uuid primary key default gen_random_uuid(),
  publication_id  uuid not null references public.publications (id) on delete cascade,
  auteur_id       uuid references public.profils (id) on delete set null default auth.uid(),
  texte           text not null check (length(texte) between 1 and 4000),
  cree_le         timestamptz not null default now()
);
create index commentaires_pub_idx on public.commentaires (publication_id);

-- L'historique survit à la suppression d'une publication (publication_id passe à null,
-- le titre reste dans titre_publication) : c'est la trace d'audit.
create table public.historique (
  id                 bigint generated always as identity primary key,
  publication_id     uuid references public.publications (id) on delete set null,
  titre_publication  text,
  auteur_id          uuid references public.profils (id) on delete set null,
  action             text not null,
  ancien_statut      public.statut_publication,
  nouveau_statut     public.statut_publication,
  details            text,
  cree_le            timestamptz not null default now()
);
create index historique_pub_idx on public.historique (publication_id, cree_le desc);

create table public.notifications (
  id               bigint generated always as identity primary key,
  destinataire_id  uuid not null references public.profils (id) on delete cascade,
  publication_id   uuid references public.publications (id) on delete cascade,
  type             text not null,
  message          text not null,
  lue              boolean not null default false,
  email_envoye     boolean not null default false,
  cree_le          timestamptz not null default now()
);
create index notifications_dest_idx on public.notifications (destinataire_id, lue, cree_le desc);

-- ---------------------------------------------------------------------
-- Fonctions d'aide (utilisées par les règles d'accès)
-- security definer : lisent la table profils sans être bloquées par ses propres règles.
-- ---------------------------------------------------------------------
create or replace function public.mon_role()
returns public.role_utilisateur
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profils p where p.id = auth.uid() and p.actif
$$;

create or replace function public.est_actif()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.mon_role() is not null $$;

create or replace function public.est_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.mon_role() = 'admin', false) $$;

create or replace function public.peut_ecrire()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.mon_role() in ('admin', 'redacteur', 'valideur'), false) $$;

create or replace function public.peut_valider()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.mon_role() in ('admin', 'valideur'), false) $$;

-- Vrai quand la requête vient du serveur lui-même (fonctions serveur avec la clé de service,
-- tâches planifiées, console d'administration Supabase), jamais d'un navigateur.
create or replace function public.est_systeme()
returns boolean language sql stable set search_path = ''
as $$
  select auth.uid() is null
     and (coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
          or current_user in ('postgres', 'service_role', 'supabase_admin'))
$$;

-- ---------------------------------------------------------------------
-- Création automatique du profil à la création d'un compte.
-- Le tout premier compte devient administrateur (amorçage) ; les suivants sont lecteurs
-- jusqu'à ce qu'un administrateur leur donne un rôle.
-- ---------------------------------------------------------------------
create or replace function public.creer_profil()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.role_utilisateur := 'lecteur';
  v_meta text := new.raw_app_meta_data ->> 'role';
begin
  if not exists (select 1 from public.profils where role = 'admin') then
    v_role := 'admin';
  elsif v_meta in ('admin', 'redacteur', 'valideur', 'lecteur') then
    -- raw_app_meta_data n'est modifiable que côté serveur : sûr à utiliser
    v_role := v_meta::public.role_utilisateur;
  end if;
  insert into public.profils (id, email, nom, role)
  values (new.id, coalesce(new.email, ''),
          coalesce(nullif(new.raw_user_meta_data ->> 'nom', ''), split_part(coalesce(new.email, ''), '@', 1)),
          v_role)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger profil_a_la_creation
  after insert on auth.users
  for each row execute function public.creer_profil();

-- Garde-fous sur les profils :
--  * seul un administrateur change le rôle, l'activation ou l'adresse ;
--  * on ne peut pas retirer le dernier administrateur actif (évite de se retrouver bloqué).
create or replace function public.proteger_profil()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.actif is distinct from old.actif or new.email is distinct from old.email)
     and not public.est_admin() and not public.est_systeme() then
    raise exception 'Seul un administrateur peut modifier le rôle, l''activation ou l''adresse d''un compte.'
      using errcode = '42501';
  end if;
  if old.role = 'admin' and old.actif and (new.role <> 'admin' or not new.actif)
     and (select count(*) from public.profils where role = 'admin' and actif and id <> old.id) = 0 then
    raise exception 'Impossible : il doit rester au moins un administrateur actif.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger profil_garde_fous
  before update on public.profils
  for each row execute function public.proteger_profil();

-- ---------------------------------------------------------------------
-- Circuit de validation, contrôlé côté serveur
-- ---------------------------------------------------------------------
-- Transitions autorisées (en plus : un administrateur peut tout faire)
--   idee        -> redaction, validation, annule                  (rédacteurs)
--   redaction   -> idee, validation, annule                       (rédacteurs)
--   validation  -> valide                                         (valideurs)
--   validation  -> redaction                                      (valideurs : renvoi ; rédacteurs : retrait)
--   valide      -> programme, publie, redaction, validation        (rédacteurs)
--   programme   -> publie, valide, validation                     (rédacteurs)
--   annule      -> idee, redaction                                (rédacteurs)
--   publie      -> (aucune, sauf administrateur)
create or replace function public.transition_autorisee(
  p_de public.statut_publication, p_vers public.statut_publication, p_role public.role_utilisateur)
returns boolean language sql immutable set search_path = ''
as $$
  select case
    when p_de = p_vers then true
    when p_role = 'admin' then true
    when p_role = 'lecteur' or p_role is null then false
    when p_de = 'validation' and p_vers = 'valide' then p_role = 'valideur'
    else (p_de, p_vers) in (
      ('idee'::public.statut_publication, 'redaction'::public.statut_publication),
      ('idee', 'validation'), ('idee', 'annule'),
      ('redaction', 'idee'), ('redaction', 'validation'), ('redaction', 'annule'),
      ('validation', 'redaction'),
      ('valide', 'programme'), ('valide', 'publie'), ('valide', 'redaction'), ('valide', 'validation'),
      ('programme', 'publie'), ('programme', 'valide'), ('programme', 'validation'),
      ('annule', 'idee'), ('annule', 'redaction'))
  end
$$;

create or replace function public.avant_ecriture_publication()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.role_utilisateur := coalesce(public.mon_role(), 'lecteur');
  v_sys boolean := public.est_systeme();
begin
  if tg_op = 'INSERT' then
    if not v_sys then
      new.cree_par := auth.uid();
      if v_role <> 'admin' and new.statut not in ('idee', 'redaction', 'validation') then
        raise exception 'Une nouvelle publication commence à l''étape Idée, Rédaction ou À valider.' using errcode = '42501';
      end if;
    end if;
    if new.redacteur_id is null then new.redacteur_id := new.cree_par; end if;
    new.modifie_par := coalesce(auth.uid(), new.cree_par);
    new.valide_par := null; new.valide_le := null;
    if new.statut = 'valide' or new.statut = 'programme' or new.statut = 'publie' then
      new.valide_par := auth.uid(); new.valide_le := now();
    end if;
    return new;
  end if;

  -- UPDATE
  new.id := old.id; new.cree_par := old.cree_par; new.cree_le := old.cree_le;
  new.modifie_le := now();
  new.modifie_par := coalesce(auth.uid(), old.modifie_par);

  -- Un contenu déjà validé qui est modifié par quelqu'un qui n'a pas le droit de valider
  -- repart automatiquement en validation.
  if not v_sys and old.statut in ('valide', 'programme') and new.statut = old.statut
     and (new.texte is distinct from old.texte or new.titre is distinct from old.titre)
     and v_role not in ('admin', 'valideur') then
    new.statut := 'validation';
  end if;

  if new.statut is distinct from old.statut then
    if not v_sys and not public.transition_autorisee(old.statut, new.statut, v_role) then
      raise exception 'Changement d''étape non autorisé (% vers %) pour votre rôle.', old.statut, new.statut
        using errcode = '42501';
    end if;
    if new.statut = 'valide' and old.statut = 'validation' then
      new.valide_par := auth.uid(); new.valide_le := now(); new.motif_retour := null;
    elsif new.statut in ('idee', 'redaction', 'validation', 'annule') then
      new.valide_par := null; new.valide_le := null;
    end if;
    if new.statut = 'validation' then new.motif_retour := null; end if;
  else
    -- Les champs de validation ne se modifient pas à la main.
    new.valide_par := old.valide_par; new.valide_le := old.valide_le;
  end if;
  return new;
end $$;

create trigger publication_avant_ecriture
  before insert or update on public.publications
  for each row execute function public.avant_ecriture_publication();

-- Historique + notifications après chaque écriture
create or replace function public.notifier(
  p_dest uuid, p_pub uuid, p_type text, p_message text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_dest is null or p_dest = auth.uid() then return; end if;
  if not exists (select 1 from public.profils where id = p_dest and actif) then return; end if;
  insert into public.notifications (destinataire_id, publication_id, type, message)
  values (p_dest, p_pub, p_type, left(p_message, 1000));
end $$;

create or replace function public.apres_ecriture_publication()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_auteur text := coalesce((select nom from public.profils where id = auth.uid()), 'Système');
  v_dest uuid;
begin
  if tg_op = 'DELETE' then
    insert into public.historique (publication_id, titre_publication, auteur_id, action, ancien_statut, details)
    values (null, old.titre, auth.uid(), 'suppression', old.statut, 'Publication supprimée');
    return old;
  end if;

  if tg_op = 'INSERT' then
    insert into public.historique (publication_id, titre_publication, auteur_id, action, nouveau_statut)
    values (new.id, new.titre, auth.uid(), 'creation', new.statut);
  elsif new.statut is distinct from old.statut then
    insert into public.historique (publication_id, titre_publication, auteur_id, action, ancien_statut, nouveau_statut, details)
    values (new.id, new.titre, auth.uid(), 'etape', old.statut, new.statut,
            case when new.statut = 'redaction' and old.statut = 'validation' then new.motif_retour end);
  elsif (new.texte, new.titre, new.date_diffusion, new.heure_diffusion, new.service_id, new.evenement_id, new.lien_visuel)
        is distinct from
        (old.texte, old.titre, old.date_diffusion, old.heure_diffusion, old.service_id, old.evenement_id, old.lien_visuel) then
    insert into public.historique (publication_id, titre_publication, auteur_id, action, nouveau_statut)
    values (new.id, new.titre, auth.uid(), 'modification', new.statut);
  end if;

  -- Notifications liées aux changements d'étape
  if new.statut = 'validation' and (tg_op = 'INSERT' or old.statut <> 'validation') then
    if new.valideur_id is not null then
      perform public.notifier(new.valideur_id, new.id, 'a_valider',
        v_auteur || ' vous demande de valider « ' || new.titre || ' ».');
    else
      for v_dest in select id from public.profils where actif and role in ('valideur', 'admin') loop
        perform public.notifier(v_dest, new.id, 'a_valider',
          v_auteur || ' demande une validation pour « ' || new.titre || ' ».');
      end loop;
    end if;
  elsif tg_op = 'UPDATE' and old.statut = 'validation' and new.statut = 'valide' then
    perform public.notifier(new.redacteur_id, new.id, 'validee',
      '« ' || new.titre || ' » a été validée par ' || v_auteur || '.');
  elsif tg_op = 'UPDATE' and old.statut = 'validation' and new.statut = 'redaction' then
    perform public.notifier(new.redacteur_id, new.id, 'renvoyee',
      '« ' || new.titre || ' » vous est renvoyée par ' || v_auteur
      || coalesce(' : ' || nullif(new.motif_retour, ''), '.'));
  end if;
  return new;
end $$;

create trigger publication_apres_ecriture
  after insert or update or delete on public.publications
  for each row execute function public.apres_ecriture_publication();

-- Texte propre à un canal modifié sur une publication déjà validée : retour en validation.
create or replace function public.apres_ecriture_canal()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.texte_specifique is distinct from old.texte_specifique
     and not public.peut_valider() and not public.est_systeme() then
    update public.publications set statut = 'validation'
     where id = new.publication_id and statut in ('valide', 'programme');
  end if;
  return new;
end $$;

create or replace function public.avant_ecriture_canal()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.portee, new.interactions, new.partages, new.clics) is not null then
      new.stats_saisies_le := now(); new.stats_saisies_par := auth.uid();
    else
      new.stats_saisies_le := null; new.stats_saisies_par := null;
    end if;
  elsif (new.portee, new.interactions, new.partages, new.clics)
        is distinct from (old.portee, old.interactions, old.partages, old.clics) then
    new.stats_saisies_le := now(); new.stats_saisies_par := auth.uid();
  else
    new.stats_saisies_le := old.stats_saisies_le; new.stats_saisies_par := old.stats_saisies_par;
  end if;
  return new;
end $$;

create trigger canal_avant_ecriture
  before insert or update on public.publication_canaux
  for each row execute function public.avant_ecriture_canal();

create trigger canal_apres_ecriture
  after update on public.publication_canaux
  for each row execute function public.apres_ecriture_canal();

-- Commentaire : prévient le rédacteur et le valideur désigné
create or replace function public.apres_commentaire()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  p record;
  v_auteur text := coalesce((select nom from public.profils where id = auth.uid()), 'Quelqu''un');
begin
  select id, titre, redacteur_id, valideur_id into p from public.publications where id = new.publication_id;
  perform public.notifier(p.redacteur_id, p.id, 'commentaire',
    v_auteur || ' a commenté « ' || p.titre || ' » : ' || left(new.texte, 200));
  if p.valideur_id is distinct from p.redacteur_id then
    perform public.notifier(p.valideur_id, p.id, 'commentaire',
      v_auteur || ' a commenté « ' || p.titre || ' » : ' || left(new.texte, 200));
  end if;
  return new;
end $$;

create trigger commentaire_apres_insertion
  after insert on public.commentaires
  for each row execute function public.apres_commentaire();

create or replace function public.maj_evenement()
returns trigger language plpgsql set search_path = ''
as $$ begin new.modifie_le := now(); new.cree_par := old.cree_par; new.cree_le := old.cree_le; return new; end $$;

create trigger evenement_maj before update on public.evenements
  for each row execute function public.maj_evenement();

-- ---------------------------------------------------------------------
-- Rappels quotidiens (appelés par la tâche planifiée, voir supabase/optionnel/)
-- ---------------------------------------------------------------------
create or replace function public.rappels_quotidiens()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  r record; n integer := 0; v_dest uuid;
begin
  -- 1. Diffusion demain alors que la publication n'est pas validée
  for r in select id, titre, redacteur_id from public.publications
           where date_diffusion = current_date + 1 and statut in ('idee', 'redaction', 'validation') loop
    perform public.notifier(r.redacteur_id, r.id, 'rappel',
      'Diffusion prévue demain mais « ' || r.titre || ' » n''est pas encore validée.');
    n := n + 1;
  end loop;
  -- 2. Validation en attente depuis plus de 2 jours
  for r in select p.id, p.titre, p.valideur_id from public.publications p
           where p.statut = 'validation' and p.modifie_le < now() - interval '2 days' loop
    if r.valideur_id is not null then
      perform public.notifier(r.valideur_id, r.id, 'rappel', 'Validation en attente depuis plus de 2 jours : « ' || r.titre || ' ».');
    else
      for v_dest in select id from public.profils where actif and role in ('valideur', 'admin') loop
        perform public.notifier(v_dest, r.id, 'rappel', 'Validation en attente depuis plus de 2 jours : « ' || r.titre || ' ».');
      end loop;
    end if;
    n := n + 1;
  end loop;
  -- 3. Publié il y a 3 jours, statistiques non saisies
  for r in select p.id, p.titre, p.redacteur_id from public.publications p
           where p.statut = 'publie' and p.date_diffusion = current_date - 3
             and not exists (select 1 from public.publication_canaux c
                             where c.publication_id = p.id and c.stats_saisies_le is not null) loop
    perform public.notifier(r.redacteur_id, r.id, 'rappel', 'Pensez à saisir les statistiques de « ' || r.titre || ' ».');
    n := n + 1;
  end loop;
  return n;
end $$;
