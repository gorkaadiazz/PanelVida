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

reset role;

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
-- Casos destructivos: van al final
-- -----------------------------------------------------------------------------

-- @caso: borrar un usuario de auth.users borra en cascada todas sus filas
reset role;
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';
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

-- @fin
do $$
begin
  raise notice 'RLS EXTRA OK: % comprobaciones superadas', (select n from resultados);
end;
$$;

rollback;
