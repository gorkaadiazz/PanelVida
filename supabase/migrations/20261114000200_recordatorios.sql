-- =============================================================================
-- Recordatorios (notificaciones Web Push)
--
-- 1. suscripciones_push: una fila por navegador/dispositivo en el que el
--    usuario ha activado los recordatorios, con la hora (de Madrid) a la que
--    los quiere. No se sincroniza con la copia local: se lee y escribe con
--    conexión (repos/recordatorios.ts). RLS: cada uno solo ve las suyas.
-- 2. La Edge Function `recordatorios` (con la service role) las recorre cada
--    hora y envía el aviso a las que tocan. `ultimo_envio` evita mandar dos
--    el mismo día.
-- 3. Cron (solo en Supabase, donde existen pg_cron, pg_net y Vault): llama a
--    la función cada hora con un secreto aleatorio guardado en Vault. La
--    función lo comprueba con secreto_cron_valido(), que solo puede ejecutar
--    la service role. Así nadie más puede dispararla.
-- =============================================================================

create table public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Dirección del servicio de notificaciones del navegador (Google, Mozilla, Apple…)
  endpoint text not null check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  -- Claves del navegador para cifrar el mensaje (base64url): 65 y 16 bytes
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{86,88}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22,24}$'),
  hora smallint not null default 20 check (hora between 0 and 23),
  ultimo_envio date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index suscripciones_push_hora_idx on public.suscripciones_push (hora);

alter table public.suscripciones_push enable row level security;

create policy "solo_mis_filas_select" on public.suscripciones_push
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "solo_mis_filas_insert" on public.suscripciones_push
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_update" on public.suscripciones_push
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_delete" on public.suscripciones_push
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.suscripciones_push from anon;
revoke truncate, references, trigger on public.suscripciones_push from authenticated;

-- ¿Es el secreto con el que llama el cron? Solo para la service role (la
-- Edge Function). plpgsql: si Vault no existe (tests locales), devuelve false.
create or replace function public.secreto_cron_valido(secreto text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  esperado text;
begin
  if secreto is null or length(secreto) < 32 then
    return false;
  end if;
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into esperado using 'recordatorios_cron';
  exception when others then
    return false;
  end;
  return esperado is not null and secreto = esperado;
end;
$$;

revoke execute on function public.secreto_cron_valido(text) from public, anon, authenticated;
grant execute on function public.secreto_cron_valido(text) to service_role;

-- Cron cada hora (minuto 5). Solo si el proyecto tiene pg_cron, pg_net y Vault
-- (en Supabase sí; en los tests locales no, y entonces no se hace nada).
-- La dirección es la de ESTE proyecto de Supabase: si cambias de proyecto, cámbiala.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
    execute 'create extension if not exists pg_net with schema extensions';
    execute $sql$
      select vault.create_secret(
        replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        'recordatorios_cron',
        'Secreto con el que el cron llama a la Edge Function recordatorios')
      where not exists (select 1 from vault.secrets where name = 'recordatorios_cron')
    $sql$;
    execute $sql$
      select cron.schedule('recordatorios', '5 * * * *', $cron$
        select net.http_post(
          url := 'https://pmcacougksqimitapiqr.supabase.co/functions/v1/recordatorios',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'recordatorios_cron')),
          body := '{}'::jsonb,
          timeout_milliseconds := 30000)
      $cron$)
    $sql$;
  end if;
end;
$$;
