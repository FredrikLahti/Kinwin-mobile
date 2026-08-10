-- Supabase's current service-to-service Edge Function contract uses a
-- named secret API key in `apikey`, with verify_jwt disabled and
-- @supabase/server performing the secret-key check. It is not a bearer JWT.
-- Replace the originally scheduled command without touching its cadence.
-- Plain Postgres CI does not install the hosted-only Cron/pg_net extensions,
-- so preserve the same guarded migration behavior as the original package.
do $$
begin
  if to_regnamespace('cron') is not null and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null then
    perform cron.schedule(
      'kinwin-challenge-completion',
      '*/15 * * * *',
      $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'kinwin_project_url')
                 || '/functions/v1/scheduled-finalize-challenges',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'kinwin_cron_secret_key')
          ),
          body := jsonb_build_object('source', 'supabase_cron'),
          timeout_milliseconds := 120000
        );
      $job$
    );
  else
    raise notice 'Cron/pg_net unavailable; hosted deployment must verify the corrected job after extension installation';
  end if;
end;
$$;
