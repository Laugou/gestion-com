-- =====================================================================
-- Gestion COM — Migration 7 : publication directe sur Facebook et Instagram
-- =====================================================================
-- * chaque canal a un mode : manuel (par défaut), facebook ou instagram ;
-- * chaque canal d'une publication garde l'état de sa diffusion (date, identifiant, erreur) ;
-- * ces informations ne sont écrites QUE par le serveur (fonction publier-reseaux) ;
-- * un journal garde la trace de chaque tentative.
-- La publication n'est possible que pour une publication « Validé » ou « Programmé » :
-- le contrôle est fait côté serveur au moment de l'envoi.
-- =====================================================================

alter table public.canaux
  add column type_publication text not null default 'manuel'
  check (type_publication in ('manuel', 'facebook', 'instagram'));
update public.canaux set type_publication = 'facebook'  where nom = 'Facebook';
update public.canaux set type_publication = 'instagram' where nom = 'Instagram';
-- Un seul canal par réseau connecté (évite une double publication)
create unique index canaux_un_par_reseau on public.canaux (type_publication) where type_publication <> 'manuel';

alter table public.publication_canaux
  add column publie_le          timestamptz,
  add column id_externe         text,
  add column erreur_publication text,
  add column tentatives         smallint not null default 0,
  add column en_cours_depuis    timestamptz;

create table public.journal_publications (
  id              bigint generated always as identity primary key,
  publication_id  uuid references public.publications (id) on delete set null,
  titre           text,
  canal           text not null,
  declenchement   text not null check (declenchement in ('bouton', 'programmation')),
  auteur_id       uuid references public.profils (id) on delete set null,
  reussi          boolean not null,
  message         text,
  cree_le         timestamptz not null default now()
);
create index journal_publications_pub_idx on public.journal_publications (publication_id, cree_le desc);
alter table public.journal_publications enable row level security;
create policy "journal_publications : lecture" on public.journal_publications
  for select to authenticated using (public.est_actif());
revoke all on public.journal_publications from anon;
revoke insert, update, delete on public.journal_publications from authenticated;
grant select on public.journal_publications to authenticated;

-- Les colonnes de diffusion ne sont modifiables que par le serveur.
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
    if not public.est_systeme() then
      new.publie_le := null; new.id_externe := null; new.erreur_publication := null;
      new.tentatives := 0; new.en_cours_depuis := null;
    end if;
    return new;
  end if;

  if (new.portee, new.interactions, new.partages, new.clics)
     is distinct from (old.portee, old.interactions, old.partages, old.clics) then
    new.stats_saisies_le := now(); new.stats_saisies_par := auth.uid();
  else
    new.stats_saisies_le := old.stats_saisies_le; new.stats_saisies_par := old.stats_saisies_par;
  end if;
  if not public.est_systeme() then
    new.publie_le := old.publie_le; new.id_externe := old.id_externe;
    new.erreur_publication := old.erreur_publication; new.tentatives := old.tentatives;
    new.en_cours_depuis := old.en_cours_depuis;
  end if;
  return new;
end $$;

-- Un canal déjà diffusé ne peut pas être retiré de la publication (trace de ce qui est en ligne).
create or replace function public.avant_suppression_canal()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.publie_le is not null and not public.est_systeme() and not public.est_admin() then
    raise exception 'Ce canal a déjà été diffusé : il ne peut plus être retiré de la publication.' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger canal_avant_suppression before delete on public.publication_canaux
  for each row execute function public.avant_suppression_canal();

-- Un texte propre à un canal AJOUTÉ après validation (et pas seulement modifié) renvoie aussi
-- la publication en validation : rien ne part sur les réseaux sans avoir été relu.
create or replace function public.apres_ecriture_canal()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if ((tg_op = 'UPDATE' and new.texte_specifique is distinct from old.texte_specifique)
      or (tg_op = 'INSERT' and nullif(trim(new.texte_specifique), '') is not null))
     and not public.peut_valider() and not public.est_systeme() then
    update public.publications set statut = 'validation'
     where id = new.publication_id and statut in ('valide', 'programme');
  end if;
  return new;
end $$;
create trigger canal_apres_insertion after insert on public.publication_canaux
  for each row execute function public.apres_ecriture_canal();
revoke execute on function public.apres_ecriture_canal() from public, anon, authenticated;

-- Publications programmées dont l'heure est arrivée (heure de Paris ; 9 h si aucune heure),
-- avec au moins un canal connecté pas encore diffusé et moins de 3 échecs.
create or replace function public.publications_a_diffuser()
returns table (publication_id uuid)
language sql stable security definer set search_path = ''
as $$
  select distinct p.id
  from public.publications p
  join public.publication_canaux pc on pc.publication_id = p.id
  join public.canaux c on c.id = pc.canal_id
  where p.statut = 'programme'
    and p.date_diffusion is not null
    and (p.date_diffusion + coalesce(p.heure_diffusion, time '09:00')) at time zone 'Europe/Paris' <= now()
    and p.date_diffusion >= current_date - 2          -- pas de rattrapage au-delà de 2 jours
    and c.type_publication <> 'manuel'
    and pc.publie_le is null
    and pc.tentatives < 3
$$;

-- Verrou : réserve les canaux connectés d'une publication pour un envoi (évite qu'un clic et la
-- tâche planifiée publient deux fois). Renvoie les canaux réservés.
create or replace function public.reserver_canaux(p_publication uuid)
returns table (canal_id smallint, type_publication text)
language sql volatile security definer set search_path = ''
as $$
  update public.publication_canaux pc
     set en_cours_depuis = now()
    from public.canaux c
   where c.id = pc.canal_id
     and pc.publication_id = p_publication
     and c.type_publication <> 'manuel'
     and pc.publie_le is null
     and (pc.en_cours_depuis is null or pc.en_cours_depuis < now() - interval '10 minutes')
  returning pc.canal_id, c.type_publication
$$;

revoke execute on function public.publications_a_diffuser(), public.reserver_canaux(uuid),
  public.avant_suppression_canal() from public, anon, authenticated;
grant execute on function public.publications_a_diffuser(), public.reserver_canaux(uuid) to service_role;
