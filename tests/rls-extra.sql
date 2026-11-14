-- =============================================================================
-- Test de RLS ampliado (huecos señalados por el agente de seguridad)
--
-- Complementa a tests/rls.sql. Cada bloque `-- @caso: <nombre>` es una
-- comprobación independiente:
--   · Vitest (tests/sql.test.ts) ejecuta cada caso por separado, en su propia
--     transacción, precedido del preámbulo (todo lo que va antes del primer
--     `-- @caso:`). Así cada caso sale como un test con nombre.
--   · En Supabase (SQL Editor) o con psql se puede ejecutar el archivo entero:
--       psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/rls-extra.sql
--     Todo va en una transacción que se deshace al final.
--
-- Reglas para escribir casos:
--   · Cada caso empieza con `reset role;` (vuelve a ser el administrador).
--   · Un caso no debe dejar cambios de los que dependa otro caso.
--   · Los casos que destruyen datos de prueba (borrar usuarios) van al final.
-- =============================================================================

begin;

create temporary table resultados (n int not null default 0);
insert into resultados values (0);
grant all on resultados to authenticated, anon, service_role;

-- Ayudas: actuar como un usuario (o sin sesión) y comprobar
create or replace function pg_temp.como(usuario text) returns void language plpgsql as $$
begin
  if usuario = 'service' then
    perform set_config('role', 'service_role', true);
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  elsif usuario = 'anon' then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
  end if;
end;
$$;

create or replace function pg_temp.comprobar(condicion boolean, que text) returns void language plpgsql as $$
begin
  if not condicion then
    raise exception 'RLS FALLA: %', que;
  end if;
  update resultados set n = n + 1;
end;
$$;

-- Ejecuta `sentencia` y comprueba que falla con uno de los SQLSTATE esperados
-- (p. ej. '42501' permiso denegado / RLS, '23503' clave foránea, '23514' check).
create or replace function pg_temp.debe_fallar(sentencia text, estados text[], que text) returns void
language plpgsql as $$
begin
  begin
    execute sentencia;
  exception when others then
    if sqlstate = any (estados) then
      update resultados set n = n + 1;
      return;
    end if;
    raise exception 'RLS FALLA: % (error inesperado % : %)', que, sqlstate, sqlerrm;
  end;
  raise exception 'RLS FALLA: %', que;
end;
$$;

-- Usuarios de prueba
insert into public.emails_permitidos (email) values ('prueba-a@rls.test'), ('prueba-b@rls.test');
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'prueba-a@rls.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'prueba-b@rls.test');

-- Datos de A: perfil, módulo, RA, evaluación, tema, falta y un borrado apuntado
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.perfiles (nombre) values ('A');
insert into public.modulos (id, nombre, abreviatura) values ('a0000000-0000-4000-8000-0000000000a1', 'SOR de A', 'SOR');
insert into public.resultados_aprendizaje (id, modulo_id, codigo) values ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000a1', 'RA1');
insert into public.evaluaciones (id, modulo_id, titulo, tipo, fecha)
  values ('a0000000-0000-4000-8000-0000000000e1', 'a0000000-0000-4000-8000-0000000000a1', 'Examen de A', 'examen_teorico', now() + interval '1 day');
insert into public.temas (id, evaluacion_id, texto) values ('a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000e1', 'DHCP');
insert into public.faltas (modulo_id, fecha) values ('a0000000-0000-4000-8000-0000000000a1', current_date);
insert into public.chuletas (categoria, comando) values ('red', 'ip a');
insert into public.modulos (id, nombre, abreviatura) values ('a0000000-0000-4000-8000-0000000000a9', 'Para borrar', 'X');
delete from public.modulos where id = 'a0000000-0000-4000-8000-0000000000a9';

-- Datos de B: módulo, evaluación y tema propios
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
insert into public.modulos (id, nombre, abreviatura) values ('b0000000-0000-4000-8000-0000000000a1', 'SOR de B', 'SOR');
insert into public.evaluaciones (id, modulo_id, titulo, tipo, fecha)
  values ('b0000000-0000-4000-8000-0000000000e1', 'b0000000-0000-4000-8000-0000000000a1', 'Examen de B', 'examen_teorico', now() + interval '1 day');
insert into public.temas (id, evaluacion_id, texto) values ('b0000000-0000-4000-8000-0000000000f1', 'b0000000-0000-4000-8000-0000000000e1', 'DNS');

-- Mi Panel (fase 2): A y B tienen una fila en cada tabla nueva. Los ids acaban
-- en d01 (hábito), d02 (marca), d03 (tarea), d04 (movimiento) y d05 (cliente).
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.habitos (id, nombre) values ('a0000000-0000-4000-8000-000000000d01', 'Gimnasio de A');
insert into public.habito_marcas (id, habito_id, fecha) values ('a0000000-0000-4000-8000-000000000d02', 'a0000000-0000-4000-8000-000000000d01', '2026-03-29');
insert into public.tareas (id, texto, fecha_limite) values ('a0000000-0000-4000-8000-000000000d03', 'Tarea de A', '2026-12-31');
insert into public.movimientos (id, tipo, concepto, importe_centimos, fecha) values ('a0000000-0000-4000-8000-000000000d04', 'gasto', 'Café de A', 125, '2026-10-25');
insert into public.clientes_web (id, nombre, precio_centimos) values ('a0000000-0000-4000-8000-000000000d05', 'Cliente de A', 49999);

select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
insert into public.habitos (id, nombre) values ('b0000000-0000-4000-8000-000000000d01', 'Gimnasio de B');
insert into public.habito_marcas (id, habito_id, fecha) values ('b0000000-0000-4000-8000-000000000d02', 'b0000000-0000-4000-8000-000000000d01', '2026-03-29');
insert into public.tareas (id, texto) values ('b0000000-0000-4000-8000-000000000d03', 'Tarea de B');
insert into public.movimientos (id, tipo, concepto, importe_centimos, fecha) values ('b0000000-0000-4000-8000-000000000d04', 'ingreso', 'Paga de B', 2000, '2026-10-25');
insert into public.clientes_web (id, nombre) values ('b0000000-0000-4000-8000-000000000d05', 'Cliente de B');

reset role;

-- Ayuda para los casos de Mi Panel: inserta, con el usuario actual, una fila
-- válida en una de las 5 tablas nuevas con el id dado. `extra_cols`/`extra_vals`
-- permiten añadir columnas (p. ej. updated_at). Las marcas se cuelgan del
-- hábito `habito` y usan un día distinto cada vez (secuencia `dias`).
create temporary sequence dias;
grant usage on sequence dias to authenticated;
create or replace function pg_temp.insertar(tabla text, fila uuid, habito uuid default null,
  extra_cols text default '', extra_vals text default '') returns void language plpgsql as $$
begin
  execute case tabla
    when 'habitos' then format('insert into public.habitos (id, nombre %s) values (%L, ''h'' %s)', extra_cols, fila, extra_vals)
    when 'habito_marcas' then format('insert into public.habito_marcas (id, habito_id, fecha %s) values (%L, %L, date ''2001-01-01'' + nextval(''dias'')::int %s)', extra_cols, fila, habito, extra_vals)
    when 'tareas' then format('insert into public.tareas (id, texto %s) values (%L, ''t'' %s)', extra_cols, fila, extra_vals)
    when 'movimientos' then format('insert into public.movimientos (id, tipo, concepto, importe_centimos, fecha %s) values (%L, ''gasto'', ''m'', 1, ''2026-01-01'' %s)', extra_cols, fila, extra_vals)
    when 'clientes_web' then format('insert into public.clientes_web (id, nombre %s) values (%L, ''c'' %s)', extra_cols, fila, extra_vals)
  end;
end;
$$;

-- @caso: todas las tablas de public tienen RLS activado
reset role;
select pg_temp.comprobar(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
), 'hay tablas en public SIN RLS: ' || coalesce((
  select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), ''));

-- @caso: las tablas con user_id tienen las 4 políticas de authenticated
reset role;
-- uso_ia y borrados son de solo lectura a propósito (las escribe el servidor)
select pg_temp.comprobar(not exists (
  select 1
  from information_schema.columns col
  where col.table_schema = 'public' and col.column_name = 'user_id'
    and col.table_name not in ('uso_ia', 'borrados')
    and (select count(distinct p.cmd) from pg_policies p
         where p.schemaname = 'public' and p.tablename = col.table_name
           and p.cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
           and 'authenticated' = any (p.roles)) < 4
), 'tablas con user_id sin sus 4 políticas: ' || coalesce((
  select string_agg(col.table_name, ', ')
  from information_schema.columns col
  where col.table_schema = 'public' and col.column_name = 'user_id'
    and col.table_name not in ('uso_ia', 'borrados')
    and (select count(distinct p.cmd) from pg_policies p
         where p.schemaname = 'public' and p.tablename = col.table_name
           and p.cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
           and 'authenticated' = any (p.roles)) < 4), ''));

-- @caso: authenticated y anon no tienen TRUNCATE, REFERENCES ni TRIGGER en public
reset role;
select pg_temp.comprobar(not exists (
  select 1
  from pg_tables t, unnest(array['authenticated', 'anon']) rol,
       unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) priv
  where t.schemaname = 'public'
    and has_table_privilege(rol, format('public.%I', t.tablename), priv)
), 'privilegios de sobra: ' || coalesce((
  select string_agg(rol || ' ' || priv || ' en ' || t.tablename, ', ')
  from pg_tables t, unnest(array['authenticated', 'anon']) rol,
       unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) priv
  where t.schemaname = 'public'
    and has_table_privilege(rol, format('public.%I', t.tablename), priv)), ''));

-- @caso: las políticas de public no dan nada a anon ni a public
reset role;
select pg_temp.comprobar(not exists (
  select 1 from pg_policies p
  where p.schemaname = 'public' and ('anon' = any (p.roles) or 'public' = any (p.roles))
), 'hay políticas en public para anon/public');

-- @caso: anon no puede leer ninguna tabla de public ni storage.objects
reset role;
do $$
declare
  t text;
  n bigint;
begin
  perform pg_temp.como('anon');
  for t in
    select format('%I.%I', schemaname, tablename) from pg_tables
    where schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects')
  loop
    begin
      -- Si tuviera permiso, al menos no debe devolver filas
      execute format('select count(*) from %s', t) into n;
      perform pg_temp.comprobar(n = 0, 'anon ve filas de ' || t);
    exception when insufficient_privilege then
      perform pg_temp.comprobar(true, '');
    end;
  end loop;
end;
$$;

-- @caso: anon no puede escribir en ninguna tabla de public
reset role;
do $$
declare
  t text;
begin
  perform pg_temp.como('anon');
  for t in select format('%I.%I', schemaname, tablename) from pg_tables where schemaname = 'public'
  loop
    perform pg_temp.debe_fallar(format('insert into %s default values', t), array['42501'],
      'anon puede insertar en ' || t);
    perform pg_temp.debe_fallar(format('delete from %s', t), array['42501'],
      'anon puede borrar en ' || t);
  end loop;
end;
$$;

-- @caso: borrados: un usuario no puede insertar, editar ni borrar
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
select pg_temp.comprobar((select count(*) from public.borrados) >= 1, 'A no ve sus propios borrados');
select pg_temp.debe_fallar($q$insert into public.borrados (user_id, tabla, fila_id)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'modulos', gen_random_uuid())$q$,
  array['42501'], 'A puede insertar en borrados');
select pg_temp.debe_fallar($q$insert into public.borrados (user_id, tabla, fila_id)
  values ('bbbbbbbb-0000-4000-8000-000000000002', 'modulos', gen_random_uuid())$q$,
  array['42501'], 'A puede insertar en borrados a nombre de B');
select pg_temp.debe_fallar($q$update public.borrados set tabla = 'x'$q$,
  array['42501'], 'A puede editar borrados');
select pg_temp.debe_fallar($q$delete from public.borrados$q$,
  array['42501'], 'A puede borrar de borrados');
reset role;
select pg_temp.comprobar((select count(*) from public.borrados) = 1, 'borrados ha cambiado');

-- @caso: un UPDATE no puede cambiar user_id (el trigger lo repone)
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
update public.chuletas set user_id = 'bbbbbbbb-0000-4000-8000-000000000002', comando = 'ip r';
update public.modulos set user_id = 'bbbbbbbb-0000-4000-8000-000000000002', nombre = 'regalo'
  where id = 'a0000000-0000-4000-8000-0000000000a1';
select pg_temp.comprobar((select user_id from public.chuletas) = 'aaaaaaaa-0000-4000-8000-000000000001',
  'un UPDATE ha cambiado el user_id de una chuleta');
select pg_temp.comprobar((select comando from public.chuletas) = 'ip r', 'el UPDATE de la chuleta no se ha aplicado');
select pg_temp.comprobar((select user_id from public.modulos where id = 'a0000000-0000-4000-8000-0000000000a1')
  = 'aaaaaaaa-0000-4000-8000-000000000001', 'un UPDATE ha cambiado el user_id de un módulo');
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.comprobar((select count(*) from public.chuletas) = 0, 'B ve la chuleta que A intentó pasarle');
select pg_temp.comprobar((select count(*) from public.modulos where nombre = 'regalo') = 0, 'B ve el módulo que A intentó pasarle');

-- @caso: no se puede crear un perfil con el id de otro usuario
reset role;
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.debe_fallar($q$insert into public.perfiles (id, nombre)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'suplantado')$q$,
  array['42501', '23514', '23505'], 'B crea un perfil con el id de A');
select pg_temp.debe_fallar($q$insert into public.perfiles (id, user_id, nombre)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'suplantado')$q$,
  array['42501', '23505'], 'B crea un perfil con id y user_id de A');
select pg_temp.debe_fallar($q$insert into public.perfiles (id, user_id, nombre)
  values ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 'otro id')$q$,
  array['23514', '23503'], 'B crea un perfil con un id distinto del suyo');
-- B sí puede crear el suyo, y no ve el de A
insert into public.perfiles (nombre) values ('B');
select pg_temp.comprobar((select count(*) from public.perfiles) = 1, 'B ve un perfil que no es suyo');
select pg_temp.comprobar((select id from public.perfiles) = 'bbbbbbbb-0000-4000-8000-000000000002', 'el perfil de B no tiene su id');
-- Ni cambiando el id del suyo
select pg_temp.debe_fallar($q$update public.perfiles set id = 'aaaaaaaa-0000-4000-8000-000000000001'$q$,
  array['42501', '23514', '23505'], 'B cambia el id de su perfil por el de A');

-- @caso: B no ve, edita ni borra el perfil de A
reset role;
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.comprobar((select count(*) from public.perfiles where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 0, 'B ve el perfil de A');
with c as (update public.perfiles set nombre = 'hackeado' where id = 'aaaaaaaa-0000-4000-8000-000000000001' returning 1)
select pg_temp.comprobar((select count(*) from c) = 0, 'B edita el perfil de A');
with c as (delete from public.perfiles where id = 'aaaaaaaa-0000-4000-8000-000000000001' returning 1)
select pg_temp.comprobar((select count(*) from c) = 0, 'B borra el perfil de A');
reset role;
select pg_temp.comprobar((select nombre from public.perfiles where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'A', 'el perfil de A ha cambiado');

-- @caso: no se puede colgar una fila hija de un padre ajeno (insert)
reset role;
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.debe_fallar($q$insert into public.resultados_aprendizaje (modulo_id, codigo)
  values ('a0000000-0000-4000-8000-0000000000a1', 'RA9')$q$, array['23503'], 'B cuelga un RA del módulo de A');
select pg_temp.debe_fallar($q$insert into public.evaluaciones (modulo_id, titulo, tipo, fecha)
  values ('a0000000-0000-4000-8000-0000000000a1', 'x', 'practica', now())$q$, array['23503'], 'B cuelga una evaluación del módulo de A');
select pg_temp.debe_fallar($q$insert into public.temas (evaluacion_id, texto)
  values ('a0000000-0000-4000-8000-0000000000e1', 'x')$q$, array['23503'], 'B cuelga un tema de la evaluación de A');
select pg_temp.debe_fallar($q$insert into public.evaluacion_ra (evaluacion_id, ra_id)
  values ('b0000000-0000-4000-8000-0000000000e1', 'a0000000-0000-4000-8000-0000000000c1')$q$, array['23503'], 'B cuelga un evaluacion_ra del RA de A');
select pg_temp.debe_fallar($q$insert into public.faltas (modulo_id, fecha)
  values ('a0000000-0000-4000-8000-0000000000a1', current_date)$q$, array['23503'], 'B cuelga una falta del módulo de A');
select pg_temp.debe_fallar($q$insert into public.archivos (evaluacion_id, nombre, tamano, tipo)
  values ('a0000000-0000-4000-8000-0000000000e1', 'x.pdf', 1, 'application/pdf')$q$, array['23503'], 'B cuelga un archivo de la evaluación de A');
select pg_temp.debe_fallar($q$insert into public.flashcards (modulo_id, pregunta, respuesta)
  values ('a0000000-0000-4000-8000-0000000000a1', 'p', 'r')$q$, array['23503'], 'B cuelga una flashcard del módulo de A');
select pg_temp.debe_fallar($q$insert into public.examenes_ia (modulo_id)
  values ('a0000000-0000-4000-8000-0000000000a1')$q$, array['23503'], 'B cuelga un examen IA del módulo de A');
select pg_temp.debe_fallar($q$insert into public.pomodoro_sesiones (modulo_id, inicio, minutos)
  values ('a0000000-0000-4000-8000-0000000000a1', now(), 25)$q$, array['23503'], 'B cuelga un pomodoro del módulo de A');

-- @caso: no se puede colgar una fila hija de un padre ajeno (update)
reset role;
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.debe_fallar($q$update public.temas set evaluacion_id = 'a0000000-0000-4000-8000-0000000000e1'
  where id = 'b0000000-0000-4000-8000-0000000000f1'$q$, array['23503'], 'B mueve su tema a la evaluación de A');
select pg_temp.debe_fallar($q$update public.evaluaciones set modulo_id = 'a0000000-0000-4000-8000-0000000000a1'
  where id = 'b0000000-0000-4000-8000-0000000000e1'$q$, array['23503'], 'B mueve su evaluación al módulo de A');
reset role;
select pg_temp.comprobar((select count(*) from public.temas where evaluacion_id = 'a0000000-0000-4000-8000-0000000000e1') = 1,
  'la evaluación de A tiene temas ajenos');

-- @caso: Storage: no se puede subir, ver ni borrar en la carpeta de otro
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into storage.objects (bucket_id, name) values ('temarios', 'aaaaaaaa-0000-4000-8000-000000000001/e1/apuntes.pdf');
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name)
  values ('temarios', 'bbbbbbbb-0000-4000-8000-000000000002/e1/malware.pdf')$q$, array['42501'], 'A sube a la carpeta de B');
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name)
  values ('temarios', 'suelto.pdf')$q$, array['42501'], 'A sube fuera de cualquier carpeta');
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name)
  values ('temarios', 'x/aaaaaaaa-0000-4000-8000-000000000001/truco.pdf')$q$, array['42501'], 'A sube con su id en la segunda carpeta');
select pg_temp.debe_fallar($q$update storage.objects set name = 'bbbbbbbb-0000-4000-8000-000000000002/e1/apuntes.pdf'$q$,
  array['42501'], 'A mueve su archivo a la carpeta de B');
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.comprobar((select count(*) from storage.objects) = 0, 'B ve los archivos de A');
with c as (delete from storage.objects returning 1)
select pg_temp.comprobar((select count(*) from c) = 0, 'B borra los archivos de A');
with c as (update storage.objects set name = name returning 1)
select pg_temp.comprobar((select count(*) from c) = 0, 'B edita los archivos de A');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name)
  values ('temarios', 'aaaaaaaa-0000-4000-8000-000000000001/x.pdf')$q$, array['42501'], 'anon sube archivos');

-- @caso: anon no puede ejecutar las funciones privilegiadas
reset role;
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select public.sumar_uso_ia('aaaaaaaa-0000-4000-8000-000000000001', 20)$q$,
  array['42501'], 'anon ejecuta sumar_uso_ia');

-- -----------------------------------------------------------------------------
-- Mi Panel (fase 2): hábitos, marcas, tareas, movimientos y clientes web
-- -----------------------------------------------------------------------------

-- @caso: mi panel: B no ve, edita ni borra las filas de A en las 5 tablas nuevas
reset role;
do $$
declare
  tablas text[] := array['habitos', 'habito_marcas', 'tareas', 'movimientos', 'clientes_web'];
  id_a uuid;
  n bigint;
  propias bigint;
begin
  for i in 1..5 loop
    id_a := ('a0000000-0000-4000-8000-000000000d0' || i)::uuid;
    perform pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
    execute format('select count(*) from public.%I where user_id <> %L', tablas[i], 'bbbbbbbb-0000-4000-8000-000000000002') into n;
    perform pg_temp.comprobar(n = 0, 'B puede LEER filas ajenas de ' || tablas[i]);
    execute format('select count(*) from public.%I where id = %L', tablas[i], id_a) into n;
    perform pg_temp.comprobar(n = 0, 'B puede LEER por id la fila de A en ' || tablas[i]);
    execute format('select count(*) from public.%I', tablas[i]) into n;
    perform pg_temp.comprobar(n >= 1, 'B no ve su propia fila de ' || tablas[i]);
    execute format('with c as (update public.%I set updated_at = now() + interval ''1 day'' where id = %L returning 1)
                    select count(*) from c', tablas[i], id_a) into n;
    perform pg_temp.comprobar(n = 0, 'B puede EDITAR la fila de A en ' || tablas[i]);
    execute format('with c as (delete from public.%I where id = %L returning 1) select count(*) from c', tablas[i], id_a) into n;
    perform pg_temp.comprobar(n = 0, 'B puede BORRAR la fila de A en ' || tablas[i]);
    -- Sin filtro tampoco se lleva nada de A por delante. (Un UPDATE/DELETE sin WHERE
    -- ni RETURNING no lee columnas, así que NO pasa por la política de SELECT: solo
    -- lo paran las políticas de UPDATE y DELETE.)
    execute format('update public.%I set updated_at = now() + interval ''1 day''', tablas[i]);
    execute format('select count(*) from public.%I', tablas[i]) into propias;
    begin
      execute format('delete from public.%I', tablas[i]);
      get diagnostics n = row_count;
      raise exception 'deshacer' using errcode = 'P0999'; -- B conserva sus filas
    exception when sqlstate 'P0999' then
      null;
    end;
    perform pg_temp.comprobar(n = propias, format('un DELETE sin filtro de B borra %s filas de %s y solo %s son suyas', n, tablas[i], propias));

    -- A sigue viendo lo suyo, intacto, y nada de B
    perform pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
    execute format('select count(*) from public.%I where id = %L and updated_at <= now()', tablas[i], id_a) into n;
    perform pg_temp.comprobar(n = 1, 'la fila de A ha cambiado o ha desaparecido en ' || tablas[i]);
    execute format('select count(*) from public.%I where user_id <> %L', tablas[i], 'aaaaaaaa-0000-4000-8000-000000000001') into n;
    perform pg_temp.comprobar(n = 0, 'A puede LEER filas de B en ' || tablas[i]);
  end loop;
end;
$$;

-- @caso: mi panel: no se pueden crear filas a nombre de otro ni pisarlas con upsert
reset role;
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
-- Con el user_id de A
select pg_temp.debe_fallar($q$insert into public.habitos (user_id, nombre)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'x')$q$, array['42501'], 'B crea un hábito a nombre de A');
select pg_temp.debe_fallar($q$insert into public.habito_marcas (user_id, habito_id, fecha)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000d01', '2026-01-01')$q$,
  array['42501'], 'B crea una marca a nombre de A en el hábito de A');
select pg_temp.debe_fallar($q$insert into public.tareas (user_id, texto)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'x')$q$, array['42501'], 'B crea una tarea a nombre de A');
select pg_temp.debe_fallar($q$insert into public.movimientos (user_id, tipo, concepto, importe_centimos, fecha)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'gasto', 'x', 1, '2026-01-01')$q$, array['42501'], 'B crea un movimiento a nombre de A');
select pg_temp.debe_fallar($q$insert into public.clientes_web (user_id, nombre)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'x')$q$, array['42501'], 'B crea un cliente a nombre de A');
-- La cola de cambios sube con upsert por id: con el id de una fila de A no debe pisarla
select pg_temp.debe_fallar($q$insert into public.habitos (id, nombre)
  values ('a0000000-0000-4000-8000-000000000d01', 'robado')
  on conflict (id) do update set nombre = excluded.nombre$q$, array['42501'], 'B pisa con upsert el hábito de A');
select pg_temp.debe_fallar($q$insert into public.habito_marcas (id, habito_id, fecha)
  values ('a0000000-0000-4000-8000-000000000d02', 'b0000000-0000-4000-8000-000000000d01', '2026-01-02')
  on conflict (id) do update set hecho = false$q$, array['42501'], 'B pisa con upsert la marca de A');
select pg_temp.debe_fallar($q$insert into public.tareas (id, texto)
  values ('a0000000-0000-4000-8000-000000000d03', 'robada')
  on conflict (id) do update set texto = excluded.texto$q$, array['42501'], 'B pisa con upsert la tarea de A');
select pg_temp.debe_fallar($q$insert into public.movimientos (id, tipo, concepto, importe_centimos, fecha)
  values ('a0000000-0000-4000-8000-000000000d04', 'gasto', 'robado', 1, '2026-01-01')
  on conflict (id) do update set importe_centimos = excluded.importe_centimos$q$, array['42501'], 'B pisa con upsert el movimiento de A');
select pg_temp.debe_fallar($q$insert into public.clientes_web (id, nombre)
  values ('a0000000-0000-4000-8000-000000000d05', 'robado')
  on conflict (id) do update set nombre = excluded.nombre$q$, array['42501'], 'B pisa con upsert el cliente de A');
reset role;
select pg_temp.comprobar((select nombre from public.habitos where id = 'a0000000-0000-4000-8000-000000000d01') = 'Gimnasio de A', 'el hábito de A ha cambiado');
select pg_temp.comprobar((select hecho from public.habito_marcas where id = 'a0000000-0000-4000-8000-000000000d02'), 'la marca de A ha cambiado');
select pg_temp.comprobar((select importe_centimos from public.movimientos where id = 'a0000000-0000-4000-8000-000000000d04') = 125, 'el movimiento de A ha cambiado');
select pg_temp.comprobar((select count(*) from public.habitos where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and nombre = 'x') = 0, 'hay hábitos de A creados por B');

-- @caso: habito_marcas: no se puede marcar ni mover una marca a un hábito ajeno
reset role;
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.debe_fallar($q$insert into public.habito_marcas (habito_id, fecha)
  values ('a0000000-0000-4000-8000-000000000d01', '2026-01-03')$q$, array['23503'], 'B marca el hábito de A');
select pg_temp.debe_fallar($q$update public.habito_marcas set habito_id = 'a0000000-0000-4000-8000-000000000d01', fecha = '2026-01-04'
  where id = 'b0000000-0000-4000-8000-000000000d02'$q$, array['23503'], 'B mueve su marca al hábito de A');
-- En un día que A ya tiene marcado salta antes el unique (habito_id, fecha); lo importante es que falle
select pg_temp.debe_fallar($q$update public.habito_marcas set habito_id = 'a0000000-0000-4000-8000-000000000d01'
  where id = 'b0000000-0000-4000-8000-000000000d02'$q$, array['23503', '23505'], 'B mueve su marca al hábito de A (mismo día)');
-- Un hábito que no existe tampoco vale
select pg_temp.debe_fallar($q$insert into public.habito_marcas (habito_id, fecha)
  values ('cccccccc-0000-4000-8000-00000000dead', '2026-01-03')$q$, array['23503'], 'B marca un hábito que no existe');
reset role;
select pg_temp.comprobar((select count(*) from public.habito_marcas where habito_id = 'a0000000-0000-4000-8000-000000000d01') = 1,
  'el hábito de A tiene marcas ajenas');

-- @caso: habito_marcas: una marca por hábito y día, upsert por id y desmarcar sin borrar
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.habitos (id, nombre) values ('a0000000-0000-4000-8000-000000000d11', 'Leer');
-- Cambio de hora (29/03 y 25/10), fin de mes y de año, 29 de febrero: son días normales
insert into public.habito_marcas (id, habito_id, fecha) values
  ('a0000000-0000-4000-8000-000000000d12', 'a0000000-0000-4000-8000-000000000d11', '2026-03-29'),
  (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000d11', '2026-10-25'),
  (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000d11', '2026-12-31'),
  (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000d11', '2027-01-01'),
  (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000d11', '2028-02-29');
select pg_temp.comprobar((select count(*) from public.habito_marcas where habito_id = 'a0000000-0000-4000-8000-000000000d11') = 5,
  'no se guardan las 5 marcas');
select pg_temp.comprobar((select bool_and(hecho) from public.habito_marcas where habito_id = 'a0000000-0000-4000-8000-000000000d11'),
  'hecho no es true por defecto');
-- El mismo día en otro hábito del mismo usuario sí vale (la marca d02 del preámbulo es del 29/03)
select pg_temp.comprobar((select count(*) from public.habito_marcas where fecha = '2026-03-29') = 2, 'el mismo día no vale en dos hábitos');
-- Otra fila (otro id) para el mismo hábito y día: no
select pg_temp.debe_fallar($q$insert into public.habito_marcas (habito_id, fecha)
  values ('a0000000-0000-4000-8000-000000000d11', '2026-03-29')$q$, array['23505'], 'dos marcas del mismo hábito el mismo día');
select pg_temp.debe_fallar($q$update public.habito_marcas set fecha = '2026-10-25'
  where id = 'a0000000-0000-4000-8000-000000000d12'$q$, array['23505'], 'mover una marca a un día ya marcado');
select pg_temp.debe_fallar($q$insert into public.habito_marcas (habito_id, fecha)
  values ('a0000000-0000-4000-8000-000000000d11', '2026-02-30')$q$, array['22008'], 'se acepta el 30 de febrero');
select pg_temp.debe_fallar($q$insert into public.habito_marcas (habito_id, fecha)
  values ('a0000000-0000-4000-8000-000000000d11', null)$q$, array['23502'], 'se acepta una marca sin fecha');
-- Segundo dispositivo: mismo id determinista, upsert → misma fila. Desmarcar = hecho false
insert into public.habito_marcas (id, habito_id, fecha, hecho, updated_at)
  values ('a0000000-0000-4000-8000-000000000d12', 'a0000000-0000-4000-8000-000000000d11', '2026-03-29', false, now() + interval '1 minute')
  on conflict (id) do update set hecho = excluded.hecho, updated_at = excluded.updated_at;
select pg_temp.comprobar((select count(*) from public.habito_marcas
  where habito_id = 'a0000000-0000-4000-8000-000000000d11' and fecha = '2026-03-29') = 1, 'el upsert por id ha duplicado la marca');
select pg_temp.comprobar(not (select hecho from public.habito_marcas where id = 'a0000000-0000-4000-8000-000000000d12'),
  'el upsert por id no ha desmarcado el día');
-- Un upsert con un updated_at más antiguo (dispositivo atrasado) no pisa al nuevo
insert into public.habito_marcas (id, habito_id, fecha, hecho, updated_at)
  values ('a0000000-0000-4000-8000-000000000d12', 'a0000000-0000-4000-8000-000000000d11', '2026-03-29', true, now() - interval '1 hour')
  on conflict (id) do update set hecho = excluded.hecho, updated_at = excluded.updated_at;
select pg_temp.comprobar(not (select hecho from public.habito_marcas where id = 'a0000000-0000-4000-8000-000000000d12'),
  'un upsert antiguo ha pisado a la marca más reciente');
-- Limpieza (por si se ejecuta el archivo entero)
delete from public.habitos where id = 'a0000000-0000-4000-8000-000000000d11';
select pg_temp.comprobar((select count(*) from public.habito_marcas where habito_id = 'a0000000-0000-4000-8000-000000000d11') = 0,
  'borrar el hábito no borra sus marcas');

-- @caso: movimientos: importes en céntimos enteros y positivos, tipo y concepto válidos
reset role;
select pg_temp.comprobar((
  select count(*) from information_schema.columns
  where table_schema = 'public' and data_type = 'bigint'
    and (table_name, column_name) in (('movimientos', 'importe_centimos'), ('clientes_web', 'precio_centimos'), ('perfiles', 'meta_ahorro_centimos'))
) = 3, 'algún importe no es un entero (bigint) de céntimos');
select pg_temp.comprobar(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name in ('habitos', 'habito_marcas', 'tareas', 'movimientos', 'clientes_web')
    and data_type in ('real', 'double precision', 'numeric', 'money')
), 'hay columnas con decimales en las tablas de Mi Panel');
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
-- Tal y como llega por la API (JSON): 12,5 céntimos no es un importe
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha)
  select tipo, concepto, importe_centimos, fecha from json_populate_record(null::public.movimientos,
    '{"tipo":"gasto","concepto":"x","importe_centimos":12.5,"fecha":"2026-01-01"}')$q$,
  array['22P02'], 'se acepta un importe con decimales');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha)
  values ('gasto', 'x', '12.50', '2026-01-01')$q$, array['22P02'], 'se acepta un importe en euros con decimales');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha)
  values ('gasto', 'x', 0, '2026-01-01')$q$, array['23514'], 'se acepta un importe 0');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha)
  values ('gasto', 'x', -1, '2026-01-01')$q$, array['23514'], 'se acepta un importe negativo');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha)
  values ('gasto', 'x', 100000000000, '2026-01-01')$q$, array['23514'], 'se acepta un importe por encima del máximo');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha)
  values ('gasto', 'x', null, '2026-01-01')$q$, array['23502'], 'se acepta un movimiento sin importe');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha)
  values ('transferencia', 'x', 1, '2026-01-01')$q$, array['23514'], 'se acepta un tipo que no es ingreso/gasto');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha)
  values ('gasto', '', 1, '2026-01-01')$q$, array['23514'], 'se acepta un concepto vacío');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha)
  values ('gasto', repeat('x', 121), 1, '2026-01-01')$q$, array['23514'], 'se acepta un concepto de 121 caracteres');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos)
  values ('gasto', 'x', 1)$q$, array['23502'], 'se acepta un movimiento sin fecha');
-- Los límites exactos sí valen: 1 céntimo, el máximo, 120 caracteres, 0,1 + 0,2 € = 30 céntimos
insert into public.movimientos (id, tipo, concepto, importe_centimos, fecha) values
  ('a0000000-0000-4000-8000-000000000d21', 'ingreso', 'mínimo', 1, '2026-12-31'),
  ('a0000000-0000-4000-8000-000000000d22', 'ingreso', repeat('ñ', 120), 99999999999, '2027-01-01'),
  ('a0000000-0000-4000-8000-000000000d23', 'gasto', 'diez', 10, '2026-12-31'),
  ('a0000000-0000-4000-8000-000000000d24', 'gasto', 'veinte', 20, '2026-12-31');
select pg_temp.comprobar((select sum(importe_centimos) from public.movimientos
  where id in ('a0000000-0000-4000-8000-000000000d23', 'a0000000-0000-4000-8000-000000000d24')) = 30, '10 + 20 céntimos no suman 30');
select pg_temp.comprobar((select importe_centimos from public.movimientos where id = 'a0000000-0000-4000-8000-000000000d22') = 99999999999,
  'el importe máximo no se guarda exacto');
select pg_temp.debe_fallar($q$update public.movimientos set importe_centimos = 0
  where id = 'a0000000-0000-4000-8000-000000000d21'$q$, array['23514'], 'un UPDATE deja el importe a 0');
delete from public.movimientos where id in ('a0000000-0000-4000-8000-000000000d21', 'a0000000-0000-4000-8000-000000000d22',
  'a0000000-0000-4000-8000-000000000d23', 'a0000000-0000-4000-8000-000000000d24');

-- @caso: clientes_web: estados válidos, precio en céntimos no negativo y valores por defecto
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.clientes_web (id, nombre) values ('a0000000-0000-4000-8000-000000000d31', 'Por defecto');
select pg_temp.comprobar((select estado = 'contacto' and precio_centimos = 0 and notas = '' and orden = 0
  from public.clientes_web where id = 'a0000000-0000-4000-8000-000000000d31'), 'valores por defecto de clientes_web incorrectos');
-- Los 4 estados del tablero, de uno en uno
update public.clientes_web set estado = 'propuesta' where id = 'a0000000-0000-4000-8000-000000000d31';
update public.clientes_web set estado = 'en_curso' where id = 'a0000000-0000-4000-8000-000000000d31';
update public.clientes_web set estado = 'entregado' where id = 'a0000000-0000-4000-8000-000000000d31';
update public.clientes_web set estado = 'contacto' where id = 'a0000000-0000-4000-8000-000000000d31';
select pg_temp.debe_fallar($q$update public.clientes_web set estado = 'cobrado' where id = 'a0000000-0000-4000-8000-000000000d31'$q$,
  array['23514'], 'se acepta un estado que no existe (update)');
select pg_temp.debe_fallar($q$insert into public.clientes_web (nombre, estado) values ('x', 'En curso')$q$,
  array['23514'], 'se acepta un estado mal escrito');
select pg_temp.debe_fallar($q$insert into public.clientes_web (nombre, estado) values ('x', '')$q$,
  array['23514'], 'se acepta un estado vacío');
select pg_temp.debe_fallar($q$insert into public.clientes_web (nombre, estado) values ('x', null)$q$,
  array['23502'], 'se acepta un estado nulo');
select pg_temp.debe_fallar($q$insert into public.clientes_web (nombre, precio_centimos) values ('x', -1)$q$,
  array['23514'], 'se acepta un precio negativo');
select pg_temp.debe_fallar($q$insert into public.clientes_web (nombre, precio_centimos) values ('x', 100000000000)$q$,
  array['23514'], 'se acepta un precio por encima del máximo');
select pg_temp.debe_fallar($q$insert into public.clientes_web (nombre, precio_centimos) values ('x', '499.99')$q$,
  array['22P02'], 'se acepta un precio en euros con decimales');
select pg_temp.debe_fallar($q$insert into public.clientes_web (nombre) values ('')$q$,
  array['23514'], 'se acepta un cliente sin nombre');
select pg_temp.debe_fallar($q$insert into public.clientes_web (nombre) values (repeat('x', 121))$q$,
  array['23514'], 'se acepta un nombre de 121 caracteres');
select pg_temp.debe_fallar($q$insert into public.clientes_web (nombre, notas) values ('x', repeat('x', 2001))$q$,
  array['23514'], 'se aceptan notas de 2001 caracteres');
update public.clientes_web set precio_centimos = 99999999999, notas = repeat('x', 2000), nombre = repeat('x', 120)
  where id = 'a0000000-0000-4000-8000-000000000d31';
delete from public.clientes_web where id = 'a0000000-0000-4000-8000-000000000d31';

-- @caso: habitos y tareas: longitudes y valores por defecto
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
select pg_temp.debe_fallar($q$insert into public.habitos (nombre) values ('')$q$, array['23514'], 'se acepta un hábito sin nombre');
select pg_temp.debe_fallar($q$insert into public.habitos (nombre) values (repeat('x', 61))$q$, array['23514'], 'se acepta un hábito de 61 caracteres');
select pg_temp.debe_fallar($q$insert into public.habitos (nombre) values (null)$q$, array['23502'], 'se acepta un hábito con nombre nulo');
select pg_temp.debe_fallar($q$insert into public.tareas (texto) values ('')$q$, array['23514'], 'se acepta una tarea vacía');
select pg_temp.debe_fallar($q$insert into public.tareas (texto) values (repeat('x', 201))$q$, array['23514'], 'se acepta una tarea de 201 caracteres');
insert into public.habitos (id, nombre) values ('a0000000-0000-4000-8000-000000000d41', repeat('ñ', 60));
insert into public.tareas (id, texto) values ('a0000000-0000-4000-8000-000000000d42', repeat('ñ', 200));
select pg_temp.comprobar((select not archivado and orden = 0 and user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
  from public.habitos where id = 'a0000000-0000-4000-8000-000000000d41'), 'valores por defecto de habitos incorrectos');
select pg_temp.comprobar((select not hecha and hecha_en is null and fecha_limite is null and user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
  from public.tareas where id = 'a0000000-0000-4000-8000-000000000d42'), 'valores por defecto de tareas incorrectos');
-- Dos hábitos con el mismo nombre sí valen (no hay unicidad por nombre)
insert into public.habitos (id, nombre) values ('a0000000-0000-4000-8000-000000000d43', repeat('ñ', 60));
delete from public.habitos where id in ('a0000000-0000-4000-8000-000000000d41', 'a0000000-0000-4000-8000-000000000d43');
delete from public.tareas where id = 'a0000000-0000-4000-8000-000000000d42';

-- @caso: perfiles y modulos: columnas nuevas de la fase 2 (meta de ahorro, semanas, límite de faltas)
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
select pg_temp.comprobar((select semanas_curso = 30 and meta_ahorro_centimos is null and not mi_panel_inicializado
  from public.perfiles), 'valores por defecto de las columnas nuevas de perfiles incorrectos');
select pg_temp.comprobar((select con_examenes and limite_faltas is null
  from public.modulos where id = 'a0000000-0000-4000-8000-0000000000a1'), 'valores por defecto de las columnas nuevas de modulos incorrectos');
select pg_temp.debe_fallar($q$update public.perfiles set semanas_curso = 0$q$, array['23514'], 'se aceptan 0 semanas de curso');
select pg_temp.debe_fallar($q$update public.perfiles set semanas_curso = 53$q$, array['23514'], 'se aceptan 53 semanas de curso');
select pg_temp.debe_fallar($q$update public.perfiles set meta_ahorro_centimos = -1$q$, array['23514'], 'se acepta una meta de ahorro negativa');
select pg_temp.debe_fallar($q$update public.perfiles set meta_ahorro_centimos = 100000000000$q$, array['23514'], 'se acepta una meta de ahorro por encima del máximo');
select pg_temp.debe_fallar($q$update public.modulos set limite_faltas = 100.01 where id = 'a0000000-0000-4000-8000-0000000000a1'$q$,
  array['23514'], 'se acepta un límite de faltas mayor que 100');
select pg_temp.debe_fallar($q$update public.modulos set limite_faltas = -0.01 where id = 'a0000000-0000-4000-8000-0000000000a1'$q$,
  array['23514'], 'se acepta un límite de faltas negativo');
-- Los límites exactos sí valen
do $$
begin
  update public.perfiles set semanas_curso = 1, meta_ahorro_centimos = 0;
  update public.perfiles set semanas_curso = 52, meta_ahorro_centimos = 99999999999;
  update public.modulos set limite_faltas = 0 where id = 'a0000000-0000-4000-8000-0000000000a1';
  update public.modulos set limite_faltas = 100 where id = 'a0000000-0000-4000-8000-0000000000a1';
  update public.modulos set limite_faltas = 12.5 where id = 'a0000000-0000-4000-8000-0000000000a1';
  perform pg_temp.comprobar((select limite_faltas from public.modulos where id = 'a0000000-0000-4000-8000-0000000000a1') = 12.5,
    'el límite de faltas del módulo no guarda decimales');
  -- Se deja como estaba
  update public.perfiles set semanas_curso = 30, meta_ahorro_centimos = null;
  update public.modulos set limite_faltas = null where id = 'a0000000-0000-4000-8000-0000000000a1';
end;
$$;
-- @caso: perfiles: la meta de ahorro de Mi Panel sube con upsert de solo esa columna
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
update public.perfiles set nombre = 'Nombre de A', tema = 'oscuro', preferencias = '{"x": 1}'::jsonb;
-- Así sube Mi Panel la meta: id, sellos y la columna, nada más
insert into public.perfiles (id, updated_at, meta_ahorro_centimos)
  values ('aaaaaaaa-0000-4000-8000-000000000001', now() + interval '1 minute', 150000)
  on conflict (id) do update set updated_at = excluded.updated_at, meta_ahorro_centimos = excluded.meta_ahorro_centimos;
select pg_temp.comprobar((select meta_ahorro_centimos = 150000 and nombre = 'Nombre de A' and tema = 'oscuro'
  and preferencias = '{"x": 1}'::jsonb from public.perfiles), 'subir la meta ha cambiado otras columnas del perfil');
-- B no puede pisar con upsert la meta (ni nada) del perfil de A
reset role;
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.debe_fallar($q$insert into public.perfiles (id, meta_ahorro_centimos)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 1)
  on conflict (id) do update set meta_ahorro_centimos = excluded.meta_ahorro_centimos$q$, array['42501', '23514'], 'B pisa con upsert la meta de A');
reset role;
select pg_temp.comprobar((select meta_ahorro_centimos = 150000 from public.perfiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'la meta de A ha cambiado');
update public.perfiles set meta_ahorro_centimos = null, nombre = '', tema = 'auto', preferencias = '{}'::jsonb
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- Un perfil nuevo sigue al sistema (tema 'auto')
reset role;
select pg_temp.comprobar((select column_default from information_schema.columns
  where table_schema = 'public' and table_name = 'perfiles' and column_name = 'tema') like '%auto%', 'el tema por defecto no es auto');

-- @caso: mi panel: updated_at, sync_at y user_id los controla el trigger antes_de_guardar
reset role;
do $$
declare
  t text;
  f uuid;
  r record;
  sync_antes timestamptz;
begin
  perform pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
  foreach t in array array['habitos', 'habito_marcas', 'tareas', 'movimientos', 'clientes_web'] loop
    f := gen_random_uuid();
    -- El dispositivo creó la fila sin conexión hace tiempo e intenta colar su sync_at
    perform pg_temp.insertar(t, f, 'a0000000-0000-4000-8000-000000000d01',
      ', updated_at, sync_at', ', ''2020-01-01 10:00+00'', ''2000-01-01 00:00+00''');
    execute format('select user_id, created_at, updated_at, sync_at from public.%I where id = %L', t, f) into r;
    perform pg_temp.comprobar(r.user_id = 'aaaaaaaa-0000-4000-8000-000000000001', t || ': user_id no se rellena con auth.uid()');
    perform pg_temp.comprobar(r.updated_at = '2020-01-01 10:00+00', t || ': el INSERT no respeta el updated_at del dispositivo');
    perform pg_temp.comprobar(r.sync_at >= now(), t || ': el INSERT deja que el cliente fije sync_at');
    sync_antes := r.sync_at;

    -- UPDATE sin updated_at: se pone la hora del servidor; user_id y created_at no cambian
    execute format('update public.%I set user_id = %L, created_at = ''1999-01-01'' where id = %L',
      t, 'bbbbbbbb-0000-4000-8000-000000000002', f);
    execute format('select user_id, created_at, updated_at, sync_at from public.%I where id = %L', t, f) into r;
    perform pg_temp.comprobar(r.user_id = 'aaaaaaaa-0000-4000-8000-000000000001', t || ': un UPDATE ha cambiado user_id');
    perform pg_temp.comprobar(r.created_at = now(), t || ': un UPDATE ha cambiado created_at');
    perform pg_temp.comprobar(r.updated_at = now(), t || ': un UPDATE no actualiza updated_at');
    -- (>= y no >: el reloj de PGlite puede dar el mismo instante en dos sentencias seguidas)
    perform pg_temp.comprobar(r.sync_at >= sync_antes and r.sync_at >= now(), t || ': un UPDATE retrasa sync_at');
    sync_antes := r.sync_at;

    -- Versión antigua (otro dispositivo atrasado): no se aplica y no se vuelve a anunciar
    execute format('update public.%I set updated_at = ''2019-01-01'' where id = %L', t, f);
    execute format('select updated_at, sync_at from public.%I where id = %L', t, f) into r;
    perform pg_temp.comprobar(r.updated_at = now(), t || ': una versión antigua ha pisado a la nueva');
    perform pg_temp.comprobar(r.sync_at = sync_antes, t || ': una versión antigua descartada cambia sync_at');

    -- Versión más nueva: gana y avanza sync_at
    execute format('update public.%I set updated_at = now() + interval ''1 hour'', sync_at = ''2000-01-01'' where id = %L', t, f);
    execute format('select updated_at, sync_at from public.%I where id = %L', t, f) into r;
    perform pg_temp.comprobar(r.updated_at = now() + interval '1 hour', t || ': una versión más nueva no se aplica');
    perform pg_temp.comprobar(r.sync_at >= sync_antes, t || ': el cliente puede fijar sync_at en un UPDATE');

    execute format('delete from public.%I where id = %L', t, f);
  end loop;
  -- B no ha recibido nada
  perform pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
  perform pg_temp.comprobar((select count(*) from public.habitos) = 1 and (select count(*) from public.tareas) = 1
    and (select count(*) from public.movimientos) = 1 and (select count(*) from public.clientes_web) = 1
    and (select count(*) from public.habito_marcas) = 1, 'B ha recibido filas que A intentó pasarle');
end;
$$;

-- @caso: mi panel: los borrados quedan apuntados en `borrados` (también en cascada) y solo los ve su dueño
reset role;
do $$
declare
  t text;
  f uuid;
  h uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid();
  antes bigint;
begin
  perform pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
  foreach t in array array['habitos', 'habito_marcas', 'tareas', 'movimientos', 'clientes_web'] loop
    f := gen_random_uuid();
    perform pg_temp.insertar(t, f, 'a0000000-0000-4000-8000-000000000d01');
    perform pg_temp.comprobar((select count(*) from public.borrados where fila_id = f) = 0, t || ': crear una fila apunta un borrado');
    execute format('delete from public.%I where id = %L', t, f);
    perform pg_temp.comprobar((select count(*) from public.borrados
      where fila_id = f and tabla = t and user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and sync_at >= now()) = 1,
      t || ': el borrado no queda apuntado (una vez) en borrados');
  end loop;

  -- Borrar un hábito se lleva sus marcas, y las tres filas quedan apuntadas
  perform pg_temp.insertar('habitos', h);
  perform pg_temp.insertar('habito_marcas', m1, h);
  perform pg_temp.insertar('habito_marcas', m2, h);
  delete from public.habitos where id = h;
  perform pg_temp.comprobar((select count(*) from public.habito_marcas where id in (m1, m2)) = 0, 'borrar un hábito no borra sus marcas');
  perform pg_temp.comprobar((select count(*) from public.borrados where tabla = 'habitos' and fila_id = h) = 1
    and (select count(*) from public.borrados where tabla = 'habito_marcas' and fila_id in (m1, m2)) = 2,
    'el borrado en cascada hábito → marcas no queda apuntado');
  -- Desmarcar (hecho = false) no es un borrado
  select count(*) into antes from public.borrados;
  update public.habito_marcas set hecho = false where id = 'a0000000-0000-4000-8000-000000000d02';
  perform pg_temp.comprobar((select count(*) from public.borrados) = antes, 'desmarcar un día apunta un borrado');
  update public.habito_marcas set hecho = true where id = 'a0000000-0000-4000-8000-000000000d02';

  -- B no ve los borrados de A ni puede apuntar los suyos a mano
  perform pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
  perform pg_temp.comprobar((select count(*) from public.borrados) = 0, 'B ve los borrados de Mi Panel de A');
end;
$$;

-- @caso: inicializar_cuenta: en una cuenta nueva crea perfil, 3 hábitos y los 8 módulos de 2º SMR, una sola vez
reset role;
insert into public.emails_permitidos (email) values ('prueba-c@rls.test');
insert into auth.users (id, email) values ('cccccccc-0000-4000-8000-000000000003', 'prueba-c@rls.test');
select pg_temp.como('cccccccc-0000-4000-8000-000000000003');
select pg_temp.comprobar((select count(*) from public.perfiles) = 0, 'C ya tenía perfil');
select pg_temp.comprobar(public.inicializar_cuenta(), 'la primera llamada no devuelve true');
select pg_temp.comprobar((select count(*) from public.perfiles
  where id = 'cccccccc-0000-4000-8000-000000000003' and user_id = id and mi_panel_inicializado
    and tema = 'auto' and semanas_curso = 30 and meta_ahorro_centimos is null) = 1, 'no se crea bien el perfil de C');
select pg_temp.comprobar((select array_agg(nombre order by orden) from public.habitos)
  = array['Gimnasio', 'Leer 20 min', 'Dormir 8 h'], 'los hábitos iniciales no son Gimnasio, Leer 20 min y Dormir 8 h (en ese orden)');
select pg_temp.comprobar((select bool_and(not archivado and user_id = 'cccccccc-0000-4000-8000-000000000003') from public.habitos),
  'los hábitos iniciales están archivados o no son de C');
select pg_temp.comprobar((select array_agg(abreviatura order by orden) from public.modulos)
  = array['SOR', 'SI', 'SR', 'AO', 'CNV', 'IPE2', 'PI', 'FE'], 'los módulos iniciales no son los 8 de 2º SMR (en su orden)');
select pg_temp.comprobar((select array_agg(abreviatura) from public.modulos where not con_examenes) = array['FE'],
  'solo FE debe quedar sin exámenes');
select pg_temp.comprobar((select bool_and(user_id = 'cccccccc-0000-4000-8000-000000000003' and color ~ '^#[0-9a-f]{6}$'
  and length(nombre) > 0 and limite_faltas is null) from public.modulos), 'módulos iniciales con datos incorrectos');
select pg_temp.comprobar((select count(distinct color) from public.modulos) = 8, 'hay módulos iniciales con el mismo color');
select pg_temp.comprobar((select count(*) from public.habito_marcas) = 0 and (select count(*) from public.tareas) = 0
  and (select count(*) from public.movimientos) = 0 and (select count(*) from public.clientes_web) = 0,
  'inicializar_cuenta crea datos que no debe');
-- Idempotente: las siguientes llamadas no hacen nada
select pg_temp.comprobar(not public.inicializar_cuenta(), 'la segunda llamada no devuelve false');
select pg_temp.comprobar(not public.inicializar_cuenta(), 'la tercera llamada no devuelve false');
select pg_temp.comprobar((select count(*) from public.habitos) = 3 and (select count(*) from public.modulos) = 8
  and (select count(*) from public.perfiles) = 1, 'llamar otra vez a inicializar_cuenta duplica datos');
-- Si el usuario borra un hábito o un módulo iniciales, no vuelven
delete from public.habitos where nombre = 'Gimnasio';
delete from public.modulos where abreviatura = 'CNV';
select pg_temp.comprobar(not public.inicializar_cuenta(), 'tras borrar datos iniciales, la llamada no devuelve false');
select pg_temp.comprobar((select count(*) from public.habitos) = 2 and (select count(*) from public.modulos) = 7,
  'inicializar_cuenta resucita datos iniciales borrados');
-- No ha tocado a nadie más
reset role;
select pg_temp.comprobar((select count(*) from public.habitos
  where nombre in ('Gimnasio', 'Leer 20 min', 'Dormir 8 h') and user_id <> 'cccccccc-0000-4000-8000-000000000003') = 0,
  'inicializar_cuenta ha creado hábitos a otros usuarios');
select pg_temp.comprobar((select count(*) from public.modulos where user_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 1
  and not (select mi_panel_inicializado from public.perfiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'inicializar_cuenta de C ha tocado datos de A o B');

-- @caso: inicializar_cuenta: una cuenta que ya tenía módulos (app vieja) recibe los hábitos pero no módulos nuevos
reset role;
insert into public.emails_permitidos (email) values ('prueba-d@rls.test');
insert into auth.users (id, email) values ('dddddddd-0000-4000-8000-000000000004', 'prueba-d@rls.test');
select pg_temp.como('dddddddd-0000-4000-8000-000000000004');
insert into public.perfiles (nombre, tema, limite_faltas) values ('D', 'oscuro', 20);
insert into public.modulos (nombre, abreviatura) values ('Mi SOR de siempre', 'SOR');
select pg_temp.comprobar(public.inicializar_cuenta(), 'la primera llamada no devuelve true');
select pg_temp.comprobar((select count(*) from public.habitos) = 3, 'una cuenta antigua no recibe los 3 hábitos');
select pg_temp.comprobar((select count(*) from public.modulos) = 1 and (select nombre from public.modulos) = 'Mi SOR de siempre',
  'una cuenta antigua recibe módulos duplicados');
select pg_temp.comprobar((select nombre = 'D' and tema = 'oscuro' and limite_faltas = 20 and mi_panel_inicializado from public.perfiles),
  'inicializar_cuenta pisa el perfil que ya existía');
select pg_temp.comprobar(not public.inicializar_cuenta(), 'la segunda llamada no devuelve false');
select pg_temp.comprobar((select count(*) from public.habitos) = 3 and (select count(*) from public.modulos) = 1,
  'la segunda llamada duplica datos');

-- @caso: inicializar_cuenta: sin sesión no se puede ejecutar
reset role;
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select public.inicializar_cuenta()$q$, array['42501'], 'anon ejecuta inicializar_cuenta');
-- Con rol authenticated pero sin usuario en el JWT
reset role;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select pg_temp.debe_fallar($q$select public.inicializar_cuenta()$q$, array['42501'], 'se inicializa una cuenta sin usuario');
reset role;
select pg_temp.comprobar(not has_function_privilege('anon', 'public.inicializar_cuenta()', 'execute')
  and not has_function_privilege('public', 'public.inicializar_cuenta()', 'execute')
  and has_function_privilege('authenticated', 'public.inicializar_cuenta()', 'execute'),
  'permisos de inicializar_cuenta incorrectos');
select pg_temp.comprobar((select not prosecdef from pg_proc where oid = 'public.inicializar_cuenta()'::regprocedure),
  'inicializar_cuenta no debe ser SECURITY DEFINER');

-- -----------------------------------------------------------------------------
-- Casos destructivos: van al final
-- -----------------------------------------------------------------------------

-- @caso: movimientos: la categoría es opcional, solo en gastos y de la lista
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.movimientos (id, tipo, concepto, importe_centimos, fecha, categoria) values
  ('a0000000-0000-4000-8000-000000000e21', 'gasto', 'super', 100, '2026-11-01', 'comida'),
  ('a0000000-0000-4000-8000-000000000e22', 'gasto', 'sin', 100, '2026-11-01', null),
  ('a0000000-0000-4000-8000-000000000e23', 'ingreso', 'paga', 100, '2026-11-01', null);
select pg_temp.comprobar((select categoria from public.movimientos where id = 'a0000000-0000-4000-8000-000000000e21') = 'comida',
  'no se guarda la categoría');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha, categoria)
  values ('ingreso', 'x', 1, '2026-11-01', 'comida')$q$, array['23514'], 'un ingreso con categoría');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha, categoria)
  values ('gasto', 'x', 1, '2026-11-01', 'Comida')$q$, array['23514'], 'una categoría fuera de la lista');
select pg_temp.debe_fallar($q$update public.movimientos set tipo = 'ingreso'
  where id = 'a0000000-0000-4000-8000-000000000e21'$q$, array['23514'], 'pasar a ingreso un gasto con categoría sin quitarla');
-- Una app vieja que sube sin la columna (upsert parcial) no borra la categoría
insert into public.movimientos (id, tipo, concepto, importe_centimos, fecha, updated_at)
  values ('a0000000-0000-4000-8000-000000000e21', 'gasto', 'super 2', 100, '2026-11-01', now() + interval '1 hour')
  on conflict (id) do update set concepto = excluded.concepto, updated_at = excluded.updated_at;
select pg_temp.comprobar((select categoria from public.movimientos where id = 'a0000000-0000-4000-8000-000000000e21') = 'comida',
  'un upsert sin la columna categoria la ha borrado');

-- @caso: movimientos: un movimiento borrado no se vuelve a crear con el mismo id (y los demás sí se crean)
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.movimientos (id, tipo, concepto, importe_centimos, fecha)
  values ('a0000000-0000-4000-8000-000000000e31', 'gasto', 'Gimnasio', 3000, '2026-11-01');
delete from public.movimientos where id = 'a0000000-0000-4000-8000-000000000e31';
-- Un dispositivo sin conexión lo sube otra vez (upsert, como la app)
insert into public.movimientos (id, tipo, concepto, importe_centimos, fecha)
  values ('a0000000-0000-4000-8000-000000000e31', 'gasto', 'Gimnasio', 3000, '2026-11-01')
  on conflict (id) do update set concepto = excluded.concepto;
select pg_temp.comprobar(not exists (select 1 from public.movimientos where id = 'a0000000-0000-4000-8000-000000000e31'),
  'un movimiento borrado ha vuelto a aparecer');
-- El borrado de A no impide a B usar su propio id (no comparten nada)
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
insert into public.movimientos (id, tipo, concepto, importe_centimos, fecha)
  values ('b0000000-0000-4000-8000-000000000e31', 'gasto', 'Gimnasio B', 3000, '2026-11-01');
select pg_temp.comprobar(exists (select 1 from public.movimientos where id = 'b0000000-0000-4000-8000-000000000e31'),
  'no se puede crear un movimiento nuevo');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select public.no_revivir_borrado()$q$, array['42501', '0A000'], 'anon ejecuta no_revivir_borrado');

-- @caso: movimientos_fijos: B no ve, edita ni borra los de A, y no se pueden crear a nombre de otro
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.movimientos_fijos (id, tipo, concepto, importe_centimos, categoria, dia, desde)
  values ('a0000000-0000-4000-8000-000000000f31', 'gasto', 'Gimnasio', 3000, 'salud', 5, '2026-11');
select pg_temp.comprobar((select user_id from public.movimientos_fijos where id = 'a0000000-0000-4000-8000-000000000f31')
  = 'aaaaaaaa-0000-4000-8000-000000000001', 'user_id no se rellena con auth.uid() en movimientos_fijos');
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.comprobar((select count(*) from public.movimientos_fijos) = 0, 'B ve los fijos de A');
update public.movimientos_fijos set activo = false;
delete from public.movimientos_fijos;
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, desde, user_id)
  values ('gasto', 'x', 1, 1, '2026-11', 'aaaaaaaa-0000-4000-8000-000000000001')$q$, array['42501'], 'B crea un fijo a nombre de A');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (id, tipo, concepto, importe_centimos, dia, desde)
  values ('a0000000-0000-4000-8000-000000000f31', 'gasto', 'x', 1, 1, '2026-11')
  on conflict (id) do update set concepto = 'pisado'$q$, array['42501', '23505'], 'B pisa con upsert el fijo de A');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select count(*) from public.movimientos_fijos$q$, array['42501'], 'anon lee movimientos_fijos');
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
select pg_temp.comprobar((select concepto = 'Gimnasio' and activo from public.movimientos_fijos where id = 'a0000000-0000-4000-8000-000000000f31'),
  'B ha editado o borrado el fijo de A');
delete from public.movimientos_fijos where id = 'a0000000-0000-4000-8000-000000000f31';
select pg_temp.comprobar(exists (select 1 from public.borrados where fila_id = 'a0000000-0000-4000-8000-000000000f31' and tabla = 'movimientos_fijos'),
  'borrar un fijo no queda apuntado en borrados');

-- @caso: movimientos_fijos: día, meses AAAA-MM, importe y categoría válidos
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, desde)
  values ('gasto', 'x', 1, 0, '2026-11')$q$, array['23514'], 'un fijo el día 0');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, desde)
  values ('gasto', 'x', 1, 32, '2026-11')$q$, array['23514'], 'un fijo el día 32');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, desde)
  values ('gasto', 'x', 1, 1, '2026-13')$q$, array['23514', '23502'], 'un mes 13');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, desde, ultimo_mes)
  values ('gasto', 'x', 1, 1, '2026-11', '2026-11-01')$q$, array['23514'], 'ultimo_mes con día');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, desde)
  values ('gasto', 'x', 0, 1, '2026-11')$q$, array['23514'], 'un fijo de 0 €');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, desde, categoria)
  values ('ingreso', 'x', 1, 1, '2026-11', 'ocio')$q$, array['23514'], 'un ingreso fijo con categoría');
insert into public.movimientos_fijos (id, tipo, concepto, importe_centimos, dia, desde)
  values ('a0000000-0000-4000-8000-000000000f32', 'ingreso', 'Paga', 1000, 31, '2026-02');
select pg_temp.comprobar((select activo and ultimo_mes is null from public.movimientos_fijos where id = 'a0000000-0000-4000-8000-000000000f32'),
  'un fijo nuevo no nace activo y sin meses apuntados');

-- @caso: suscripciones_push: cada uno solo ve y toca las suyas, con claves bien formadas
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.suscripciones_push (id, endpoint, p256dh, auth)
  values ('a0000000-0000-4000-8000-000000000f41', 'https://fcm.googleapis.com/fcm/send/aaa',
          repeat('A', 87), repeat('B', 22));
select pg_temp.comprobar((select hora = 20 and ultimo_envio is null from public.suscripciones_push
  where id = 'a0000000-0000-4000-8000-000000000f41'), 'una suscripción nueva no nace a las 20 y sin envíos');
select pg_temp.debe_fallar($q$insert into public.suscripciones_push (endpoint, p256dh, auth)
  values ('http://inseguro.test/x', repeat('A', 87), repeat('B', 22))$q$, array['23514'], 'un endpoint sin https');
select pg_temp.debe_fallar($q$insert into public.suscripciones_push (endpoint, p256dh, auth)
  values ('https://fcm.googleapis.com/fcm/send/bbb', 'corta', repeat('B', 22))$q$, array['23514'], 'una clave p256dh mal formada');
select pg_temp.debe_fallar($q$insert into public.suscripciones_push (endpoint, p256dh, auth, hora)
  values ('https://fcm.googleapis.com/fcm/send/ccc', repeat('A', 87), repeat('B', 22), 24)$q$, array['23514'], 'la hora 24');
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.comprobar((select count(*) from public.suscripciones_push) = 0, 'B ve las suscripciones de A');
update public.suscripciones_push set hora = 3;
delete from public.suscripciones_push;
select pg_temp.debe_fallar($q$insert into public.suscripciones_push (endpoint, p256dh, auth, user_id)
  values ('https://fcm.googleapis.com/fcm/send/ddd', repeat('A', 87), repeat('B', 22), 'aaaaaaaa-0000-4000-8000-000000000001')$q$,
  array['42501'], 'B crea una suscripción a nombre de A');
-- El mismo navegador (endpoint) puede ser de B sin chocar con la de A
insert into public.suscripciones_push (endpoint, p256dh, auth)
  values ('https://fcm.googleapis.com/fcm/send/aaa', repeat('C', 87), repeat('D', 22));
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select count(*) from public.suscripciones_push$q$, array['42501'], 'anon lee suscripciones_push');
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
select pg_temp.comprobar((select hora = 20 and p256dh = repeat('A', 87) from public.suscripciones_push
  where id = 'a0000000-0000-4000-8000-000000000f41'), 'B ha cambiado o borrado la suscripción de A');

-- @caso: suscripciones_push: como mucho 10 dispositivos por usuario
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.suscripciones_push (endpoint, p256dh, auth)
  select 'https://fcm.googleapis.com/fcm/send/tope' || i, repeat('A', 87), repeat('B', 22) from generate_series(1, 10) i;
select pg_temp.debe_fallar($q$insert into public.suscripciones_push (endpoint, p256dh, auth)
  values ('https://fcm.googleapis.com/fcm/send/tope11', repeat('A', 87), repeat('B', 22))$q$, array['23514'], 'una suscripción número 11');
-- El tope es por usuario: B sí puede
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
insert into public.suscripciones_push (endpoint, p256dh, auth)
  values ('https://fcm.googleapis.com/fcm/send/tope-b', repeat('A', 87), repeat('B', 22));
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select public.tope_suscripciones_push()$q$, array['42501', '0A000'], 'anon ejecuta la función del tope');

-- @caso: secreto_cron_valido: solo la service role puede preguntarlo, y sin Vault siempre es falso
reset role;
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select public.secreto_cron_valido(repeat('x', 64))$q$, array['42501'], 'anon pregunta el secreto del cron');
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
select pg_temp.debe_fallar($q$select public.secreto_cron_valido(repeat('x', 64))$q$, array['42501'], 'un usuario pregunta el secreto del cron');
select pg_temp.como('service');
select pg_temp.comprobar(public.secreto_cron_valido(repeat('x', 64)) = false, 'un secreto cualquiera vale');
select pg_temp.comprobar(public.secreto_cron_valido(null) = false and public.secreto_cron_valido('') = false, 'un secreto vacío vale');

-- @caso: fase 8: B no ve, edita ni borra las filas de A en las tablas nuevas, y anon no las lee
reset role;
do $$
declare
  -- tabla → insert mínimo válido de A (se amplía con cada sección de la fase 8)
  inserts text[][] := array[
    array['ideas', $i$insert into public.ideas (id, texto) values ('a0000000-0000-4000-8000-000000000a81', 'Idea de A')$i$],
    array['cumpleanos', $i$insert into public.cumpleanos (nombre, dia, mes) values ('Cumple de A', 5, 3)$i$],
    array['planes', $i$insert into public.planes (titulo) values ('Plan de A')$i$],
    array['deseos', $i$insert into public.deseos (articulo, precio_centimos) values ('Deseo de A', 100)$i$],
    array['revisiones', $i$insert into public.revisiones (tipo, inicio, fin, datos) values ('semanal', '2026-11-09', '2026-11-15', '{"v": 1}')$i$]
  ];
  t text;
  filas bigint;
begin
  for k in 1..array_length(inserts, 1) loop
    t := inserts[k][1];
    perform pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
    execute inserts[k][2];
    execute format('select count(*) from public.%I where user_id = %L', t, 'aaaaaaaa-0000-4000-8000-000000000001') into filas;
    perform pg_temp.comprobar(filas = 1, 'user_id no se rellena con auth.uid() en ' || t);

    perform pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
    execute format('select count(*) from public.%I', t) into filas;
    perform pg_temp.comprobar(filas = 0, 'B ve filas de A en ' || t);
    execute format('update public.%I set updated_at = now() + interval %L', t, '1 day');
    execute format('delete from public.%I', t);
    begin
      execute format('insert into public.%I (user_id) values (%L)', t, 'aaaaaaaa-0000-4000-8000-000000000001');
      perform pg_temp.comprobar(false, 'B crea una fila a nombre de A en ' || t);
    exception when insufficient_privilege or not_null_violation or check_violation then
      update resultados set n = n + 1;
    end;

    perform pg_temp.como('anon');
    begin
      execute format('select count(*) from public.%I', t) into filas;
      perform pg_temp.comprobar(false, 'anon lee ' || t);
    exception when insufficient_privilege then
      update resultados set n = n + 1;
    end;

    perform pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
    execute format('select count(*) from public.%I where updated_at <= now()', t) into filas;
    perform pg_temp.comprobar(filas = 1, 'B ha cambiado o borrado la fila de A en ' || t);
  end loop;
end;
$$;

-- @caso: ideas: texto obligatorio de 1 a 500 caracteres y sin archivar al crearla
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
select pg_temp.debe_fallar($q$insert into public.ideas (texto) values ('')$q$, array['23514'], 'una idea vacía');
select pg_temp.debe_fallar($q$insert into public.ideas (texto) values (repeat('x', 501))$q$, array['23514'], 'una idea de 501 caracteres');
insert into public.ideas (id, texto) values ('a0000000-0000-4000-8000-000000000a82', repeat('ñ', 500));
select pg_temp.comprobar((select not archivada from public.ideas where id = 'a0000000-0000-4000-8000-000000000a82'), 'una idea nueva nace archivada');

-- @caso: cumpleanos: día que existe en su mes, 29 de febrero solo con año bisiesto (o sin año)
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.cumpleanos (nombre, dia, mes) values ('bisiesto sin año', 29, 2);
insert into public.cumpleanos (nombre, dia, mes, anio) values ('bisiesto 2004', 29, 2, 2004), ('2000 sí', 29, 2, 2000), ('fin de mes', 31, 12, 1999);
select pg_temp.debe_fallar($q$insert into public.cumpleanos (nombre, dia, mes, anio) values ('x', 29, 2, 2003)$q$, array['23514'], '29/2 de un año no bisiesto');
select pg_temp.debe_fallar($q$insert into public.cumpleanos (nombre, dia, mes, anio) values ('x', 29, 2, 1900)$q$, array['23514'], '29/2/1900 (no bisiesto)');
select pg_temp.debe_fallar($q$insert into public.cumpleanos (nombre, dia, mes) values ('x', 30, 2)$q$, array['23514'], 'el 30 de febrero');
select pg_temp.debe_fallar($q$insert into public.cumpleanos (nombre, dia, mes) values ('x', 31, 4)$q$, array['23514'], 'el 31 de abril');
select pg_temp.debe_fallar($q$insert into public.cumpleanos (nombre, dia, mes) values ('x', 0, 4)$q$, array['23514'], 'el día 0');
select pg_temp.debe_fallar($q$insert into public.cumpleanos (nombre, dia, mes) values ('x', 1, 13)$q$, array['23514'], 'el mes 13');
select pg_temp.debe_fallar($q$insert into public.cumpleanos (nombre, dia, mes, anio) values ('x', 1, 1, 1899)$q$, array['23514'], 'el año 1899');
select pg_temp.debe_fallar($q$insert into public.cumpleanos (nombre, dia, mes) values ('', 1, 1)$q$, array['23514'], 'sin nombre');

-- @caso: planes: tipos y estados válidos, «planeado» con fecha, valoración 1-5 solo si está hecho
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.planes (id, titulo) values ('a0000000-0000-4000-8000-000000000b01', 'Idea');
select pg_temp.comprobar((select estado = 'idea' and tipo = 'otro' and valoracion is null from public.planes
  where id = 'a0000000-0000-4000-8000-000000000b01'), 'un plan nuevo no nace como idea de tipo otro');
insert into public.planes (titulo, estado, fecha, coste_centimos) values ('Planeado', 'planeado', '2026-12-01', 0);
insert into public.planes (titulo, estado, valoracion, comentario) values ('Hecho', 'hecho', 5, 'genial');
select pg_temp.debe_fallar($q$insert into public.planes (titulo, estado) values ('x', 'planeado')$q$, array['23514'], 'planeado sin fecha');
select pg_temp.debe_fallar($q$insert into public.planes (titulo, valoracion) values ('x', 3)$q$, array['23514'], 'valoración sin estar hecho');
select pg_temp.debe_fallar($q$insert into public.planes (titulo, estado, valoracion) values ('x', 'hecho', 6)$q$, array['23514'], 'valoración 6');
select pg_temp.debe_fallar($q$insert into public.planes (titulo, estado, valoracion) values ('x', 'hecho', 0)$q$, array['23514'], 'valoración 0');
select pg_temp.debe_fallar($q$insert into public.planes (titulo, tipo) values ('x', 'fiesta')$q$, array['23514'], 'un tipo fuera de la lista');
select pg_temp.debe_fallar($q$insert into public.planes (titulo, estado) values ('x', 'cancelado')$q$, array['23514'], 'un estado fuera de la lista');
select pg_temp.debe_fallar($q$insert into public.planes (titulo, coste_centimos) values ('x', -1)$q$, array['23514'], 'un coste negativo');
select pg_temp.debe_fallar($q$insert into public.planes (titulo) values ('')$q$, array['23514'], 'un plan sin título');
select pg_temp.debe_fallar($q$update public.planes set estado = 'planeado' where id = 'a0000000-0000-4000-8000-000000000b01'$q$,
  array['23514'], 'pasar a planeado sin fecha');

-- @caso: deseos: precio en céntimos positivo, prioridad válida, enlace solo http(s) y fecha de compra solo si está comprado
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.deseos (articulo, precio_centimos, prioridad, enlace) values ('ok', 5999, 'alta', 'https://tienda.es/a?b=1');
insert into public.deseos (articulo, precio_centimos, comprado, comprado_en) values ('comprado', 1, true, '2026-11-14');
select pg_temp.debe_fallar($q$insert into public.deseos (articulo, precio_centimos) values ('x', 0)$q$, array['23514'], 'un precio 0');
select pg_temp.debe_fallar($q$insert into public.deseos (articulo, precio_centimos) values ('x', 100000000000)$q$, array['23514'], 'un precio enorme');
select pg_temp.debe_fallar($q$insert into public.deseos (articulo, precio_centimos, prioridad) values ('x', 1, 'urgente')$q$, array['23514'], 'una prioridad fuera de la lista');
select pg_temp.debe_fallar($q$insert into public.deseos (articulo, precio_centimos, enlace) values ('x', 1, 'javascript:alert(1)')$q$, array['23514'], 'un enlace javascript:');
select pg_temp.debe_fallar($q$insert into public.deseos (articulo, precio_centimos, enlace) values ('x', 1, 'https://con espacio.es')$q$, array['23514'], 'un enlace con espacios');
select pg_temp.debe_fallar($q$insert into public.deseos (articulo, precio_centimos, comprado_en) values ('x', 1, '2026-11-14')$q$, array['23514'], 'fecha de compra sin estar comprado');
select pg_temp.debe_fallar($q$insert into public.deseos (articulo, precio_centimos) values ('', 1)$q$, array['23514'], 'un artículo sin nombre');

-- @caso: ninguna tabla de Mi Panel deja revivir una fila borrada (upsert de un dispositivo sin conexión)
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.ideas (id, texto) values ('a0000000-0000-4000-8000-000000000c01', 'idea');
insert into public.tareas (id, texto) values ('a0000000-0000-4000-8000-000000000c02', 'tarea');
insert into public.cumpleanos (id, nombre, dia, mes) values ('a0000000-0000-4000-8000-000000000c03', 'x', 1, 1);
delete from public.ideas where id = 'a0000000-0000-4000-8000-000000000c01';
delete from public.tareas where id = 'a0000000-0000-4000-8000-000000000c02';
delete from public.cumpleanos where id = 'a0000000-0000-4000-8000-000000000c03';
insert into public.ideas (id, texto) values ('a0000000-0000-4000-8000-000000000c01', 'editada sin conexión')
  on conflict (id) do update set texto = excluded.texto;
insert into public.tareas (id, texto) values ('a0000000-0000-4000-8000-000000000c02', 'editada sin conexión')
  on conflict (id) do update set texto = excluded.texto;
insert into public.cumpleanos (id, nombre, dia, mes) values ('a0000000-0000-4000-8000-000000000c03', 'y', 1, 1)
  on conflict (id) do update set nombre = excluded.nombre;
select pg_temp.comprobar(not exists (select 1 from public.ideas where id = 'a0000000-0000-4000-8000-000000000c01')
  and not exists (select 1 from public.tareas where id = 'a0000000-0000-4000-8000-000000000c02')
  and not exists (select 1 from public.cumpleanos where id = 'a0000000-0000-4000-8000-000000000c03'),
  'una fila borrada ha vuelto a aparecer');
-- Y las tablas de Mi Panel lo tienen todas
select pg_temp.comprobar((select count(distinct event_object_table) from information_schema.triggers
  where trigger_schema = 'public' and trigger_name = 'no_revivir_borrado') = 11, 'falta no_revivir_borrado en alguna tabla');

-- @caso: borrar un usuario de auth.users borra en cascada todas sus filas
reset role;
-- A tiene filas en las tablas de Mi Panel (preámbulo) y un borrado apuntado:
-- el borrado de la cuenta no debe fallar (20261113000500) ni dejar restos.
select pg_temp.comprobar((select count(*) from public.habito_marcas where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') >= 1
  and (select count(*) from public.borrados where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') >= 1,
  'A no tiene datos que borrar: el caso no probaría nada');
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select pg_temp.comprobar((select count(*) from public.borrados b
  where not exists (select 1 from auth.users u where u.id = b.user_id)) = 0, 'quedan borrados de un usuario que ya no existe');
select pg_temp.comprobar((select count(*) from public.habitos where user_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 1
  and (select count(*) from public.habito_marcas where user_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 1
  and (select count(*) from public.tareas where user_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 1
  and (select count(*) from public.movimientos where user_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 1
  and (select count(*) from public.clientes_web where user_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 1,
  'borrar a A se ha llevado datos de Mi Panel de B');
do $$
declare
  t text;
  n bigint;
begin
  for t in
    select format('%I.%I', table_schema, table_name) from information_schema.columns
    where table_schema = 'public' and column_name = 'user_id'
  loop
    execute format('select count(*) from %s where user_id = %L', t, 'aaaaaaaa-0000-4000-8000-000000000001') into n;
    perform pg_temp.comprobar(n = 0, format('quedan %s filas de A en %s', n, t));
  end loop;
end;
$$;
select pg_temp.comprobar((select count(*) from public.modulos where user_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 1,
  'borrar a A se ha llevado datos de B');

-- @caso: fijos con frecuencia: día de la semana en semanales, mes solo en anuales, necesidad solo en gastos
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, desde, frecuencia, inicio)
  values ('gasto', 'Café', 150, 7, '9999-12', 'diaria', '2026-11-14'),
         ('gasto', 'Clase', 2000, 3, '9999-12', 'semanal', '2026-11-14');
insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, mes, desde, frecuencia, inicio, necesidad)
  values ('gasto', 'Seguro', 12000, 29, 2, '9999-12', 'anual', '2026-11-14', 'esencial');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, desde, frecuencia, inicio)
  values ('gasto', 'x', 1, 8, '9999-12', 'semanal', '2026-11-14')$q$, array['23514'], 'un semanal el día 8');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, desde, frecuencia, inicio)
  values ('gasto', 'x', 1, 1, '9999-12', 'anual', '2026-11-14')$q$, array['23514'], 'un anual sin mes');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, mes, desde, inicio)
  values ('gasto', 'x', 1, 1, 5, '2026-11', '2026-11-14')$q$, array['23514'], 'un mensual con mes');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, mes, desde, frecuencia, inicio)
  values ('gasto', 'x', 1, 31, 4, '9999-12', 'anual', '2026-11-14')$q$, array['23514'], 'un anual el 31 de abril');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, desde, frecuencia, inicio)
  values ('gasto', 'x', 1, 1, '2026-11', 'quincenal', '2026-11-14')$q$, array['23514'], 'una frecuencia fuera de la lista');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, desde, necesidad)
  values ('ingreso', 'x', 1, 1, '2026-11', 'esencial')$q$, array['23514'], 'un ingreso fijo esencial');
select pg_temp.debe_fallar($q$insert into public.movimientos_fijos (tipo, concepto, importe_centimos, dia, desde, necesidad)
  values ('gasto', 'x', 1, 1, '2026-11', 'caprichoso')$q$, array['23514'], 'una necesidad fuera de la lista');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha, necesidad)
  values ('ingreso', 'x', 1, '2026-11-14', 'prescindible')$q$, array['23514'], 'un ingreso prescindible');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha, necesidad)
  values ('gasto', 'x', 1, '2026-11-14', 'caprichoso')$q$, array['23514'], 'un movimiento con necesidad fuera de la lista');
insert into public.movimientos (tipo, concepto, importe_centimos, fecha, necesidad, fijo_id)
  values ('gasto', 'Netflix', 999, '2026-11-14', 'prescindible', 'a0000000-0000-4000-8000-0000000000f1');

-- @caso: compatibilidad con la app antigua: rellena inicio y ultimo_apunte desde los meses
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
-- La app antigua crea un fijo sin inicio
insert into public.movimientos_fijos (id, tipo, concepto, importe_centimos, dia, desde)
  values ('a0000000-0000-4000-8000-000000000c01', 'gasto', 'Gimnasio', 3000, 31, '2026-02');
select pg_temp.comprobar((select frecuencia = 'mensual' and inicio = '2026-02-01' and ultimo_apunte is null
  from public.movimientos_fijos where id = 'a0000000-0000-4000-8000-000000000c01'), 'un fijo de la app antigua no tiene inicio');
-- La app antigua apunta febrero (solo cambia ultimo_mes): el 31 cae el 28
update public.movimientos_fijos set ultimo_mes = '2026-02', updated_at = now() + interval '1 second'
  where id = 'a0000000-0000-4000-8000-000000000c01';
select pg_temp.comprobar((select ultimo_apunte = '2026-02-28' from public.movimientos_fijos
  where id = 'a0000000-0000-4000-8000-000000000c01'), 'ultimo_apunte no sigue a ultimo_mes');
-- La app antigua reanuda (solo cambia desde)
update public.movimientos_fijos set desde = '2026-05', updated_at = now() + interval '2 second'
  where id = 'a0000000-0000-4000-8000-000000000c01';
select pg_temp.comprobar((select inicio = '2026-05-01' from public.movimientos_fijos
  where id = 'a0000000-0000-4000-8000-000000000c01'), 'inicio no sigue a desde');
-- La app nueva cambia las dos cosas a la vez: se respeta lo que manda
update public.movimientos_fijos set desde = '2026-07', inicio = '2026-06-20', ultimo_mes = '2026-06', ultimo_apunte = '2026-06-30',
  updated_at = now() + interval '3 second' where id = 'a0000000-0000-4000-8000-000000000c01';
select pg_temp.comprobar((select inicio = '2026-06-20' and ultimo_apunte = '2026-06-30' from public.movimientos_fijos
  where id = 'a0000000-0000-4000-8000-000000000c01'), 'el trigger pisa lo que manda la app nueva');

-- @caso: revisiones: semana de lunes a domingo, mes completo, una por periodo y datos pequeños
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.revisiones (tipo, inicio, fin, datos) values ('semanal', '2026-11-09', '2026-11-15', '{"v": 1}');
insert into public.revisiones (tipo, inicio, fin, datos) values ('mensual', '2026-02-01', '2026-02-28', '{"v": 1}');
select pg_temp.comprobar((select not vista from public.revisiones where inicio = '2026-11-09'), 'una revisión nueva nace vista');
select pg_temp.debe_fallar($q$insert into public.revisiones (tipo, inicio, fin, datos) values ('semanal', '2026-11-09', '2026-11-15', '{"v": 1}')$q$,
  array['23505'], 'dos revisiones de la misma semana');
select pg_temp.debe_fallar($q$insert into public.revisiones (tipo, inicio, fin, datos) values ('semanal', '2026-11-10', '2026-11-16', '{"v": 1}')$q$,
  array['23514'], 'una semana que no empieza en lunes');
select pg_temp.debe_fallar($q$insert into public.revisiones (tipo, inicio, fin, datos) values ('semanal', '2026-11-16', '2026-11-30', '{"v": 1}')$q$,
  array['23514'], 'una semana de 15 días');
select pg_temp.debe_fallar($q$insert into public.revisiones (tipo, inicio, fin, datos) values ('mensual', '2026-02-01', '2026-02-27', '{"v": 1}')$q$,
  array['23514'], 'un mes incompleto');
select pg_temp.debe_fallar($q$insert into public.revisiones (tipo, inicio, fin, datos) values ('anual', '2026-01-01', '2026-12-31', '{"v": 1}')$q$,
  array['23514'], 'un tipo fuera de la lista');
select pg_temp.debe_fallar($q$insert into public.revisiones (tipo, inicio, fin, datos) values ('mensual', '2026-03-01', '2026-03-31', '[1, 2]')$q$,
  array['23514'], 'datos que no son un objeto');
select pg_temp.debe_fallar($q$insert into public.revisiones (tipo, inicio, fin, datos)
  values ('mensual', '2026-03-01', '2026-03-31', jsonb_build_object('relleno', repeat(md5(random()::text), 2000)))$q$,
  array['23514'], 'datos de más de 32 KB');
-- El unique es por usuario: B puede tener la misma semana, y una fila de B no
-- se ve ni se toca desde A (aunque B elija el id)
select pg_temp.como('bbbbbbbb-0000-4000-8000-000000000002');
insert into public.revisiones (id, tipo, inicio, fin, datos) values ('b0000000-0000-4000-8000-0000000000e1', 'semanal', '2026-11-09', '2026-11-15', '{"v": 1}');
select pg_temp.como('aaaaaaaa-0000-4000-8000-000000000001');
select pg_temp.comprobar((select count(*) from public.revisiones where id = 'b0000000-0000-4000-8000-0000000000e1') = 0, 'A ve la revisión de B');
select pg_temp.debe_fallar($q$insert into public.revisiones (id, tipo, inicio, fin, datos) values ('b0000000-0000-4000-8000-0000000000e1', 'mensual', '2026-04-01', '2026-04-30', '{"v": 1}')
  on conflict (id) do update set vista = true$q$, array['42501'], 'A pisa la revisión de B');

-- @fin
do $$
begin
  raise notice 'RLS EXTRA OK: % comprobaciones superadas', (select n from resultados);
end;
$$;

rollback;

