-- =============================================================================
-- Fase 9 · Agente del PC (vincular, latido y Puente)
--
-- El agente es un programa en el PC de casa. Para que, si alguien roba sus
-- credenciales, no pueda leer tus hábitos, dinero ni tareas, el agente es un
-- USUARIO DE SUPABASE APARTE (lo crea la Edge Function `agentes` al
-- vincular), enlazado a tu cuenta en la tabla `agentes`:
--   · tipo_cuenta() = 'agente' → la política restrictiva de cada tabla de
--     Mi Panel le cierra todo (y otra nueva, las de la compra y el hogar);
--   · solo puede LEER su fila, sus comandos (sección del Mando) y el Puente
--     de su dueño (para avisar y copiar al portapapeles);
--   · solo ESCRIBE con funciones: latido, mandar al Puente (y, más adelante,
--     el resultado de un comando y la red).
--
-- Desvincular: se borra su fila de `agentes` y deja de funcionar AL MOMENTO,
-- aunque su token (JWT) siga siendo válido hasta una hora: todas sus
-- políticas preguntan por esa fila en cada consulta. Además la Edge Function
-- borra el usuario (sus tokens de refresco mueren).
-- =============================================================================

create table public.agentes (
  -- El id del usuario de Supabase del propio agente
  id uuid primary key references auth.users (id) on delete cascade,
  -- Tu cuenta (el dueño)
  user_id uuid not null references auth.users (id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 40),
  ultimo_latido timestamptz,
  -- Apps que este agente sabe abrir (las configuras en el PC): solo nombres
  apps text[] not null default '{}' check (cardinality(apps) <= 30),
  version text check (version is null or length(version) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id <> user_id)
);
create index agentes_user_idx on public.agentes (user_id);

-- Códigos para vincular un PC: 8 caracteres, caducan en 10 minutos, un solo uso.
create table public.codigos_vinculacion (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  codigo_hash bytea not null unique,
  caduca_en timestamptz not null,
  usado_en timestamptz,
  created_at timestamptz not null default now()
);
create index codigos_vinculacion_user_idx on public.codigos_vinculacion (user_id);

-- Intentos fallidos de vincular (la Edge Function es pública: sin sesión)
create table public.vinculacion_intentos (
  id bigint generated always as identity primary key,
  cuando timestamptz not null default now()
);
create index vinculacion_intentos_cuando_idx on public.vinculacion_intentos (cuando);

-- -----------------------------------------------------------------------------
-- Tipo de cuenta: ahora también 'agente'
-- -----------------------------------------------------------------------------

create or replace function public.tipo_cuenta()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then null
    -- Un agente lo es aunque ya esté desvinculado (sin fila en agentes): lo dice
    -- su app_metadata, que solo puede escribir el servidor (la Edge Function).
    -- Así un agente desvinculado no pasa a ser una cuenta normal.
    when exists (select 1 from public.agentes a where a.id = auth.uid()) then 'agente'
    when exists (select 1 from auth.users u where u.id = auth.uid() and u.raw_app_meta_data ->> 'tipo' = 'agente') then 'agente'
    when exists (
      select 1 from auth.users u
      join public.cuentas_solo_lista c on c.email = lower(u.email)
      where u.id = auth.uid()
    ) then 'solo_lista'
    else 'normal'
  end;
$$;

-- El dueño del agente de esta petición (null si quien llama no es un agente vinculado)
create or replace function public.mi_dueno()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id from public.agentes a where a.id = auth.uid();
$$;
revoke execute on function public.mi_dueno() from public, anon;
grant execute on function public.mi_dueno() to authenticated;

-- Un agente tampoco usa la Lista de la compra ni el hogar
do $$
declare
  t text;
begin
  foreach t in array array['compra_mia', 'compra_casa', 'compra_frecuentes', 'borrados_hogar',
                           'hogares', 'hogar_miembros', 'hogar_invitaciones', 'hogar_avisos']
  loop
    execute format(
      'create policy "sin_agentes" on public.%I as restrictive for all to authenticated
         using ((select public.tipo_cuenta()) <> ''agente'')
         with check ((select public.tipo_cuenta()) <> ''agente'')', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Puente: el agente lo LEE (avisar y copiar al portapapeles). Escribir, no.
-- La restrictiva de puente pasa a ser por operación: leer, cuenta normal o
-- agente; escribir, solo cuenta normal.
-- -----------------------------------------------------------------------------

drop policy "solo_cuentas_normales" on public.puente;
create policy "solo_cuentas_normales" on public.puente as restrictive for select to authenticated
  using ((select public.tipo_cuenta()) in ('normal', 'agente'));
create policy "solo_cuentas_normales_insert" on public.puente as restrictive for insert to authenticated
  with check ((select public.tipo_cuenta()) = 'normal');
create policy "solo_cuentas_normales_update" on public.puente as restrictive for update to authenticated
  using ((select public.tipo_cuenta()) = 'normal') with check ((select public.tipo_cuenta()) = 'normal');
create policy "solo_cuentas_normales_delete" on public.puente as restrictive for delete to authenticated
  using ((select public.tipo_cuenta()) = 'normal');
-- Permisiva: el agente ve el Puente de su dueño
create policy "agente_lee_puente_de_su_dueno" on public.puente
  for select to authenticated using (user_id = (select public.mi_dueno()));

-- -----------------------------------------------------------------------------
-- RLS de las tablas nuevas
-- -----------------------------------------------------------------------------

alter table public.agentes enable row level security;
-- El dueño ve sus PC; cada agente, su propia fila
create policy "dueno_o_el_propio_agente" on public.agentes
  for select to authenticated using (user_id = (select auth.uid()) or id = (select auth.uid()));
-- El dueño le cambia el nombre y lo desvincula (borra su fila)
create policy "dueno_cambia_nombre" on public.agentes
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dueno_desvincula" on public.agentes
  for delete to authenticated using (user_id = (select auth.uid()));
-- Nadie lo crea desde la app (solo la Edge Function, con la service role)
revoke insert on public.agentes from authenticated;
-- Desde la app el dueño solo puede cambiar el nombre
revoke update on public.agentes from authenticated;
grant update (nombre) on public.agentes to authenticated;

alter table public.codigos_vinculacion enable row level security;
create policy "mis_codigos_select" on public.codigos_vinculacion
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "mis_codigos_delete" on public.codigos_vinculacion
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke insert, update on public.codigos_vinculacion from authenticated;
revoke select on public.codigos_vinculacion from authenticated;
grant select (id, user_id, caduca_en, usado_en, created_at) on public.codigos_vinculacion to authenticated;

alter table public.vinculacion_intentos enable row level security;

revoke all on public.agentes, public.codigos_vinculacion, public.vinculacion_intentos from anon;
revoke all on public.vinculacion_intentos from authenticated;
revoke truncate, references, trigger on public.agentes, public.codigos_vinculacion from authenticated;

-- El agente ni siquiera puede cambiar su fila: escribe con agente_latido()
create policy "sin_agentes" on public.codigos_vinculacion as restrictive for all to authenticated
  using ((select public.tipo_cuenta()) = 'normal') with check ((select public.tipo_cuenta()) = 'normal');

-- -----------------------------------------------------------------------------
-- Vincular
-- -----------------------------------------------------------------------------

-- Para la app: «Vincular un PC». Devuelve el código (solo esta vez) y su caducidad.
-- 8 caracteres de un alfabeto de 32 (40 bits), 10 minutos, un solo uso, 3 activos como mucho.
create or replace function public.crear_codigo_vinculacion()
returns table (codigo text, caduca_en timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := substring(uuid_send(gen_random_uuid()) from 1 for 6) || substring(uuid_send(gen_random_uuid()) from 10 for 2);
  v_codigo text := '';
  v_caduca timestamptz := now() + interval '10 minutes';
  i int;
begin
  if v_uid is null or public.tipo_cuenta() <> 'normal' then
    raise exception 'Solo una cuenta normal puede vincular un PC' using errcode = '42501';
  end if;
  if (select count(*) from public.agentes a where a.user_id = v_uid) >= 5 then
    raise exception 'Ya tienes 5 PC vinculados: desvincula alguno' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.codigos_vinculacion c where c.user_id = v_uid and c.usado_en is null and c.caduca_en > now()) >= 3 then
    raise exception 'Ya tienes 3 códigos sin usar: espera a que caduquen' using errcode = 'check_violation';
  end if;
  for i in 0..7 loop
    v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  insert into public.codigos_vinculacion (user_id, codigo_hash, caduca_en)
  values (v_uid, sha256(convert_to(v_codigo, 'UTF8')), v_caduca);
  return query select substr(v_codigo, 1, 4) || '-' || substr(v_codigo, 5, 4), v_caduca;
end;
$$;
revoke execute on function public.crear_codigo_vinculacion() from public, anon;
grant execute on function public.crear_codigo_vinculacion() to authenticated;

-- Para la Edge Function (service role): gasta el código y dice de quién es.
-- Devuelve el user_id del dueño, o null si el código no vale. Como mucho 30
-- intentos fallidos cada 10 minutos en total (es un endpoint sin sesión).
create or replace function public.usar_codigo_vinculacion(codigo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_normal text := upper(regexp_replace(coalesce(codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_cod public.codigos_vinculacion%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('vinculacion-intentos'));
  if (select count(*) from public.vinculacion_intentos where cuando > now() - interval '10 minutes') >= 30 then
    return null;
  end if;
  select * into v_cod from public.codigos_vinculacion c
  where length(v_normal) = 8 and c.codigo_hash = sha256(convert_to(v_normal, 'UTF8'))
  for update;
  if not found or v_cod.usado_en is not null or v_cod.caduca_en <= now() then
    insert into public.vinculacion_intentos default values;
    delete from public.vinculacion_intentos where cuando < now() - interval '1 day';
    return null;
  end if;
  update public.codigos_vinculacion set usado_en = now() where id = v_cod.id;
  return v_cod.user_id;
end;
$$;
revoke execute on function public.usar_codigo_vinculacion(text) from public, anon, authenticated;
grant execute on function public.usar_codigo_vinculacion(text) to service_role;

-- -----------------------------------------------------------------------------
-- Lo que puede hacer el agente (solo con estas funciones)
-- -----------------------------------------------------------------------------

-- Latido (cada minuto): «estoy encendido», y qué apps sabe abrir.
create or replace function public.agente_latido(apps text[] default '{}', version text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_apps text[];
begin
  if public.mi_dueno() is null then
    raise exception 'No es un agente vinculado' using errcode = '42501';
  end if;
  -- Solo nombres cortos y legibles
  select coalesce(array_agg(left(btrim(a), 40) order by ord), '{}') into v_apps
  from unnest(coalesce(apps, '{}')) with ordinality as x(a, ord)
  where ord <= 30 and btrim(a) <> '' and btrim(a) !~ '[[:cntrl:]]';
  update public.agentes
  set ultimo_latido = now(), apps = v_apps, version = left(agente_latido.version, 20), updated_at = now()
  where id = auth.uid();
end;
$$;
revoke execute on function public.agente_latido(text[], text) from public, anon;
grant execute on function public.agente_latido(text[], text) to authenticated;

-- `mipanel-enviar`: manda texto o un enlace al Puente de su dueño, con el
-- nombre del PC como dispositivo. Los checks de la tabla validan el resto.
create or replace function public.agente_enviar_puente(contenido text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_dueno uuid := public.mi_dueno();
  v_texto text := btrim(coalesce(contenido, ''), E' \t\r\n');
  v_id uuid := gen_random_uuid();
begin
  if v_dueno is null then
    raise exception 'No es un agente vinculado' using errcode = '42501';
  end if;
  if v_texto = '' then
    raise exception 'No hay nada que mandar' using errcode = 'check_violation';
  end if;
  insert into public.puente (id, user_id, tipo, contenido, dispositivo)
  select v_id, v_dueno,
         case when v_texto ~* '^https?://[^\s]+$' then 'enlace' else 'texto' end,
         v_texto, left(a.nombre, 40)
  from public.agentes a where a.id = auth.uid();
  return v_id;
end;
$$;
revoke execute on function public.agente_enviar_puente(text) from public, anon;
grant execute on function public.agente_enviar_puente(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: el dueño ve el latido de sus PC al momento
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.agentes';
  end if;
end;
$$;
