-- Rappels automatiques chaque matin à 7 h (heure de Paris).
-- À exécuter une seule fois dans l'éditeur SQL de Supabase, après avoir activé
-- l'extension « pg_cron » (Database > Extensions).
-- pg_cron fonctionne en temps universel (UTC) : 5 h UTC = 7 h en été, 6 h en hiver à Paris.
select cron.schedule(
  'gestion-com-rappels',
  '0 5 * * *',
  $$ select public.rappels_quotidiens(); $$
);

-- Pour arrêter les rappels :
-- select cron.unschedule('gestion-com-rappels');
