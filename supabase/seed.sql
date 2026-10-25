-- Listes de départ, modifiables ensuite dans l'écran Administration.
insert into public.services (nom, couleur, ordre) values
  ('Culture', '#7A5AC8', 1),
  ('Festivités', '#D9722B', 2),
  ('Sports', '#24806F', 3),
  ('Vie associative', '#3B6FD6', 4),
  ('Institutionnel', '#1A3C6E', 5)
on conflict (nom) do nothing;
-- Limites de caractères : Instagram 2 200 (légende). Laisser vide quand il n'y a pas de limite utile.
insert into public.canaux (nom, couleur, limite_caracteres, ordre) values
  ('Facebook', '#3B6FD6', null, 1),
  ('Instagram', '#C2477E', 2200, 2),
  ('Site internet', '#24806F', null, 3),
  ('Cabannes Actu', '#C8A84B', null, 4),
  ('Panneau lumineux', '#D9722B', null, 5),
  ('Affichage', '#7A5AC8', null, 6),
  ('Presse locale', '#6B7A90', null, 7)
on conflict (nom) do nothing;
-- Canaux publiés directement par la plateforme (les autres restent manuels)
update public.canaux set type_publication = 'facebook'  where nom = 'Facebook'  and not exists (select 1 from public.canaux where type_publication = 'facebook');
update public.canaux set type_publication = 'instagram' where nom = 'Instagram' and not exists (select 1 from public.canaux where type_publication = 'instagram');
