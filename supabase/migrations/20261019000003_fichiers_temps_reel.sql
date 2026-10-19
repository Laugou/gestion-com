-- =====================================================================
-- Gestion COM — Migration 3 : stockage des visuels et mises à jour en direct
-- =====================================================================

-- Espace de stockage privé « visuels » : 20 Mo par fichier, images et PDF uniquement.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visuels', 'visuels', false, 20971520,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "visuels : lecture par les comptes actifs" on storage.objects
  for select to authenticated using (bucket_id = 'visuels' and public.est_actif());
create policy "visuels : dépôt par les rédacteurs" on storage.objects
  for insert to authenticated with check (bucket_id = 'visuels' and public.peut_ecrire());
create policy "visuels : suppression par l'auteur ou l'administrateur" on storage.objects
  for delete to authenticated using (bucket_id = 'visuels' and (public.est_admin() or owner = auth.uid()));

-- Mises à jour en direct : un changement fait sur un ordinateur apparaît sur les autres écrans.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.publications, public.notifications;
  end if;
end $$;
