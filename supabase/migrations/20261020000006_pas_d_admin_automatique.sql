-- =====================================================================
-- Gestion COM — Migration 6 : plus d'administrateur automatique
-- =====================================================================
-- Avant : le tout premier compte créé devenait administrateur. Risque : si l'inscription libre
-- est ouverte, un inconnu pourrait s'inscrire avant le responsable et prendre ce rôle.
-- Désormais : tout compte non invité est « lecteur » INACTIF. Le premier administrateur est
-- désigné à la main, dans l'éditeur SQL de Supabase :
--   update public.profils set role = 'admin', actif = true where email = 'adresse@exemple.fr';
create or replace function public.creer_profil()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_role  public.role_utilisateur := 'lecteur';
  v_actif boolean := false;
  v_meta  text := new.raw_app_meta_data ->> 'role';
begin
  if v_meta in ('admin', 'redacteur', 'valideur', 'lecteur') then
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

revoke execute on function public.creer_profil() from public, anon, authenticated;
