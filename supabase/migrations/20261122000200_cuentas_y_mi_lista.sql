-- =============================================================================
-- Fase 9 · Lista de la compra (1/3): tipos de cuenta y «Mi lista»
--
-- Cuentas «solo lista» (la familia): entran con Google como todos (su email
-- tiene que estar en emails_permitidos) y ADEMÁS en cuentas_solo_lista. Solo
-- pueden usar la Lista de la compra.
--
-- Ocultar menús en la app no es seguridad: lo que lo impide es una política
-- RESTRICTIVE en cada tabla de Mi Panel. Postgres junta las políticas
-- permissive con OR (las 4 de «solo el dueño») y las restrictive con AND, así
-- que basta con añadir una más sin tocar las que ya hay:
--   ... and (select public.tipo_cuenta()) = 'normal'
-- No se tocan las tablas de la web de exámenes (perfiles, modulos…): allí un
-- familiar solo vería sus propias filas, que no tiene.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cuentas «solo lista»
-- -----------------------------------------------------------------------------

-- Para añadir a un familiar (SQL Editor, una vez):
--   insert into public.emails_permitidos (email) values ('familiar@gmail.com');
--   insert into public.cuentas_solo_lista (email) values ('familiar@gmail.com');
create table public.cuentas_solo_lista (
  email text primary key check (email = lower(email) and length(email) between 3 and 320),
  created_at timestamptz not null default now()
);
-- RLS sin políticas: desde la app nadie la lee ni la toca (como emails_permitidos)
alter table public.cuentas_solo_lista enable row level security;
revoke all on public.cuentas_solo_lista from anon, authenticated;

-- 'normal' o 'solo_lista' (en la sección del agente del PC se añade 'agente').
-- security definer: lee auth.users y cuentas_solo_lista, que el usuario no puede leer.
create or replace function public.tipo_cuenta()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then null
    when exists (
      select 1 from auth.users u
      join public.cuentas_solo_lista c on c.email = lower(u.email)
      where u.id = auth.uid()
    ) then 'solo_lista'
    else 'normal'
  end;
$$;
revoke execute on function public.tipo_cuenta() from public, anon;
grant execute on function public.tipo_cuenta() to authenticated;

-- Política restrictiva en todas las tablas de Mi Panel (las de la compra no)
do $$
declare
  t text;
begin
  foreach t in array array[
    'habitos', 'habito_marcas', 'tareas', 'movimientos', 'movimientos_fijos', 'traspasos', 'revisiones',
    'ideas', 'cumpleanos', 'planes', 'deseos', 'clientes_web', 'suscripciones_push', 'puente']
  loop
    execute format(
      'create policy "solo_cuentas_normales" on public.%I as restrictive for all to authenticated
         using ((select public.tipo_cuenta()) = ''normal'')
         with check ((select public.tipo_cuenta()) = ''normal'')', t);
  end loop;
end;
$$;

-- inicializar_cuenta: a una cuenta «solo lista» no se le crean hábitos ni
-- módulos de ejemplo (ni perfil). Mismo cuerpo que 20261113000400 más ese paso 0.
create or replace function public.inicializar_cuenta()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inicializado boolean;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '42501';
  end if;

  -- 0. La familia solo usa la Lista de la compra
  if public.tipo_cuenta() <> 'normal' then
    return false;
  end if;

  -- 1. Perfil
  insert into public.perfiles (id, user_id)
  values (v_uid, v_uid)
  on conflict (id) do nothing;

  select mi_panel_inicializado into v_inicializado
  from public.perfiles
  where id = v_uid
  for update;

  if v_inicializado then
    return false;
  end if;

  -- 2. Hábitos iniciales
  insert into public.habitos (user_id, nombre, orden)
  values
    (v_uid, 'Gimnasio', 0),
    (v_uid, 'Leer 20 min', 1),
    (v_uid, 'Dormir 8 h', 2);

  -- 3. Módulos de 2º SMR, solo en cuentas sin módulos
  if not exists (select 1 from public.modulos where user_id = v_uid) then
    insert into public.modulos (user_id, abreviatura, nombre, color, imagen, orden, con_examenes)
    values
      (v_uid, 'SOR',  'Sistemas Operativos en Red',                         '#5284b7', 'sistemas',  0, true),
      (v_uid, 'SI',   'Seguridad Informática',                              '#b2686b', 'candado',   1, true),
      (v_uid, 'SR',   'Servicios en Red',                                   '#22928f', 'red',       2, true),
      (v_uid, 'AO',   'Aplicaciones Ofimáticas',                            '#a6753d', 'documento', 3, true),
      (v_uid, 'CNV',  'Computación en la Nube y Virtualización (optativa)', '#7f76b5', 'nube',      4, true),
      (v_uid, 'IPE2', 'Itinerario Personal para la Empleabilidad II',       '#57905f', 'maletin',   5, true),
      (v_uid, 'PI',   'Proyecto Intermodular',                              '#a36a97', 'cohete',    6, true),
      (v_uid, 'FE',   'Formación en Empresa',                               '#77828a', 'empresa',   7, false);
  end if;

  -- 4. Marca
  update public.perfiles set mi_panel_inicializado = true where id = v_uid;
  return true;
end;
$$;
revoke all on function public.inicializar_cuenta() from public, anon;
grant execute on function public.inicializar_cuenta() to authenticated;

-- -----------------------------------------------------------------------------
-- Mi lista (privada): las 4 políticas de siempre
-- -----------------------------------------------------------------------------

create table public.compra_mia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  cantidad text check (cantidad is null or length(cantidad) between 1 and 30),
  seccion text check (seccion is null or seccion in (
    'fruta_verdura', 'carne_pescado', 'lacteos', 'panaderia', 'despensa',
    'congelados', 'bebidas', 'limpieza', 'higiene', 'otros')),
  notas text not null default '' check (length(notas) <= 300),
  comprado boolean not null default false,
  comprado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now(),
  check (comprado or comprado_en is null)
);

create trigger antes_de_guardar before insert or update on public.compra_mia
  for each row execute function public.antes_de_guardar();
create trigger despues_de_borrar after delete on public.compra_mia
  for each row execute function public.despues_de_borrar();
create trigger no_revivir_borrado before insert on public.compra_mia
  for each row execute function public.no_revivir_borrado();
create index compra_mia_user_sync_idx on public.compra_mia (user_id, sync_at);

alter table public.compra_mia enable row level security;
create policy "solo_mis_filas_select" on public.compra_mia
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "solo_mis_filas_insert" on public.compra_mia
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_update" on public.compra_mia
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_delete" on public.compra_mia
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Como mucho 1.000 artículos por persona (la lista es para la compra, no un almacén)
create or replace function public.tope_compra_mia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.compra_mia where id = new.id) then
    return new; -- upsert de una fila que ya existe (marcar, editar)
  end if;
  if (select count(*) from public.compra_mia where user_id = new.user_id) >= 1000 then
    raise exception 'La lista está llena: quita los comprados' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.tope_compra_mia() from public, anon, authenticated;
create trigger tope_compra_mia before insert on public.compra_mia
  for each row execute function public.tope_compra_mia();

revoke all on public.compra_mia from anon;
revoke truncate, references, trigger on public.compra_mia from authenticated;

-- -----------------------------------------------------------------------------
-- Lo que más compras (para las sugerencias al escribir)
--
-- «Quitar los comprados» BORRA los artículos, así que el historial no puede
-- salir de la lista. Cada vez que alguien marca algo como comprado (en
-- cualquiera de las dos listas), un trigger lo cuenta aquí, a nombre de quien
-- lo marca. La app solo la lee (se sincroniza en solo lectura).
-- -----------------------------------------------------------------------------

create table public.compra_frecuentes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- nombre sin tildes, en minúsculas y sin espacios de más: «Plátanos» = «platanos»
  clave text not null check (length(clave) between 1 and 80),
  nombre text not null check (length(nombre) between 1 and 80),
  seccion text,
  veces integer not null default 1 check (veces >= 1),
  ultima timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now(),
  unique (user_id, clave)
);
create trigger antes_de_guardar before insert or update on public.compra_frecuentes
  for each row execute function public.antes_de_guardar();
create index compra_frecuentes_user_sync_idx on public.compra_frecuentes (user_id, sync_at);

alter table public.compra_frecuentes enable row level security;
-- Solo leer lo propio. Escribir, solo el trigger (security definer).
create policy "solo_mis_filas_select" on public.compra_frecuentes
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.compra_frecuentes from anon;
revoke insert, update, delete, truncate, references, trigger on public.compra_frecuentes from authenticated;

create or replace function public.clave_compra(nombre text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(btrim(regexp_replace(lower(translate(nombre, 'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç', 'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc')), '\s+', ' ', 'g')), 80);
$$;

create or replace function public.apuntar_frecuente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_clave text := public.clave_compra(new.nombre);
begin
  -- Solo cuando pasa a comprado, y solo si lo hace un usuario (no la service role)
  if v_uid is null or not new.comprado or (tg_op = 'UPDATE' and old.comprado) or v_clave = '' then
    return null;
  end if;
  insert into public.compra_frecuentes (user_id, clave, nombre, seccion)
  values (v_uid, v_clave, left(btrim(new.nombre), 80), new.seccion)
  on conflict (user_id, clave) do update
    set veces = public.compra_frecuentes.veces + 1,
        ultima = now(),
        nombre = excluded.nombre,
        seccion = coalesce(excluded.seccion, public.compra_frecuentes.seccion);
  -- Como mucho 300 por persona: se olvidan los menos comprados
  delete from public.compra_frecuentes f
  where f.user_id = v_uid and f.id in (
    select id from public.compra_frecuentes where user_id = v_uid
    order by veces desc, ultima desc offset 300);
  return null;
end;
$$;
revoke execute on function public.apuntar_frecuente() from public, anon, authenticated;
create trigger apuntar_frecuente after insert or update of comprado on public.compra_mia
  for each row execute function public.apuntar_frecuente();
