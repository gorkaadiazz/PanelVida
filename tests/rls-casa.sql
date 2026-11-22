-- =============================================================================
-- Fase 9 (Casa): tests de RLS y reglas de las tablas nuevas
--
-- Mismo formato que tests/rls-extra.sql: cada `-- @caso:` es un test aparte
-- (Vitest, tests/sql.test.ts) que se ejecuta tras este preámbulo dentro de
-- una transacción que se deshace. También se puede ejecutar entero con psql.
-- =============================================================================

begin;

create temporary table resultados (n int not null default 0);
insert into resultados values (0);
grant all on resultados to authenticated, anon, service_role;

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

-- A = el autor, B = otra persona
-- F = un familiar (cuenta «solo lista»)
insert into public.emails_permitidos (email) values ('casa-a@rls.test'), ('casa-b@rls.test'), ('casa-f@rls.test');
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'casa-a@rls.test', '{"full_name": "Autor"}'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'casa-b@rls.test', '{"full_name": "Compañero"}'),
  ('ffffffff-0000-4000-8000-00000000000f', 'Casa-F@rls.test', '{"full_name": "Familiar"}');
insert into public.cuentas_solo_lista (email) values ('casa-f@rls.test');

-- -----------------------------------------------------------------------------
-- @caso: puente: B no ve, edita ni borra lo de A, no crea a su nombre y anon no lee
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.puente (id, tipo, contenido, dispositivo) values ('a0000000-0000-4000-8000-0000000000e1', 'texto', 'hola', 'Móvil');
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar((select count(*) from public.puente) = 0, 'B ve el puente de A');
update public.puente set contenido = 'pirata';
delete from public.puente;
select pg_temp.debe_fallar($q$insert into public.puente (tipo, contenido, user_id) values ('texto', 'x', 'aaaaaaaa-0000-4000-8000-00000000000a')$q$,
  array['42501'], 'B crea en el puente de A');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select * from public.puente$q$, array['42501'], 'anon lee el puente');
reset role;
select pg_temp.comprobar((select contenido from public.puente where id = 'a0000000-0000-4000-8000-0000000000e1') = 'hola',
  'B ha cambiado o borrado lo de A');

-- @caso: puente: texto y enlace con contenido; enlace solo http(s); el archivo, en su carpeta y fila
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.puente (tipo, contenido) values ('enlace', 'https://ejemplo.com/a?b=1');
insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('a0000000-0000-4000-8000-0000000000e2', 'archivo',
          'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000e2/foto.jpg', 'foto.jpg', 1000);
select pg_temp.debe_fallar($q$insert into public.puente (tipo, contenido) values ('texto', '')$q$, array['23514'], 'texto vacío');
select pg_temp.debe_fallar($q$insert into public.puente (tipo, contenido) values ('enlace', 'javascript:alert(1)')$q$, array['23514'], 'enlace javascript:');
select pg_temp.debe_fallar($q$insert into public.puente (tipo, contenido, archivo_nombre) values ('texto', 'x', 'a.txt')$q$, array['23514'], 'texto con archivo');
select pg_temp.debe_fallar($q$insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('a0000000-0000-4000-8000-0000000000e3', 'archivo', 'bbbbbbbb-0000-4000-8000-00000000000b/a0000000-0000-4000-8000-0000000000e3/x.pdf', 'x.pdf', 10)$q$,
  array['23514'], 'una fila que apunta a la carpeta de B');
select pg_temp.debe_fallar($q$insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('a0000000-0000-4000-8000-0000000000e4', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000e2/foto.jpg', 'x', 10)$q$,
  array['23514'], 'una fila que apunta al archivo de otra fila');
select pg_temp.debe_fallar($q$insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('a0000000-0000-4000-8000-0000000000e5', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000e5/../../x', 'x', 10)$q$,
  array['23514'], 'una ruta con ..');
select pg_temp.debe_fallar($q$insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('a0000000-0000-4000-8000-0000000000e6', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000e6/x', 'x', 26214401)$q$,
  array['23514'], 'un archivo de más de 25 MB');
select pg_temp.debe_fallar($q$update public.puente set archivo_ruta = 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000e2/otro.jpg'
  where id = 'a0000000-0000-4000-8000-0000000000e2'$q$, array['23514'], 'cambiar el archivo de una fila');
update public.puente set fijado = true where id = 'a0000000-0000-4000-8000-0000000000e2';
select pg_temp.comprobar((select fijado from public.puente where id = 'a0000000-0000-4000-8000-0000000000e2'), 'no se puede fijar');

-- @caso: puente: tope de 300 MB declarados por usuario
reset role;
-- 12 archivos de 25 MB ya subidos (como administrador, para no depender del límite de 3 por subir)
do $$
declare
  g uuid;
begin
  for i in 1..12 loop
    g := gen_random_uuid();
    insert into public.puente (id, user_id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
      values (g, 'aaaaaaaa-0000-4000-8000-00000000000a', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/' || g || '/f', 'f', 26214400);
    insert into storage.objects (bucket_id, name, metadata)
      values ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/' || g || '/f', '{"size": 26214400}');
  end loop;
end;
$$;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('a0000000-0000-4000-8000-0000000000e7', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000e7/f', 'f', 1)$q$,
  array['23514'], 'pasar de 300 MB');
-- B tiene su propio tope
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('b0000000-0000-4000-8000-0000000000e7', 'archivo', 'bbbbbbbb-0000-4000-8000-00000000000b/b0000000-0000-4000-8000-0000000000e7/f', 'f', 1);

-- @caso: puente: un borrado queda en `borrados` y no revive
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.puente (id, tipo, contenido) values ('a0000000-0000-4000-8000-0000000000e8', 'texto', 'x');
delete from public.puente where id = 'a0000000-0000-4000-8000-0000000000e8';
select pg_temp.comprobar(exists (select 1 from public.borrados where tabla = 'puente' and fila_id = 'a0000000-0000-4000-8000-0000000000e8'),
  'el borrado no se apunta');
insert into public.puente (id, tipo, contenido) values ('a0000000-0000-4000-8000-0000000000e8', 'texto', 'y')
  on conflict (id) do update set contenido = excluded.contenido;
select pg_temp.comprobar(not exists (select 1 from public.puente where id = 'a0000000-0000-4000-8000-0000000000e8'), 'revive');

-- @caso: storage puente: solo se sube a la ruta de una fila propia y solo se lee la carpeta propia
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('a0000000-0000-4000-8000-0000000000e9', 'archivo',
          'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000e9/doc.pdf', 'doc.pdf', 10);
insert into storage.objects (bucket_id, name) values ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000e9/doc.pdf');
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name)
  values ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000e9/otro.pdf')$q$,
  array['42501'], 'A sube un archivo sin fila');
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name)
  values ('puente', 'bbbbbbbb-0000-4000-8000-00000000000b/x/y.pdf')$q$, array['42501'], 'A sube a la carpeta de B');
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar((select count(*) from storage.objects where bucket_id = 'puente') = 0, 'B ve archivos del puente de A');
delete from storage.objects where bucket_id = 'puente';
-- B crea una fila con la ruta de A: el check lo impide, así que tampoco puede subir allí
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name)
  values ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000e9/doc.pdf')$q$,
  array['42501', '23505'], 'B sube a la ruta de una fila de A');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name) values ('puente', 'x/y/z')$q$, array['42501'], 'anon sube al puente');
reset role;
select pg_temp.comprobar((select count(*) from storage.objects where bucket_id = 'puente') = 1, 'B ha borrado el archivo de A');

-- @caso: puente: la limpieza solo la usa la service role y encuentra los archivos sin fila
reset role;
insert into storage.objects (bucket_id, name, created_at) values
  ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000ea/viejo.pdf', now() - interval '2 days'),
  ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000eb/reciente.pdf', now());
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$select public.puente_archivos_huerfanos(10)$q$, array['42501'], 'un usuario lista los huérfanos');
select pg_temp.como('service');
select pg_temp.comprobar(
  (select array_agg(h) from public.puente_archivos_huerfanos(10) h)
    = array['aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000ea/viejo.pdf'],
  'la limpieza no encuentra solo el huérfano viejo');

-- @caso: storage puente: el tope cuenta los bytes REALES, no los que declara la app
reset role;
-- A declara 1 byte en cada fila pero sube 25 MB (lo que mide Storage)
do $$
declare
  g uuid;
begin
  for i in 1..12 loop
    g := gen_random_uuid();
    insert into public.puente (id, user_id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
      values (g, 'aaaaaaaa-0000-4000-8000-00000000000a', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/' || g || '/f', 'f', 1);
    insert into storage.objects (bucket_id, name, metadata)
      values ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/' || g || '/f', '{"size": 26214400}');
  end loop;
end;
$$;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
-- La fila se crea (lo declarado es poco)…
insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('a0000000-0000-4000-8000-0000000000f1', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f1/f', 'f', 1);
-- …pero Storage no deja subir: la carpeta ya ocupa 300 MB de verdad
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name, metadata)
  values ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f1/f', '{"size": 26214400}')$q$,
  array['42501'], 'subir pasando de 300 MB reales declarando 1 byte');
-- B, con su carpeta vacía, sí puede
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('b0000000-0000-4000-8000-0000000000f1', 'archivo', 'bbbbbbbb-0000-4000-8000-00000000000b/b0000000-0000-4000-8000-0000000000f1/f', 'f', 10);
insert into storage.objects (bucket_id, name, metadata)
  values ('puente', 'bbbbbbbb-0000-4000-8000-00000000000b/b0000000-0000-4000-8000-0000000000f1/f', '{"size": 10}');

-- @caso: puente: como mucho 3 archivos por subir a la vez
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
select g, 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/' || g || '/f', 'f', 10
from (select gen_random_uuid() as g from generate_series(1, 3)) s;
select pg_temp.debe_fallar($q$insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('a0000000-0000-4000-8000-0000000000f2', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f2/f', 'f', 10)$q$,
  array['23514'], 'un cuarto archivo por subir');
-- El texto no cuenta
insert into public.puente (tipo, contenido) values ('texto', 'sí');

-- @caso: storage puente: cada fila recibe un solo archivo y el archivo solo se borra sin fila
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('a0000000-0000-4000-8000-0000000000f3', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f3/f', 'f', 10);
insert into storage.objects (bucket_id, name, metadata)
  values ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f3/f', '{"size": 10}');
-- Con la fila viva, el archivo no se borra (si se pudiera, la fila quedaría libre para otro archivo)
delete from storage.objects where name = 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f3/f';
reset role;
select pg_temp.comprobar((select count(*) from storage.objects where name = 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f3/f') = 1,
  'se borra el archivo de una fila viva');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
-- Tampoco se puede subir otro a la misma fila
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name, metadata)
  values ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f3/f', '{"size": 10}')$q$,
  array['42501', '23505'], 'un segundo archivo en la misma fila');
-- Borrada la fila, el archivo sí se borra, y ya no se puede volver a subir
delete from public.puente where id = 'a0000000-0000-4000-8000-0000000000f3';
delete from storage.objects where name = 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f3/f';
reset role;
select pg_temp.comprobar((select count(*) from storage.objects where name = 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f3/f') = 0,
  'no se borra el archivo sin fila');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name, metadata)
  values ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f3/f', '{"size": 10}')$q$,
  array['42501'], 'subir a la ruta de una fila borrada');

-- @caso: puente: el nombre del archivo en la ruta, sin vacíos ni caracteres raros
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('a0000000-0000-4000-8000-0000000000f4', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f4/', 'f', 10)$q$,
  array['23514'], 'un nombre vacío');
select pg_temp.debe_fallar($q$insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('a0000000-0000-4000-8000-0000000000f4', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f4/a b.pdf', 'f', 10)$q$,
  array['23514'], 'un nombre con espacios');

-- @caso: puente (tester): límites de los check (10.000 caracteres, dispositivo de 40, enlace sin nada tras el esquema)
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.puente (tipo, contenido, dispositivo) values ('texto', repeat('x', 10000), repeat('d', 40));
select pg_temp.debe_fallar($q$insert into public.puente (tipo, contenido) values ('texto', repeat('x', 10001))$q$, array['23514'], 'texto de 10.001');
select pg_temp.debe_fallar($q$insert into public.puente (tipo, contenido, dispositivo) values ('texto', 'x', repeat('d', 41))$q$, array['23514'], 'dispositivo de 41');
select pg_temp.debe_fallar($q$insert into public.puente (tipo, contenido) values ('enlace', 'https://')$q$, array['23514'], 'enlace vacío');
select pg_temp.debe_fallar($q$insert into public.puente (tipo, contenido) values ('enlace', 'https://a.es/x y')$q$, array['23514'], 'enlace con espacio');
select pg_temp.debe_fallar($q$insert into public.puente (tipo, contenido) values ('enlace', 'data:text/html,hola')$q$, array['23514'], 'enlace data:');
select pg_temp.debe_fallar($q$insert into public.puente (tipo, contenido) values ('nota', 'x')$q$, array['23514'], 'tipo desconocido');
select pg_temp.debe_fallar($q$insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('c0000000-0000-4000-8000-0000000000a1', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000a1/f', 'f', 0)$q$,
  array['23514'], 'archivo de 0 bytes');
select pg_temp.debe_fallar($q$insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('c0000000-0000-4000-8000-0000000000a1', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000a1/x/f', 'f', 1)$q$,
  array['23514'], 'ruta con una carpeta de más');
-- 25 MB justos, sí
insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('c0000000-0000-4000-8000-0000000000a1', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000a1/f', 'f', 26214400);

-- @caso: puente (tester): no se puede pasar un texto a enlace raro ni mover una fila a otro usuario
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.puente (id, tipo, contenido) values ('c0000000-0000-4000-8000-0000000000a2', 'texto', 'javascript:alert(1)');
select pg_temp.debe_fallar($q$update public.puente set tipo = 'enlace' where id = 'c0000000-0000-4000-8000-0000000000a2'$q$,
  array['23514'], 'cambiar texto a enlace');
update public.puente set user_id = 'bbbbbbbb-0000-4000-8000-00000000000b' where id = 'c0000000-0000-4000-8000-0000000000a2';
reset role;
select pg_temp.comprobar((select user_id from public.puente where id = 'c0000000-0000-4000-8000-0000000000a2') = 'aaaaaaaa-0000-4000-8000-00000000000a',
  'una fila del puente ha pasado a B');

-- @caso: puente (tester): lo que borra la limpieza (service role) le llega solo a su dueño por `borrados`
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.puente (id, tipo, contenido, created_at) values ('c0000000-0000-4000-8000-0000000000a3', 'texto', 'viejo', now() - interval '8 days');
select pg_temp.como('service');
delete from public.puente where not fijado and created_at < now() - interval '7 days';
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.comprobar(exists (select 1 from public.borrados where tabla = 'puente' and fila_id = 'c0000000-0000-4000-8000-0000000000a3'),
  'A no se entera de lo que borra la limpieza');
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar(not exists (select 1 from public.borrados where fila_id = 'c0000000-0000-4000-8000-0000000000a3'),
  'B ve los borrados del puente de A');

-- @caso: puente (tester): fijar un archivo ya subido (upsert, como el motor) funciona aunque haya 3 por subir
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('c0000000-0000-4000-8000-0000000000a4', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000a4/f', 'f', 10);
insert into storage.objects (bucket_id, name, metadata)
  values ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000a4/f', '{"size": 10}');
insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
select g, 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/' || g || '/f', 'f', 10
from (select gen_random_uuid() as g from generate_series(1, 3)) s;
-- Así sube el motor un cambio (PostgREST upsert = insert … on conflict do update)
insert into public.puente (id, tipo, contenido, archivo_ruta, archivo_nombre, archivo_tipo, archivo_bytes, dispositivo, fijado, updated_at)
  values ('c0000000-0000-4000-8000-0000000000a4', 'archivo', '', 'aaaaaaaa-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000a4/f',
          'f', null, 10, '', true, now() + interval '1 second')
  on conflict (id) do update set fijado = excluded.fijado, updated_at = excluded.updated_at;
select pg_temp.comprobar((select fijado from public.puente where id = 'c0000000-0000-4000-8000-0000000000a4'), 'no se ha fijado');

-- @caso: puente (tester): con 2.000 elementos no entra otro, pero se puede seguir fijando uno que ya está
reset role;
insert into public.puente (id, user_id, tipo, contenido)
select gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-00000000000a', 'texto', 'x' from generate_series(1, 1999);
insert into public.puente (id, user_id, tipo, contenido)
  values ('c0000000-0000-4000-8000-0000000000a5', 'aaaaaaaa-0000-4000-8000-00000000000a', 'texto', 'el 2000');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$insert into public.puente (tipo, contenido) values ('texto', 'el 2001')$q$, array['23514'], 'el elemento 2.001');
insert into public.puente (id, tipo, contenido, fijado, updated_at) values ('c0000000-0000-4000-8000-0000000000a5', 'texto', 'el 2000', true, now() + interval '1 second')
  on conflict (id) do update set fijado = excluded.fijado, updated_at = excluded.updated_at;
select pg_temp.comprobar((select fijado from public.puente where id = 'c0000000-0000-4000-8000-0000000000a5'), 'no se puede fijar con 2.000');
-- B no se ve afectado por el tope de A
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.puente (tipo, contenido) values ('texto', 'de B');

-- @caso: storage puente (tester): B no borra el archivo huérfano de A ni puede preguntar por sus rutas
reset role;
insert into storage.objects (bucket_id, name, metadata)
  values ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000a6/f', '{"size": 10}');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('c0000000-0000-4000-8000-0000000000a8', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000a8/f', 'f', 10);
select pg_temp.comprobar(public.puente_puede_subir('aaaaaaaa-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000a8/f'),
  'A no puede subir a su propia fila');
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
delete from storage.objects where bucket_id = 'puente';
select pg_temp.comprobar(not public.puente_puede_subir('aaaaaaaa-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000a6/f'),
  'B puede subir a la carpeta de A');
select pg_temp.comprobar(not public.puente_puede_subir('aaaaaaaa-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000a8/f'),
  'puente_puede_subir dice que B puede subir a la fila de A');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select public.puente_puede_subir('x/y/z')$q$, array['42501'], 'anon usa puente_puede_subir');
reset role;
select pg_temp.comprobar((select count(*) from storage.objects where bucket_id = 'puente') = 1, 'B ha borrado el huérfano de A');

-- @caso: puente (tester): la limpieza no toma por huérfano un archivo con fila, aunque sea viejo
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('c0000000-0000-4000-8000-0000000000a7', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000a7/f', 'f', 10);
reset role;
insert into storage.objects (bucket_id, name, created_at) values
  ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-0000000000a7/f', now() - interval '30 days'),
  ('temarios', 'aaaaaaaa-0000-4000-8000-00000000000a/sin/fila', now() - interval '30 days');
select pg_temp.como('service');
select pg_temp.comprobar(not exists (select 1 from public.puente_archivos_huerfanos(1000)), 'la limpieza borraría un archivo con fila o de otro bucket');

-- @caso: puente: una fila que espera su archivo no se borra hasta pasadas 2 horas; la limpieza la quita (solo service role)
reset role;
insert into public.puente (id, user_id, tipo, archivo_ruta, archivo_nombre, archivo_bytes) values
  ('a0000000-0000-4000-8000-0000000000f8', 'aaaaaaaa-0000-4000-8000-00000000000a', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f8/f', 'f', 10),
  ('a0000000-0000-4000-8000-0000000000f9', 'aaaaaaaa-0000-4000-8000-00000000000a', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f9/f', 'f', 10),
  ('a0000000-0000-4000-8000-0000000000fa', 'aaaaaaaa-0000-4000-8000-00000000000a', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000fa/f', 'f', 10);
insert into storage.objects (bucket_id, name, metadata) values ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000f9/f', '{"size": 10}');
-- A no puede borrar la que espera su archivo (fa, reciente) para liberar el hueco de «por subir»
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
delete from public.puente where id = 'a0000000-0000-4000-8000-0000000000fa';
-- La que ya tiene archivo sí
delete from public.puente where id = 'a0000000-0000-4000-8000-0000000000f9';
reset role;
select pg_temp.comprobar(exists (select 1 from public.puente where id = 'a0000000-0000-4000-8000-0000000000fa'), 'A borra una fila que espera su archivo');
select pg_temp.comprobar(not exists (select 1 from public.puente where id = 'a0000000-0000-4000-8000-0000000000f9'), 'A no puede borrar una fila con su archivo');
-- f8 lleva 2 h y media sin archivo
alter table public.puente disable trigger antes_de_guardar;
update public.puente set sync_at = now() - interval '150 minutes' where id = 'a0000000-0000-4000-8000-0000000000f8';
alter table public.puente enable trigger antes_de_guardar;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$select public.puente_borrar_filas_sin_archivo(10)$q$, array['42501'], 'un usuario usa la limpieza');
select pg_temp.como('service');
select pg_temp.comprobar(public.puente_borrar_filas_sin_archivo(10) = 1, 'la limpieza no borra solo la fila vieja sin archivo');
reset role;
select pg_temp.comprobar(not exists (select 1 from public.puente where id = 'a0000000-0000-4000-8000-0000000000f8')
  and exists (select 1 from public.puente where id = 'a0000000-0000-4000-8000-0000000000fa'), 'la limpieza borra la fila equivocada');
-- Pasadas 2 horas, el dueño ya puede borrarla él también
alter table public.puente disable trigger antes_de_guardar;
update public.puente set sync_at = now() - interval '3 hours' where id = 'a0000000-0000-4000-8000-0000000000fa';
alter table public.puente enable trigger antes_de_guardar;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
delete from public.puente where id = 'a0000000-0000-4000-8000-0000000000fa';
reset role;
select pg_temp.comprobar(not exists (select 1 from public.puente where id = 'a0000000-0000-4000-8000-0000000000fa'), 'A no puede borrar su fila vieja sin archivo');

-- @caso: storage puente: entre todos, como mucho 700 MB en el bucket
reset role;
insert into storage.objects (bucket_id, name, metadata) values ('puente', 'bbbbbbbb-0000-4000-8000-00000000000b/x/relleno', '{"size": 734003200}');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.puente (id, tipo, archivo_ruta, archivo_nombre, archivo_bytes)
  values ('a0000000-0000-4000-8000-0000000000fb', 'archivo', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000fb/f', 'f', 10);
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name, metadata)
  values ('puente', 'aaaaaaaa-0000-4000-8000-00000000000a/a0000000-0000-4000-8000-0000000000fb/f', '{"size": 10}')$q$,
  array['42501'], 'subir con el bucket lleno');

-- @caso: cuentas: tipo_cuenta distingue la cuenta normal de la «solo lista» (sin mirar mayúsculas) y nadie lee la lista de familiares
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.comprobar(public.tipo_cuenta() = 'normal', 'A no es normal');
select pg_temp.debe_fallar($q$select * from public.cuentas_solo_lista$q$, array['42501'], 'A lee cuentas_solo_lista');
select pg_temp.debe_fallar($q$insert into public.cuentas_solo_lista (email) values ('yo@x.es')$q$, array['42501'], 'A se apunta a cuentas_solo_lista');
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar(public.tipo_cuenta() = 'solo_lista', 'F no es solo lista');
select pg_temp.debe_fallar($q$delete from public.cuentas_solo_lista$q$, array['42501'], 'F se quita de cuentas_solo_lista');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select public.tipo_cuenta()$q$, array['42501'], 'anon pregunta tipo_cuenta');

-- @caso: familiar: no puede leer ni escribir ninguna otra tabla de Mi Panel
reset role;
-- Aunque hubiera filas suyas (puestas por el administrador), no las ve
insert into public.habitos (user_id, nombre) values ('ffffffff-0000-4000-8000-00000000000f', 'de F');
insert into public.tareas (user_id, texto) values ('ffffffff-0000-4000-8000-00000000000f', 'de F');
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar((select count(*) from public.habitos) = 0 and (select count(*) from public.tareas) = 0, 'F ve hábitos o tareas');
select pg_temp.debe_fallar($q$insert into public.habitos (nombre) values ('x')$q$, array['42501'], 'F crea un hábito');
select pg_temp.debe_fallar($q$insert into public.tareas (texto) values ('x')$q$, array['42501'], 'F crea una tarea');
select pg_temp.debe_fallar($q$insert into public.movimientos (tipo, concepto, importe_centimos, fecha) values ('gasto', 'x', 100, '2026-11-22')$q$, array['42501'], 'F apunta un gasto');
select pg_temp.debe_fallar($q$insert into public.puente (tipo, contenido) values ('texto', 'x')$q$, array['42501'], 'F usa el Puente');
select pg_temp.debe_fallar($q$insert into public.ideas (texto) values ('x')$q$, array['42501'], 'F apunta una idea');
-- Todas las tablas de Mi Panel tienen la política restrictiva
reset role;
select pg_temp.comprobar((select count(*) from pg_policies where schemaname = 'public' and policyname = 'solo_cuentas_normales'
  and permissive = 'RESTRICTIVE') = 14, 'falta la política solo_cuentas_normales en alguna tabla');
-- Y ninguna tabla de Mi Panel con RLS se queda sin ella, salvo las de la compra y las de la web de exámenes
select pg_temp.comprobar(not exists (
  select 1 from pg_tables t
  where t.schemaname = 'public' and t.rowsecurity
    and t.tablename not in ('compra_mia', 'emails_permitidos', 'cuentas_solo_lista', 'borrados', 'perfiles', 'modulos', 'resultados_aprendizaje',
      'evaluaciones', 'evaluacion_ra', 'temas', 'archivos', 'chuletas', 'faltas', 'fe_registros', 'examenes_ia', 'flashcards', 'pomodoro_sesiones', 'uso_ia')
    and t.tablename not like 'hogar%' and t.tablename not like 'compra_%' and t.tablename not like 'borrados_%'
    and not exists (select 1 from pg_policies p where p.tablename = t.tablename and p.policyname = 'solo_cuentas_normales')),
  'una tabla nueva de Mi Panel sin la política restrictiva');

-- @caso: familiar: inicializar_cuenta no le crea nada; a una cuenta normal sí
reset role;
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar(public.inicializar_cuenta() = false, 'inicializar_cuenta crea algo a F');
reset role;
select pg_temp.comprobar(not exists (select 1 from public.perfiles where user_id = 'ffffffff-0000-4000-8000-00000000000f')
  and not exists (select 1 from public.modulos where user_id = 'ffffffff-0000-4000-8000-00000000000f'), 'F tiene perfil o módulos');
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar(public.inicializar_cuenta() = true, 'B no se inicializa');

-- @caso: mi lista: es privada (nadie más la ve ni la toca) y el familiar la puede usar
reset role;
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
insert into public.compra_mia (id, nombre, cantidad, seccion) values ('f0000000-0000-4000-8000-0000000000c1', 'Leche', '2 l', 'lacteos');
update public.compra_mia set comprado = true, comprado_en = now() where id = 'f0000000-0000-4000-8000-0000000000c1';
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.compra_mia (id, nombre) values ('a0000000-0000-4000-8000-0000000000c1', 'Pan');
select pg_temp.comprobar((select count(*) from public.compra_mia) = 1, 'A ve la lista de F');
update public.compra_mia set nombre = 'pirata' where id = 'f0000000-0000-4000-8000-0000000000c1';
delete from public.compra_mia where id = 'f0000000-0000-4000-8000-0000000000c1';
select pg_temp.debe_fallar($q$insert into public.compra_mia (nombre, user_id) values ('x', 'ffffffff-0000-4000-8000-00000000000f')$q$, array['42501'], 'A escribe en la lista de F');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select * from public.compra_mia$q$, array['42501'], 'anon lee la lista');
reset role;
select pg_temp.comprobar((select nombre from public.compra_mia where id = 'f0000000-0000-4000-8000-0000000000c1') = 'Leche', 'A ha tocado la lista de F');

-- @caso: mi lista: nombre obligatorio, sección de la lista, comprado_en solo si está comprado
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$insert into public.compra_mia (nombre) values ('  ')$q$, array['23514'], 'nombre vacío');
select pg_temp.debe_fallar($q$insert into public.compra_mia (nombre, seccion) values ('x', 'joyeria')$q$, array['23514'], 'sección fuera de la lista');
select pg_temp.debe_fallar($q$insert into public.compra_mia (nombre, comprado_en) values ('x', now())$q$, array['23514'], 'comprado_en sin comprar');
select pg_temp.debe_fallar($q$insert into public.compra_mia (nombre, cantidad) values ('x', '')$q$, array['23514'], 'cantidad vacía (debe ser null)');
insert into public.compra_mia (nombre, cantidad, seccion, notas) values ('Manzanas', '1 kg', 'fruta_verdura', 'de las rojas');

-- @caso: frecuentes: marcar como comprado lo cuenta a nombre de quien marca; solo se lee, y solo lo propio
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.compra_mia (id, nombre, seccion) values ('a0000000-0000-4000-8000-0000000000d1', 'Plátanos', 'fruta_verdura');
select pg_temp.comprobar((select count(*) from public.compra_frecuentes) = 0, 'cuenta algo sin comprar');
update public.compra_mia set comprado = true, comprado_en = now() where id = 'a0000000-0000-4000-8000-0000000000d1';
-- desmarcar y volver a marcar cuenta otra vez; editar el nombre de algo ya comprado no
update public.compra_mia set comprado = false, comprado_en = null where id = 'a0000000-0000-4000-8000-0000000000d1';
update public.compra_mia set comprado = true, comprado_en = now() where id = 'a0000000-0000-4000-8000-0000000000d1';
update public.compra_mia set notas = 'x' where id = 'a0000000-0000-4000-8000-0000000000d1';
insert into public.compra_mia (nombre, comprado, comprado_en) values ('  PLATANOS ', true, now());
select pg_temp.comprobar((select veces from public.compra_frecuentes where clave = 'platanos') = 3, 'no cuenta 3 veces los plátanos');
select pg_temp.comprobar((select seccion from public.compra_frecuentes where clave = 'platanos') = 'fruta_verdura', 'pierde la sección');
select pg_temp.debe_fallar($q$insert into public.compra_frecuentes (clave, nombre) values ('x', 'x')$q$, array['42501'], 'A escribe en frecuentes');
select pg_temp.debe_fallar($q$update public.compra_frecuentes set veces = 999$q$, array['42501'], 'A cambia frecuentes');
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar((select count(*) from public.compra_frecuentes) = 0, 'B ve los frecuentes de A');

-- @caso: hogar: lo crea una cuenta normal, su dueño entra como miembro y un familiar no puede crear uno
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogares (id, nombre) values ('a0000000-0000-4000-8000-0000000000b0', 'Casa');
select pg_temp.comprobar((select nombre from public.hogar_miembros where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a') = 'Autor',
  'el dueño no entra como miembro con su nombre');
select pg_temp.debe_fallar($q$insert into public.hogares (nombre) values ('Otra')$q$, array['42501', '23505'], 'A crea un segundo hogar');
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.debe_fallar($q$insert into public.hogares (nombre) values ('De F')$q$, array['42501'], 'un familiar crea un hogar');
select pg_temp.comprobar((select count(*) from public.hogares) = 0, 'F ve el hogar de A sin ser miembro');
select pg_temp.debe_fallar($q$insert into public.hogar_miembros (hogar_id, user_id, nombre)
  values ('a0000000-0000-4000-8000-0000000000b0', 'ffffffff-0000-4000-8000-00000000000f', 'yo')$q$, array['42501'], 'F se mete en el hogar sin código');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select * from public.hogares$q$, array['42501'], 'anon lee hogares');

-- @caso: invitación: código de un solo uso que mete al familiar; el código no se guarda, solo su hash
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogares (id) values ('a0000000-0000-4000-8000-0000000000b0');
create temporary table cod as select * from public.crear_invitacion();
grant select on cod to authenticated;
select pg_temp.comprobar((select codigo from cod) ~ '^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$', 'el código no tiene el formato');
select pg_temp.comprobar((select caduca_en from cod) between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour', 'no caduca en 7 días');
select pg_temp.debe_fallar($q$select codigo_hash from public.hogar_invitaciones$q$, array['42501'], 'A lee el hash');
-- F entra con el código en minúsculas y sin guion
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar(public.unirse_hogar(lower(replace((select codigo from cod), '-', ' '))) = 'ok', 'F no entra con el código');
select pg_temp.comprobar((select count(*) from public.hogar_miembros) = 2, 'F no ve a los 2 miembros');
select pg_temp.comprobar((select nombre from public.hogares) = 'Casa', 'F no ve el hogar');
select pg_temp.debe_fallar($q$select * from public.hogar_invitaciones where usado_en is null and false$q$, array['42501'], 'F lee las invitaciones (columnas)');
-- B no puede reutilizarlo
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar(public.unirse_hogar((select codigo from cod)) = 'usado', 'un código usado sirve otra vez');
select pg_temp.comprobar((select count(*) from public.hogar_miembros) = 0, 'B ve miembros de un hogar ajeno');
-- F ya está en un hogar: no entra en otro
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar(public.unirse_hogar('ABCDE-FGHJK') = 'ya_en_hogar', 'F entra en dos hogares');

-- @caso: invitación: un código caducado o inventado no sirve y hay un tope de intentos
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogares (id) values ('a0000000-0000-4000-8000-0000000000b0');
create temporary table cod as select * from public.crear_invitacion();
grant select on cod to authenticated;
reset role;
update public.hogar_invitaciones set caduca_en = now() - interval '1 minute';
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar(public.unirse_hogar((select codigo from cod)) = 'caducado', 'un código caducado sirve');
select pg_temp.comprobar(public.unirse_hogar('') = 'invalido', 'un código vacío no es inválido');
do $$ begin for i in 1..7 loop perform public.unirse_hogar('ZZZZZ-ZZZZ' || i); end loop; end $$;
select pg_temp.comprobar(public.unirse_hogar('ZZZZZ-ZZZZZ') = 'invalido', 'el décimo intento ya está bloqueado');
select pg_temp.comprobar(public.unirse_hogar('ZZZZZ-ZZZZY') = 'demasiados_intentos', 'no hay tope de intentos');
reset role;
select pg_temp.comprobar(not exists (select 1 from public.hogar_miembros where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 'B ha entrado');
-- Solo el dueño crea invitaciones, y como mucho 5 activas
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.debe_fallar($q$select public.crear_invitacion()$q$, array['42501'], 'B invita a un hogar que no tiene');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select public.crear_invitacion() from generate_series(1, 5);
select pg_temp.debe_fallar($q$select public.crear_invitacion()$q$, array['23514'], 'una sexta invitación activa');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select public.unirse_hogar('ABCDE-FGHJK')$q$, array['42501'], 'anon usa unirse_hogar');

-- @caso: hogar: el dueño expulsa (pierde el acceso al momento), un miembro sale, nadie expulsa al dueño
reset role;
insert into public.hogares (id, user_id) values ('a0000000-0000-4000-8000-0000000000b0', 'aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogar_miembros (hogar_id, user_id, nombre) values
  ('a0000000-0000-4000-8000-0000000000b0', 'ffffffff-0000-4000-8000-00000000000f', 'Familiar'),
  ('a0000000-0000-4000-8000-0000000000b0', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Compañero');
-- F no puede expulsar a nadie
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
delete from public.hogar_miembros where user_id in ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b');
delete from public.hogares;
reset role;
select pg_temp.comprobar((select count(*) from public.hogar_miembros) = 3 and exists (select 1 from public.hogares), 'F expulsa o borra el hogar');
-- A expulsa a F: deja de ver el hogar al momento
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
delete from public.hogar_miembros where user_id = 'ffffffff-0000-4000-8000-00000000000f';
-- A no puede quitarse a sí mismo (tiene que borrar el hogar)
delete from public.hogar_miembros where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a';
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar((select count(*) from public.hogares) = 0 and (select count(*) from public.hogar_miembros) = 0, 'el expulsado sigue viendo el hogar');
-- B sale por su cuenta
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
delete from public.hogar_miembros where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b';
reset role;
select pg_temp.comprobar((select array_agg(user_id) from public.hogar_miembros) = array['aaaaaaaa-0000-4000-8000-00000000000a'::uuid],
  'no queda solo el dueño');
-- El dueño no cambia aunque se intente
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
update public.hogares set user_id = 'bbbbbbbb-0000-4000-8000-00000000000b', nombre = 'Hogar';
reset role;
select pg_temp.comprobar((select user_id from public.hogares) = 'aaaaaaaa-0000-4000-8000-00000000000a', 'el dueño ha cambiado');

-- @fin
rollback;
