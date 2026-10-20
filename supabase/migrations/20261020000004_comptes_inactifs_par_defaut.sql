-- =====================================================================
-- Gestion COM — Migration 4 : défense en profondeur sur la création de comptes
-- =====================================================================
-- Un compte créé en dehors d'une invitation (inscription libre laissée ouverte par erreur,
-- création manuelle dans la console) est INACTIF : il ne voit rien tant qu'un administrateur
-- ne l'a pas activé dans l'écran Administration.
-- Restent actifs d'emblée : le tout premier compte (administrateur) et les comptes invités
-- depuis l'application (rôle transmis par la fonction serveur, côté serveur uniquement).
create or replace function public.creer_profil()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_role  public.role_utilisateur := 'lecteur';
  v_actif boolean := false;
  v_meta  text := new.raw_app_meta_data ->> 'role';
begin
  if not exists (select 1 from public.profils where role = 'admin') then
    v_role := 'admin'; v_actif := true;
  elsif v_meta in ('admin', 'redacteur', 'valideur', 'lecteur') then
    -- raw_app_meta_data n'est modifiable que côté serveur : sûr à utiliser
    v_role := v_meta::public.role_utilisateur; v_actif := true;
  end if;
  insert into public.profils (id, email, nom, role, actif)
  values (new.id, coalesce(new.email, ''),
          coalesce(nullif(new.raw_user_meta_data ->> 'nom', ''), split_part(coalesce(new.email, ''), '@', 1)),
          v_role, v_actif)
  on conflict (id) do nothing;
  return new;
end $$;

alter table public.profils alter column actif set default false;
