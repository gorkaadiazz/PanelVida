-- =============================================================================
-- Fase 9 · Puente móvil ⇄ PC
--
-- Texto, enlaces y archivos que se mandan entre dispositivos. Tabla
-- sincronizable como las demás (copia local + cola, sync/), con Realtime
-- para que lo nuevo llegue al momento a los otros dispositivos.
--
-- Archivos: bucket PRIVADO `puente`, ruta {user_id}/{id de la fila}/{nombre}.
--   · Primero se crea la fila (con conexión) y después se sube el archivo:
--     la política de Storage solo deja subir a la ruta de una fila tuya que
--     aún no tenga archivo, y solo si los bytes REALES de tu carpeta (los
--     que mide Storage, no los que dice la app) no pasan de 300 MB.
--   · Como mucho 3 filas de archivo «por subir» a la vez: acota cuánto se
--     puede pasar del tope subiendo varios archivos en paralelo.
--   · Cada fila recibe un solo archivo en su vida: el archivo solo se puede
--     borrar cuando su fila ya no existe, y sin fila no se puede subir.
--   · Una fila que espera su archivo no se puede borrar (salvo pasadas 2 h):
--     así el hueco de «por subir» no se libera con la subida en marcha.
--   · Entre todos los usuarios, como mucho 700 MB en el bucket.
--   · El check de archivo_ruta obliga a que la ruta esté en TU carpeta y en
--     la de ESA fila. Importante porque la limpieza (Edge Function con la
--     service role) borra el archivo de cada fila caducada: sin el check, una
--     fila podría apuntar al archivo de otra persona y hacer que se borrase.
--
-- Caducidad: lo no fijado se borra a los 7 días. Cada hora el cron llama a la
-- Edge Function `limpiar-puente`, que borra la fila caducada (si sigue sin
-- fijar) y después su archivo, y barre los archivos que se hayan quedado sin
-- fila (la fila manda: un archivo sin fila es basura).
-- =============================================================================

create table public.puente (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('texto', 'enlace', 'archivo')),
  contenido text not null default '' check (length(contenido) <= 10000),
  archivo_ruta text,
  archivo_nombre text check (archivo_nombre is null or length(archivo_nombre) between 1 and 200),
  archivo_tipo text check (archivo_tipo is null or length(archivo_tipo) <= 150),
  archivo_bytes bigint check (archivo_bytes is null or archivo_bytes between 1 and 26214400),
  -- Nombre del dispositivo que lo mandó («Móvil», «PC casa»…)
  dispositivo text not null default '' check (length(dispositivo) <= 40),
  fijado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now(),
  -- Texto y enlace llevan contenido y nada de archivo
  constraint puente_texto check (
    tipo = 'archivo' or (length(contenido) >= 1 and archivo_ruta is null and archivo_nombre is null
                         and archivo_tipo is null and archivo_bytes is null)),
  constraint puente_enlace check (tipo <> 'enlace' or contenido ~* '^https?://[^\s]+$'),
  -- El archivo, siempre en {user_id}/{id}/ (nada de «..» ni barras de más)
  constraint puente_archivo check (
    tipo <> 'archivo' or (
      archivo_nombre is not null and archivo_bytes is not null
      and archivo_ruta is not null
      and starts_with(archivo_ruta, user_id::text || '/' || id::text || '/')
      and archivo_ruta !~ '(^|/)\.\.?(/|$)'
      and array_length(string_to_array(archivo_ruta, '/'), 1) = 3
      and split_part(archivo_ruta, '/', 3) ~ '^[A-Za-z0-9._-]{1,100}$'
      and length(archivo_ruta) <= 300))
);

create trigger antes_de_guardar before insert or update on public.puente
  for each row execute function public.antes_de_guardar();
create trigger despues_de_borrar after delete on public.puente
  for each row execute function public.despues_de_borrar();
create trigger no_revivir_borrado before insert on public.puente
  for each row execute function public.no_revivir_borrado();
create index puente_user_sync_idx on public.puente (user_id, sync_at);
create index puente_caducidad_idx on public.puente (created_at) where not fijado;
create unique index puente_archivo_ruta_idx on public.puente (archivo_ruta) where archivo_ruta is not null;

-- Topes por usuario (plan gratuito: 1 GB de Storage para todo el proyecto):
-- 2.000 elementos, 300 MB declarados y 3 archivos por subir a la vez. El
-- tope de verdad (bytes reales) se comprueba al subir: puente_puede_subir().
create or replace function public.tope_puente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bytes bigint;
  filas bigint;
  por_subir bigint;
begin
  -- Un usuario a la vez: sin esto, dos inserciones simultáneas verían la misma suma
  perform pg_advisory_xact_lock(hashtext('puente:' || new.user_id::text));
  -- Un upsert de una fila que ya existe (fijar, desde el motor) acaba siendo
  -- un UPDATE: no añade nada, así que no cuenta para ningún tope.
  if exists (select 1 from public.puente p where p.id = new.id) then
    return new;
  end if;
  select coalesce(sum(archivo_bytes), 0), count(*) into bytes, filas
  from public.puente where user_id = new.user_id and id <> new.id;
  if new.tipo = 'archivo' then
    select count(*) into por_subir
    from public.puente p
    where p.user_id = new.user_id and p.id <> new.id and p.tipo = 'archivo'
      and not exists (select 1 from storage.objects o where o.bucket_id = 'puente' and o.name = p.archivo_ruta);
    if por_subir >= 3 then
      raise exception 'Espera a que terminen de subir los otros archivos' using errcode = 'check_violation';
    end if;
  end if;
  if filas >= 2000 then
    raise exception 'El Puente está lleno: borra algo antes de mandar más' using errcode = 'check_violation';
  end if;
  if bytes + coalesce(new.archivo_bytes, 0) > 314572800 then
    raise exception 'No queda espacio en el Puente (300 MB): borra algún archivo' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.tope_puente() from public, anon, authenticated;
create trigger tope_puente before insert on public.puente
  for each row execute function public.tope_puente();

-- El archivo de una fila no se puede cambiar después (la limpieza confía en él)
create or replace function public.puente_archivo_fijo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo is distinct from old.tipo
     or new.archivo_ruta is distinct from old.archivo_ruta
     or new.archivo_bytes is distinct from old.archivo_bytes then
    raise exception 'No se puede cambiar el tipo ni el archivo de un elemento del Puente' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.puente_archivo_fijo() from public, anon, authenticated;
create trigger puente_archivo_fijo before update on public.puente
  for each row execute function public.puente_archivo_fijo();

-- ¿Se puede borrar esta fila? Texto y enlace siempre; un archivo, si ya está
-- subido o si lleva más de 2 horas esperando (subida cortada).
create or replace function public.puente_se_puede_borrar(tipo text, ruta text, sync_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select tipo <> 'archivo'
    or sync_at < now() - interval '2 hours'
    -- solo rutas de tu carpeta: no sirve para preguntar por archivos ajenos
    or ((storage.foldername(ruta))[1] = auth.uid()::text
        and exists (select 1 from storage.objects o where o.bucket_id = 'puente' and o.name = ruta));
$$;
revoke execute on function public.puente_se_puede_borrar(text, text, timestamptz) from public, anon;
grant execute on function public.puente_se_puede_borrar(text, text, timestamptz) to authenticated;

alter table public.puente enable row level security;
create policy "solo_mis_filas_select" on public.puente
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "solo_mis_filas_insert" on public.puente
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_update" on public.puente
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
-- Borrar: lo tuyo, salvo una fila de archivo que aún espera su archivo (menos
-- de 2 horas). Si se pudiera borrar, se liberaría el hueco de «3 por subir»
-- con la subida aún en marcha y se podría pasar del tope. Esa fila la quita
-- la limpieza pasadas 2 horas (lo que dura una URL de subida firmada).
create policy "solo_mis_filas_delete" on public.puente
  for delete to authenticated using (
    (select auth.uid()) = user_id
    and public.puente_se_puede_borrar(tipo, archivo_ruta, sync_at));

revoke all on public.puente from anon;
revoke truncate, references, trigger on public.puente from authenticated;

-- -----------------------------------------------------------------------------
-- Storage: bucket privado `puente`, 25 MB por archivo, cualquier tipo
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('puente', 'puente', false, 26214400, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ¿Puede el usuario de esta petición subir un archivo a esta ruta?
--   · tiene que ser la ruta de una fila SUYA del Puente,
--   · esa fila aún no tiene archivo (cada fila, un archivo en su vida),
--   · y lo que ya ocupa su carpeta (bytes reales, medidos por Storage) no
--     llega a 300 MB. Con como mucho 3 subidas en paralelo (tope_puente), lo
--     máximo que se puede pasar son 3 × 25 MB.
-- security definer: lee storage.objects y puente sin depender de sus políticas.
create or replace function public.puente_puede_subir(ruta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (select 1 from public.puente p where p.archivo_ruta = ruta and p.user_id = auth.uid())
    and not exists (select 1 from storage.objects o where o.bucket_id = 'puente' and o.name = ruta)
    and (select coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 26214400)), 0)
         from storage.objects o
         where o.bucket_id = 'puente' and (storage.foldername(o.name))[1] = auth.uid()::text) < 314572800
    -- y entre todos, menos de 700 MB (el plan gratuito tiene 1 GB para todo el proyecto)
    and (select coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 26214400)), 0)
         from storage.objects o where o.bucket_id = 'puente') < 734003200;
$$;
revoke execute on function public.puente_puede_subir(text) from public, anon;
grant execute on function public.puente_puede_subir(text) to authenticated;

-- Leer: solo en tu carpeta.
create policy "puente_select_mi_carpeta" on storage.objects
  for select to authenticated
  using (bucket_id = 'puente' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Borrar: solo en tu carpeta y solo si la fila ya no existe (primero se borra
-- la fila). Así un archivo borrado no deja su fila libre para subir otro.
create policy "puente_delete_sin_fila" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'puente'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.puente p where p.archivo_ruta = objects.name)
  );

-- Subir: ver puente_puede_subir. (Sin política de update: un archivo subido no se sustituye.)
create policy "puente_insert_ruta_de_mi_fila" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'puente'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.puente_puede_subir(name)
  );

-- -----------------------------------------------------------------------------
-- Limpieza (solo la service role, desde la Edge Function limpiar-puente)
-- -----------------------------------------------------------------------------

-- Archivos del bucket que no están en ninguna fila (con 10 minutos de margen).
-- Una subida en marcha siempre tiene fila, así que nunca se toma por huérfana.
-- Leer storage.objects con SQL está permitido (borrar no: eso lo hace la
-- Edge Function con la API de Storage).
create or replace function public.puente_archivos_huerfanos(limite int default 500)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'puente'
    and o.created_at < now() - interval '10 minutes'
    and not exists (select 1 from public.puente p where p.archivo_ruta = o.name)
  order by o.created_at
  limit greatest(1, least(limite, 1000));
$$;
revoke execute on function public.puente_archivos_huerfanos(int) from public, anon, authenticated;
grant execute on function public.puente_archivos_huerfanos(int) to service_role;

-- Lo contrario: filas de archivo cuya subida se cortó (más de 2 horas sin
-- archivo). Ocupan un hueco de «3 por subir», así que la limpieza las borra.
-- Se mira sync_at (lo pone el servidor; created_at lo manda la app) y se
-- comprueba en el mismo delete que siguen sin archivo (por si la subida
-- termina justo ahora). Devuelve cuántas ha borrado.
create or replace function public.puente_borrar_filas_sin_archivo(limite int default 500)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with borradas as (
    delete from public.puente p
    where p.id in (
      select q.id from public.puente q
      where q.tipo = 'archivo'
        and q.sync_at < now() - interval '2 hours'
        and not exists (select 1 from storage.objects o where o.bucket_id = 'puente' and o.name = q.archivo_ruta)
      order by q.sync_at
      limit greatest(1, least(limite, 1000)))
    and not exists (select 1 from storage.objects o where o.bucket_id = 'puente' and o.name = p.archivo_ruta)
    returning 1)
  select count(*)::int from borradas;
$$;
revoke execute on function public.puente_borrar_filas_sin_archivo(int) from public, anon, authenticated;
grant execute on function public.puente_borrar_filas_sin_archivo(int) to service_role;

-- -----------------------------------------------------------------------------
-- Realtime y cron (solo en Supabase; en los tests locales no existen)
-- -----------------------------------------------------------------------------

do $$
begin
  -- Realtime: los cambios de `puente` se avisan a los dispositivos conectados.
  -- Realtime aplica las políticas RLS: cada uno solo recibe lo suyo.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.puente';
  end if;

  -- Cada hora (minuto 15) se llama a limpiar-puente con el mismo secreto
  -- de Vault que usan los recordatorios (lo comprueba secreto_cron_valido).
  if exists (select 1 from pg_namespace where nspname = 'cron')
     and exists (select 1 from pg_namespace where nspname = 'net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    execute $sql$
      select cron.schedule('limpiar-puente', '15 * * * *', $cron$
        select net.http_post(
          url := 'https://pmcacougksqimitapiqr.supabase.co/functions/v1/limpiar-puente',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'recordatorios_cron')),
          body := '{}'::jsonb,
          timeout_milliseconds := 60000)
      $cron$)
    $sql$;
  end if;
end;
$$;
