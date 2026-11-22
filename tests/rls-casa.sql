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
insert into public.emails_permitidos (email) values ('casa-a@rls.test'), ('casa-b@rls.test');
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'casa-a@rls.test'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'casa-b@rls.test');

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

-- @fin
rollback;
