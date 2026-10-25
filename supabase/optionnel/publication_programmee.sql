-- =====================================================================
-- Gestion COM — Diffusion automatique des publications programmées
-- =====================================================================
-- Toutes les 5 minutes, la base appelle la fonction serveur « publier-reseaux », qui envoie
-- sur Facebook / Instagram les publications « Programmé » dont la date et l'heure sont arrivées
-- (heure de Paris ; 9 h si aucune heure n'est indiquée).
--
-- Prérequis : Database > Extensions : activer pg_cron, et pg_net dans le schéma « extensions »
-- (create extension pg_net with schema extensions;). Vault est actif par défaut.
-- Avant d'exécuter : remplacer VOTRE-REF-PROJET et VOTRE-CLE-ANON (Project Settings > API).
-- =====================================================================

-- 1. Secret partagé entre la tâche planifiée et la fonction : créé et conservé DANS la base,
--    il n'apparaît jamais en clair dans le code.
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'publication_cron_secret',
  'Authentifie la tâche planifiée auprès de la fonction publier-reseaux')
where not exists (select 1 from vault.secrets where name = 'publication_cron_secret');

create or replace function public.verifier_secret_cron(p_secret text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(length(p_secret) >= 32 and p_secret = (
    select decrypted_secret from vault.decrypted_secrets where name = 'publication_cron_secret'), false)
$$;
revoke execute on function public.verifier_secret_cron(text) from public, anon, authenticated;
grant execute on function public.verifier_secret_cron(text) to service_role;

-- 2. Tâche planifiée
select cron.unschedule('publication-reseaux') where exists (select 1 from cron.job where jobname = 'publication-reseaux');
select cron.schedule('publication-reseaux', '*/5 * * * *', $job$
  select net.http_post(
    url     := 'https://VOTRE-REF-PROJET.supabase.co/functions/v1/publier-reseaux',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer VOTRE-CLE-ANON',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'publication_cron_secret')),
    body    := '{"action":"programmation"}'::jsonb,
    timeout_milliseconds := 120000)
  where exists (select 1 from public.publications_a_diffuser())
$job$);

-- Contrôle : select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'publication-reseaux') order by start_time desc limit 5;
-- Arrêt :    select cron.unschedule('publication-reseaux');
