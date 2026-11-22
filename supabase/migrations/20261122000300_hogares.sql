-- =============================================================================
-- Fase 9 · Lista de la compra (2/3): hogar e invitaciones
--
-- Un hogar lo crea una cuenta normal (tú). Los demás entran con un código de
-- invitación aleatorio, de un solo uso, que caduca en 7 días. El dueño ve los
-- miembros y puede expulsar a alguien: pierde el acceso en ese momento,
-- porque todas las políticas preguntan es_miembro() en cada consulta.
--
-- Cada persona está como mucho en UN hogar (unique en hogar_miembros.user_id).
--
-- Rompe la regla «solo el dueño ve sus filas»: los miembros se ven entre sí.
-- Para no consultar hogar_miembros desde sus propias políticas (bucle de RLS),
-- la pregunta se hace con funciones security definer con search_path fijo.
-- =============================================================================

create table public.hogares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null default 'Casa' check (length(btrim(nombre)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id) -- cada uno crea como mucho un hogar
);

create table public.hogar_miembros (
  -- Clave propia (y no (hogar_id, user_id)): así un borrado no enseña nunca
  -- quién estaba en qué hogar.
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Nombre que ven los demás (el de Google al entrar)
  nombre text not null check (length(nombre) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (hogar_id, user_id),
  unique (user_id) -- cada persona, en un solo hogar
);

-- Avisos «tu hogar ha cambiado» (entras, sales, te expulsan o cambian los
-- miembros). Cada uno lee solo los suyos y la app los escucha en tiempo real
-- filtrando por su user_id: así nadie se entera de lo de otros hogares.
-- Sin clave foránea a auth.users a propósito: al borrar una cuenta, la
-- cascada quita su fila de hogar_miembros y el trigger le apunta un aviso a
-- ese usuario que ya no existe; con la clave foránea fallaría el borrado de
-- la cuenta. Los avisos se borran solos al día.
create table public.hogar_avisos (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index hogar_avisos_user_idx on public.hogar_avisos (user_id, created_at);
create index hogar_avisos_fecha_idx on public.hogar_avisos (created_at);

create table public.hogar_invitaciones (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Solo el hash: si alguien lee la tabla, no puede usar los códigos
  codigo_hash bytea not null unique,
  caduca_en timestamptz not null,
  usado_en timestamptz,
  usado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index hogar_invitaciones_hogar_idx on public.hogar_invitaciones (hogar_id);

-- Intentos fallidos de unirse (contra la fuerza bruta). Nadie los lee desde la app.
create table public.hogar_intentos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  cuando timestamptz not null default now()
);
create index hogar_intentos_user_idx on public.hogar_intentos (user_id, cuando);

-- -----------------------------------------------------------------------------
-- Funciones de ayuda (security definer, search_path fijo)
-- -----------------------------------------------------------------------------

-- ¿El usuario de esta petición es miembro de ese hogar?
create or replace function public.es_miembro(hogar uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.hogar_miembros m where m.hogar_id = hogar and m.user_id = auth.uid());
$$;

-- ¿Es su dueño (quien lo creó)?
create or replace function public.es_dueno_hogar(hogar uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.hogares h where h.id = hogar and h.user_id = auth.uid());
$$;

-- Nombre para enseñar a los demás miembros: el de la cuenta de Google
-- (auth.identities), que el usuario NO puede cambiar. user_metadata sí lo
-- puede cambiar él mismo (auth.updateUser), así que no se usa. Nunca el email.
create or replace function public.nombre_de_usuario(usuario uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(coalesce(
    (select nullif(btrim(coalesce(i.identity_data ->> 'full_name', i.identity_data ->> 'name')), '')
     from auth.identities i where i.user_id = usuario and i.provider = 'google'
     order by i.created_at limit 1),
    'Alguien'), 80);
$$;

revoke execute on function public.es_miembro(uuid) from public, anon;
revoke execute on function public.es_dueno_hogar(uuid) from public, anon;
revoke execute on function public.nombre_de_usuario(uuid) from public, anon, authenticated;
grant execute on function public.es_miembro(uuid) to authenticated;
grant execute on function public.es_dueno_hogar(uuid) to authenticated;

-- Al crear el hogar, su dueño entra como primer miembro
create or replace function public.dueno_entra_en_su_hogar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.hogar_miembros (hogar_id, user_id, nombre)
  values (new.id, new.user_id, coalesce(public.nombre_de_usuario(new.user_id), 'Alguien'));
  return null;
end;
$$;
revoke execute on function public.dueno_entra_en_su_hogar() from public, anon, authenticated;
create trigger dueno_entra_en_su_hogar after insert on public.hogares
  for each row execute function public.dueno_entra_en_su_hogar();

-- Cada vez que entra o sale alguien, avisa a los afectados: a quien entra o
-- sale y a los que siguen en el hogar (para que refresquen la lista de miembros)
create or replace function public.avisar_cambio_de_hogar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_hogar uuid;
begin
  if tg_op = 'DELETE' then
    v_usuario := old.user_id;
    v_hogar := old.hogar_id;
  else
    v_usuario := new.user_id;
    v_hogar := new.hogar_id;
  end if;
  insert into public.hogar_avisos (user_id)
  select v_usuario
  union
  select m.user_id from public.hogar_miembros m where m.hogar_id = v_hogar;
  delete from public.hogar_avisos where created_at < now() - interval '1 day';
  return null;
end;
$$;
revoke execute on function public.avisar_cambio_de_hogar() from public, anon, authenticated;
create trigger avisar_cambio_de_hogar after insert or delete on public.hogar_miembros
  for each row execute function public.avisar_cambio_de_hogar();

-- El dueño no cambia
create or replace function public.hogar_mismo_dueno()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.hogar_mismo_dueno() from public, anon, authenticated;
create trigger hogar_mismo_dueno before update on public.hogares
  for each row execute function public.hogar_mismo_dueno();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.hogares enable row level security;
-- Lo ven sus miembros; lo crea una cuenta normal (no un familiar) que aún no está en ningún hogar
create policy "solo_mis_filas_select" on public.hogares
  for select to authenticated using ((select public.es_miembro(id)));
create policy "solo_mis_filas_insert" on public.hogares
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (select public.tipo_cuenta()) = 'normal'
    and not exists (select 1 from public.hogar_miembros m where m.user_id = (select auth.uid())));
create policy "solo_mis_filas_update" on public.hogares
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_delete" on public.hogares
  for delete to authenticated using ((select auth.uid()) = user_id);

alter table public.hogar_miembros enable row level security;
-- Los miembros se ven entre sí. Nadie se apunta directamente (solo con unirse_hogar).
create policy "miembros_se_ven" on public.hogar_miembros
  for select to authenticated using ((select public.es_miembro(hogar_id)));
-- Salir: un miembro se quita a sí mismo (el dueño no: borra el hogar).
-- Expulsar: el dueño quita a otro.
create policy "salir_o_expulsar" on public.hogar_miembros
  for delete to authenticated using (
    (user_id = (select auth.uid()) and not (select public.es_dueno_hogar(hogar_id)))
    or (user_id <> (select auth.uid()) and (select public.es_dueno_hogar(hogar_id))));

alter table public.hogar_invitaciones enable row level security;
-- Solo el dueño ve (caducidad y si se usaron) y anula sus invitaciones. Se crean con crear_invitacion().
create policy "mis_invitaciones_select" on public.hogar_invitaciones
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "mis_invitaciones_delete" on public.hogar_invitaciones
  for delete to authenticated using ((select auth.uid()) = user_id);

alter table public.hogar_intentos enable row level security;

alter table public.hogar_avisos enable row level security;
create policy "mis_avisos_select" on public.hogar_avisos
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.hogar_avisos from anon;
revoke insert, update, delete, truncate, references, trigger on public.hogar_avisos from authenticated;

revoke all on public.hogares, public.hogar_miembros, public.hogar_invitaciones, public.hogar_intentos from anon;
revoke all on public.hogar_intentos from authenticated;
revoke insert, update on public.hogar_miembros, public.hogar_invitaciones from authenticated;
revoke truncate, references, trigger on public.hogares, public.hogar_miembros, public.hogar_invitaciones from authenticated;
-- El hash del código no hace falta en la app
revoke select on public.hogar_invitaciones from authenticated;
grant select (id, hogar_id, user_id, caduca_en, usado_en, usado_por, created_at) on public.hogar_invitaciones to authenticated;

-- -----------------------------------------------------------------------------
-- Códigos de invitación
-- -----------------------------------------------------------------------------

-- Quita guiones y espacios y pasa a mayúsculas: «abcde-fghjk» = «ABCDEFGHJK»
create or replace function public.normalizar_codigo(codigo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(codigo, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Crea una invitación para TU hogar y devuelve el código (solo esta vez: en
-- la base de datos queda el hash). 10 caracteres de un alfabeto de 32 sin
-- letras que se confundan (sin I, O, 0 ni 1): 50 bits de azar.
create or replace function public.crear_invitacion()
returns table (codigo text, caduca_en timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hogar uuid;
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_codigo text := '';
  v_caduca timestamptz := now() + interval '7 days';
  i int;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '42501';
  end if;
  select h.id into v_hogar from public.hogares h where h.user_id = v_uid;
  if v_hogar is null then
    raise exception 'Primero crea tu hogar' using errcode = '42501';
  end if;
  if (select count(*) from public.hogar_invitaciones x
      where x.hogar_id = v_hogar and x.usado_en is null and x.caduca_en > now()) >= 5 then
    raise exception 'Ya tienes 5 invitaciones sin usar: anula alguna' using errcode = 'check_violation';
  end if;
  -- Bytes aleatorios de dos uuid v4 (sin los bytes de versión y variante)
  v_bytes := substring(uuid_send(gen_random_uuid()) from 1 for 6) || substring(uuid_send(gen_random_uuid()) from 10 for 4);
  for i in 0..9 loop
    -- 256 es múltiplo de 32: cada carácter sale igual de probable
    v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  insert into public.hogar_invitaciones (hogar_id, user_id, codigo_hash, caduca_en)
  values (v_hogar, v_uid, sha256(convert_to(v_codigo, 'UTF8')), v_caduca);
  return query select substr(v_codigo, 1, 5) || '-' || substr(v_codigo, 6, 5), v_caduca;
end;
$$;
revoke execute on function public.crear_invitacion() from public, anon;
grant execute on function public.crear_invitacion() to authenticated;

-- Entrar en un hogar con un código. Devuelve 'ok' o el motivo:
--   'invalido', 'caducado', 'usado', 'ya_en_hogar', 'demasiados_intentos'.
-- No lanza error en los fallos, para que el intento fallido quede apuntado
-- (con un error se desharía). Como mucho 10 intentos fallidos por hora.
create or replace function public.unirse_hogar(codigo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_normal text := public.normalizar_codigo(codigo);
  v_inv public.hogar_invitaciones%rowtype;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '42501';
  end if;
  if exists (select 1 from public.hogar_miembros m where m.user_id = v_uid) then
    return 'ya_en_hogar';
  end if;
  -- Un usuario a la vez (si no, varios intentos en paralelo se saltarían el tope)
  perform pg_advisory_xact_lock(hashtext('hogar-intentos:' || v_uid::text));
  if (select count(*) from public.hogar_intentos t where t.user_id = v_uid and t.cuando > now() - interval '1 hour') >= 10 then
    return 'demasiados_intentos';
  end if;

  select * into v_inv from public.hogar_invitaciones x
  where length(v_normal) = 10 and x.codigo_hash = sha256(convert_to(v_normal, 'UTF8'))
  for update;

  if not found then
    insert into public.hogar_intentos (user_id) values (v_uid);
    return 'invalido';
  end if;
  if v_inv.usado_en is not null then
    insert into public.hogar_intentos (user_id) values (v_uid);
    return 'usado';
  end if;
  if v_inv.caduca_en <= now() then
    insert into public.hogar_intentos (user_id) values (v_uid);
    return 'caducado';
  end if;

  update public.hogar_invitaciones set usado_en = now(), usado_por = v_uid where id = v_inv.id;
  insert into public.hogar_miembros (hogar_id, user_id, nombre)
  values (v_inv.hogar_id, v_uid, coalesce(public.nombre_de_usuario(v_uid), 'Alguien'));
  -- Lo viejo sobra
  delete from public.hogar_intentos t where t.cuando < now() - interval '1 day';
  return 'ok';
end;
$$;
revoke execute on function public.unirse_hogar(text) from public, anon;
grant execute on function public.unirse_hogar(text) to authenticated;
