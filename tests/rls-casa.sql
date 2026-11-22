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
-- El nombre que ven los demás miembros sale de la identidad de Google (no de user_metadata)
insert into auth.identities (user_id, provider, identity_data) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'google', '{"full_name": "Autor"}'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'google', '{"full_name": "Compañero"}'),
  ('ffffffff-0000-4000-8000-00000000000f', 'google', '{"full_name": "Familiar"}');

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
  and permissive = 'RESTRICTIVE') = 18, 'falta la política solo_cuentas_normales en alguna tabla');
-- Y ninguna tabla de Mi Panel con RLS se queda sin ella, salvo las de la compra y las de la web de exámenes
select pg_temp.comprobar(not exists (
  select 1 from pg_tables t
  where t.schemaname = 'public' and t.rowsecurity
    and t.tablename not in ('compra_mia', 'emails_permitidos', 'cuentas_solo_lista', 'borrados', 'perfiles', 'modulos', 'resultados_aprendizaje',
      'evaluaciones', 'evaluacion_ra', 'temas', 'archivos', 'chuletas', 'faltas', 'fe_registros', 'examenes_ia', 'flashcards', 'pomodoro_sesiones', 'uso_ia')
    and t.tablename not like 'hogar%' and t.tablename not like 'compra_%' and t.tablename not like 'borrados_%'
    -- del agente: agentes (cada agente lee su fila), codigos_vinculacion (su propia restrictiva) y vinculacion_intentos (nadie)
    and t.tablename not in ('agentes', 'codigos_vinculacion', 'vinculacion_intentos')
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

-- @caso: lista de casa: los miembros la ven y la editan; alguien de fuera no ve nada
reset role;
insert into public.hogares (id, user_id) values ('a0000000-0000-4000-8000-0000000000b0', 'aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogar_miembros (hogar_id, user_id, nombre) values ('a0000000-0000-4000-8000-0000000000b0', 'ffffffff-0000-4000-8000-00000000000f', 'Familiar');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.compra_casa (id, hogar_id, nombre, seccion) values ('a0000000-0000-4000-8000-0000000000e0', 'a0000000-0000-4000-8000-0000000000b0', 'Leche', 'lacteos');
-- F (familiar, miembro) la ve, la edita y la marca
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar((select count(*) from public.compra_casa) = 1, 'F no ve la lista de casa');
update public.compra_casa set cantidad = '2 l', comprado = true where id = 'a0000000-0000-4000-8000-0000000000e0';
insert into public.compra_casa (hogar_id, nombre) values ('a0000000-0000-4000-8000-0000000000b0', 'Pan');
reset role;
select pg_temp.comprobar((select cantidad from public.compra_casa where id = 'a0000000-0000-4000-8000-0000000000e0') = '2 l', 'F no puede editar');
select pg_temp.comprobar((select marcado_por from public.compra_casa where id = 'a0000000-0000-4000-8000-0000000000e0') = 'ffffffff-0000-4000-8000-00000000000f'
  and (select comprado_en from public.compra_casa where id = 'a0000000-0000-4000-8000-0000000000e0') is not null, 'no queda quién lo marcó');
select pg_temp.comprobar((select user_id from public.compra_casa where id = 'a0000000-0000-4000-8000-0000000000e0') = 'aaaaaaaa-0000-4000-8000-00000000000a', 'cambia quién lo apuntó');
-- B (de fuera) no ve ni toca nada, ni puede meter artículos en el hogar
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar((select count(*) from public.compra_casa) = 0, 'B ve la lista de casa');
update public.compra_casa set nombre = 'pirata';
delete from public.compra_casa;
select pg_temp.debe_fallar($q$insert into public.compra_casa (hogar_id, nombre) values ('a0000000-0000-4000-8000-0000000000b0', 'x')$q$, array['42501'], 'B apunta en un hogar ajeno');
select pg_temp.comprobar((select count(*) from public.borrados_hogar) = 0, 'B ve los borrados del hogar');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select * from public.compra_casa$q$, array['42501'], 'anon lee la lista de casa');
reset role;
select pg_temp.comprobar((select count(*) from public.compra_casa) = 2 and not exists (select 1 from public.compra_casa where nombre = 'pirata'), 'B ha tocado la lista');

-- @caso: lista de casa: marcado_por no se puede falsear ni se puede mover un artículo a otro hogar
reset role;
insert into public.hogares (id, user_id) values ('a0000000-0000-4000-8000-0000000000b0', 'aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogares (id, user_id) values ('b0000000-0000-4000-8000-0000000000b0', 'bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.hogar_miembros (hogar_id, user_id, nombre) values ('a0000000-0000-4000-8000-0000000000b0', 'ffffffff-0000-4000-8000-00000000000f', 'Familiar');
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
insert into public.compra_casa (id, hogar_id, nombre, comprado, marcado_por)
  values ('f0000000-0000-4000-8000-0000000000e0', 'a0000000-0000-4000-8000-0000000000b0', 'Sal', true, 'aaaaaaaa-0000-4000-8000-00000000000a');
update public.compra_casa set hogar_id = 'b0000000-0000-4000-8000-0000000000b0' where id = 'f0000000-0000-4000-8000-0000000000e0';
reset role;
select pg_temp.comprobar((select marcado_por from public.compra_casa where id = 'f0000000-0000-4000-8000-0000000000e0') = 'ffffffff-0000-4000-8000-00000000000f', 'se puede falsear marcado_por');
select pg_temp.comprobar((select hogar_id from public.compra_casa where id = 'f0000000-0000-4000-8000-0000000000e0') = 'a0000000-0000-4000-8000-0000000000b0', 'el artículo cambia de hogar');
-- Desmarcar borra quién lo marcó
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
update public.compra_casa set comprado = false where id = 'f0000000-0000-4000-8000-0000000000e0';
reset role;
select pg_temp.comprobar((select marcado_por is null and comprado_en is null from public.compra_casa where id = 'f0000000-0000-4000-8000-0000000000e0'), 'desmarcar deja quién lo marcó');

-- @caso: lista de casa: un borrado le llega a todos los miembros (borrados_hogar) y no revive
reset role;
insert into public.hogares (id, user_id) values ('a0000000-0000-4000-8000-0000000000b0', 'aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogar_miembros (hogar_id, user_id, nombre) values ('a0000000-0000-4000-8000-0000000000b0', 'ffffffff-0000-4000-8000-00000000000f', 'Familiar');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.compra_casa (id, hogar_id, nombre) values ('a0000000-0000-4000-8000-0000000000e1', 'a0000000-0000-4000-8000-0000000000b0', 'Huevos');
-- F borra algo que no es suyo
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
delete from public.compra_casa where id = 'a0000000-0000-4000-8000-0000000000e1';
-- A se entera por borrados_hogar (en `borrados` no hay nada: no es de nadie en concreto)
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.comprobar(exists (select 1 from public.borrados_hogar where tabla = 'compra_casa' and fila_id = 'a0000000-0000-4000-8000-0000000000e1'), 'A no se entera del borrado');
-- A, sin conexión, lo había editado: al subirlo no revive
insert into public.compra_casa (id, hogar_id, nombre) values ('a0000000-0000-4000-8000-0000000000e1', 'a0000000-0000-4000-8000-0000000000b0', 'Huevos (12)')
  on conflict (id) do update set nombre = excluded.nombre;
reset role;
select pg_temp.comprobar(not exists (select 1 from public.compra_casa where id = 'a0000000-0000-4000-8000-0000000000e1'), 'un artículo borrado revive');
select pg_temp.debe_fallar($q$set local role authenticated; insert into public.borrados_hogar (hogar_id, tabla, fila_id) values ('a0000000-0000-4000-8000-0000000000b0', 'x', gen_random_uuid())$q$,
  array['42501'], 'un usuario escribe en borrados_hogar');

-- @caso: lista de casa: un expulsado deja de verla al momento, también los borrados; si se borra el hogar se va todo
reset role;
insert into public.hogares (id, user_id) values ('a0000000-0000-4000-8000-0000000000b0', 'aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogar_miembros (hogar_id, user_id, nombre) values ('a0000000-0000-4000-8000-0000000000b0', 'ffffffff-0000-4000-8000-00000000000f', 'Familiar');
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
insert into public.compra_casa (id, hogar_id, nombre) values ('f0000000-0000-4000-8000-0000000000e2', 'a0000000-0000-4000-8000-0000000000b0', 'Lo puso F');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.compra_casa (id, hogar_id, nombre) values ('a0000000-0000-4000-8000-0000000000e3', 'a0000000-0000-4000-8000-0000000000b0', 'Borrado');
delete from public.compra_casa where id = 'a0000000-0000-4000-8000-0000000000e3';
delete from public.hogar_miembros where user_id = 'ffffffff-0000-4000-8000-00000000000f';
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar((select count(*) from public.compra_casa) = 0, 'el expulsado sigue viendo la lista (ni siquiera lo que él puso)');
select pg_temp.comprobar((select count(*) from public.borrados_hogar) = 0, 'el expulsado sigue viendo los borrados');
update public.compra_casa set nombre = 'venganza';
delete from public.compra_casa;
select pg_temp.debe_fallar($q$insert into public.compra_casa (hogar_id, nombre) values ('a0000000-0000-4000-8000-0000000000b0', 'x')$q$, array['42501'], 'el expulsado apunta');
reset role;
select pg_temp.comprobar((select nombre from public.compra_casa where id = 'f0000000-0000-4000-8000-0000000000e2') = 'Lo puso F', 'el expulsado ha tocado la lista');
-- A borra el hogar: se van la lista y sus borrados
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
delete from public.hogares where id = 'a0000000-0000-4000-8000-0000000000b0';
reset role;
select pg_temp.comprobar(not exists (select 1 from public.compra_casa) and not exists (select 1 from public.borrados_hogar), 'quedan restos del hogar borrado');

-- @caso: lista de casa: marcar cuenta en lo más comprado de quien marca, y un familiar no lee nada más
reset role;
insert into public.hogares (id, user_id) values ('a0000000-0000-4000-8000-0000000000b0', 'aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogar_miembros (hogar_id, user_id, nombre) values ('a0000000-0000-4000-8000-0000000000b0', 'ffffffff-0000-4000-8000-00000000000f', 'Familiar');
insert into public.puente (user_id, tipo, contenido) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'texto', 'secreto de A');
insert into public.compra_mia (user_id, nombre) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'privado de A');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.compra_casa (id, hogar_id, nombre) values ('a0000000-0000-4000-8000-0000000000e4', 'a0000000-0000-4000-8000-0000000000b0', 'Arroz');
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
update public.compra_casa set comprado = true where id = 'a0000000-0000-4000-8000-0000000000e4';
select pg_temp.comprobar((select veces from public.compra_frecuentes where clave = 'arroz') = 1, 'no cuenta para F');
select pg_temp.comprobar((select count(*) from public.puente) = 0 and (select count(*) from public.compra_mia) = 0, 'F ve el Puente o Mi lista de A');
reset role;
select pg_temp.comprobar(not exists (select 1 from public.compra_frecuentes where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 'cuenta para A lo que marcó F');

-- @caso: familiar (tester): no lee NINGUNA tabla con la política restrictiva, aunque haya filas suyas
reset role;
-- Una fila a nombre de F en CADA tabla con la restrictiva (como si las hubiera puesto el administrador)
insert into public.habitos (id, user_id, nombre) values ('f0000000-0000-4000-8000-0000000000a1', 'ffffffff-0000-4000-8000-00000000000f', 'x');
insert into public.habito_marcas (user_id, habito_id, fecha) values ('ffffffff-0000-4000-8000-00000000000f', 'f0000000-0000-4000-8000-0000000000a1', '2026-11-22');
insert into public.tareas (user_id, texto) values ('ffffffff-0000-4000-8000-00000000000f', 'x');
insert into public.movimientos (user_id, tipo, concepto, importe_centimos, fecha) values ('ffffffff-0000-4000-8000-00000000000f', 'gasto', 'x', 100, '2026-11-22');
insert into public.movimientos_fijos (user_id, tipo, concepto, importe_centimos, categoria, dia, desde)
  values ('ffffffff-0000-4000-8000-00000000000f', 'gasto', 'x', 100, 'salud', 5, '2026-11');
insert into public.traspasos (user_id, sentido, importe_centimos, fecha) values ('ffffffff-0000-4000-8000-00000000000f', 'sacar', 100, '2026-11-22');
insert into public.revisiones (user_id, tipo, inicio, fin, datos) values ('ffffffff-0000-4000-8000-00000000000f', 'semanal', '2026-11-16', '2026-11-22', '{}');
insert into public.ideas (user_id, texto) values ('ffffffff-0000-4000-8000-00000000000f', 'x');
insert into public.cumpleanos (user_id, nombre, dia, mes) values ('ffffffff-0000-4000-8000-00000000000f', 'x', 1, 1);
insert into public.planes (user_id, titulo) values ('ffffffff-0000-4000-8000-00000000000f', 'x');
insert into public.deseos (user_id, articulo, precio_centimos) values ('ffffffff-0000-4000-8000-00000000000f', 'x', 100);
insert into public.clientes_web (user_id, nombre) values ('ffffffff-0000-4000-8000-00000000000f', 'x');
insert into public.suscripciones_push (user_id, endpoint, p256dh, auth) values ('ffffffff-0000-4000-8000-00000000000f', 'https://push.example/x', repeat('p', 87), repeat('a', 22));
insert into public.puente (user_id, tipo, contenido) values ('ffffffff-0000-4000-8000-00000000000f', 'texto', 'x');
-- comandos necesita un PC «de F» (como si el administrador lo hubiera creado)
insert into public.emails_permitidos (email) values ('agente-f@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('f9999999-0000-4000-8000-000000000009', 'agente-f@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre) values ('f9999999-0000-4000-8000-000000000009', 'ffffffff-0000-4000-8000-00000000000f', 'PC de F');
insert into public.comandos (user_id, agente_id, accion) values ('ffffffff-0000-4000-8000-00000000000f', 'f9999999-0000-4000-8000-000000000009', 'bloquear');
insert into public.red_dispositivos (id, user_id, mac) values ('f0000000-0000-4000-8000-0000000000d9', 'ffffffff-0000-4000-8000-00000000000f', '00:11:22:33:44:55');
insert into public.red_conexiones (dispositivo_id, user_id, desde, hasta) values ('f0000000-0000-4000-8000-0000000000d9', 'ffffffff-0000-4000-8000-00000000000f', now(), now());
insert into public.red_ultimo_aviso (user_id, cuando) values ('ffffffff-0000-4000-8000-00000000000f', now());
-- Si mañana se añade una tabla con la restrictiva, este caso pide añadir aquí su fila
do $$
declare t text; filas bigint;
begin
  for t in select distinct tablename from pg_policies where schemaname = 'public' and policyname = 'solo_cuentas_normales' loop
    execute format('select count(*) from public.%I where user_id = %L', t, 'ffffffff-0000-4000-8000-00000000000f') into filas;
    if filas = 0 then raise exception 'RLS FALLA: falta una fila de F en % para probarla', t; end if;
  end loop;
end $$;
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
do $$
declare t text; filas bigint;
begin
  for t in select distinct tablename from pg_policies where schemaname = 'public' and policyname = 'solo_cuentas_normales' loop
    begin
      execute format('select count(*) from public.%I', t) into filas;
    exception when insufficient_privilege then filas := 0;
    end;
    if filas <> 0 then raise exception 'RLS FALLA: el familiar lee % filas de %', filas, t; end if;
    update resultados set n = n + 1;
  end loop;
end $$;
-- `borrados` la comparte la web de exámenes (sin la restrictiva): F solo ve los de sus filas, nunca los de A
reset role;
insert into public.ideas (id, user_id, texto) values ('a0000000-0000-4000-8000-0000000000a9', 'aaaaaaaa-0000-4000-8000-00000000000a', 'de A');
delete from public.ideas;
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar(not exists (select 1 from public.borrados where fila_id = 'a0000000-0000-4000-8000-0000000000a9')
  and not exists (select 1 from public.borrados where user_id <> 'ffffffff-0000-4000-8000-00000000000f'), 'el familiar ve borrados de A');
-- Ni sube nada al Puente (Storage)
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name, metadata)
  values ('puente', 'ffffffff-0000-4000-8000-00000000000f/x/f', '{"size": 1}')$q$, array['42501'], 'el familiar sube un archivo al Puente');

-- @caso: mi lista (tester): ni los miembros del mismo hogar ven la Mi lista ni los frecuentes de los demás
reset role;
insert into public.hogares (id, user_id) values ('a0000000-0000-4000-8000-0000000000b0', 'aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogar_miembros (hogar_id, user_id, nombre) values ('a0000000-0000-4000-8000-0000000000b0', 'ffffffff-0000-4000-8000-00000000000f', 'Familiar');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.compra_mia (id, nombre, comprado, comprado_en) values ('a0000000-0000-4000-8000-0000000000c9', 'Regalo para F', true, now());
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
insert into public.compra_mia (id, nombre) values ('f0000000-0000-4000-8000-0000000000c9', 'Secreto de F');
select pg_temp.comprobar((select count(*) from public.compra_mia) = 1, 'F ve la Mi lista de otro miembro');
select pg_temp.comprobar((select count(*) from public.compra_frecuentes) = 0, 'F ve los frecuentes de otro miembro');
update public.compra_mia set nombre = 'pirata' where id = 'a0000000-0000-4000-8000-0000000000c9';
delete from public.compra_mia where id = 'a0000000-0000-4000-8000-0000000000c9';
select pg_temp.debe_fallar($q$insert into public.compra_mia (id, nombre) values ('a0000000-0000-4000-8000-0000000000c9', 'x') on conflict (id) do update set nombre = 'pirata'$q$,
  array['42501'], 'F pisa con un upsert la Mi lista de otro miembro');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.comprobar((select count(*) from public.compra_mia) = 1 and (select nombre from public.compra_mia) = 'Regalo para F', 'A ve la Mi lista de F o F ha tocado la de A');

-- @caso: lista de casa (tester): un miembro no apunta a nombre de otro, ni en un hogar ajeno, ni cambia quién lo apuntó
reset role;
insert into public.hogares (id, user_id) values ('a0000000-0000-4000-8000-0000000000b0', 'aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogares (id, user_id) values ('b0000000-0000-4000-8000-0000000000b0', 'bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.hogar_miembros (hogar_id, user_id, nombre) values ('a0000000-0000-4000-8000-0000000000b0', 'ffffffff-0000-4000-8000-00000000000f', 'Familiar');
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.debe_fallar($q$insert into public.compra_casa (hogar_id, nombre, user_id) values ('a0000000-0000-4000-8000-0000000000b0', 'x', 'aaaaaaaa-0000-4000-8000-00000000000a')$q$,
  array['42501'], 'F apunta a nombre de A');
select pg_temp.debe_fallar($q$insert into public.compra_casa (hogar_id, nombre) values ('b0000000-0000-4000-8000-0000000000b0', 'x')$q$,
  array['42501'], 'F apunta en el hogar de B');
insert into public.compra_casa (id, hogar_id, nombre) values ('f0000000-0000-4000-8000-0000000000e9', 'a0000000-0000-4000-8000-0000000000b0', 'Pan');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
update public.compra_casa set user_id = 'aaaaaaaa-0000-4000-8000-00000000000a', created_at = '2000-01-01' where id = 'f0000000-0000-4000-8000-0000000000e9';
reset role;
select pg_temp.comprobar((select user_id from public.compra_casa where id = 'f0000000-0000-4000-8000-0000000000e9') = 'ffffffff-0000-4000-8000-00000000000f'
  and (select created_at from public.compra_casa where id = 'f0000000-0000-4000-8000-0000000000e9') > '2001-01-01', 'cambia quién lo apuntó o cuándo');
-- Los borrados de un hogar no se ven desde otro
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.compra_casa (id, hogar_id, nombre) values ('b0000000-0000-4000-8000-0000000000e9', 'b0000000-0000-4000-8000-0000000000b0', 'De B');
delete from public.compra_casa where id = 'b0000000-0000-4000-8000-0000000000e9';
select pg_temp.comprobar((select count(*) from public.borrados_hogar) = 1, 'B no ve su borrado');
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar((select count(*) from public.borrados_hogar) = 0, 'F ve los borrados del hogar de B');
select pg_temp.comprobar((select count(*) from public.compra_casa) = 1, 'F ve la lista de otro hogar');
-- Una versión antigua (updated_at anterior) de otro miembro no pisa la nueva
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
update public.compra_casa set cantidad = 'nueva', updated_at = now() + interval '1 hour' where id = 'f0000000-0000-4000-8000-0000000000e9';
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
insert into public.compra_casa (id, hogar_id, nombre, cantidad, updated_at) values ('f0000000-0000-4000-8000-0000000000e9', 'a0000000-0000-4000-8000-0000000000b0', 'Pan', 'vieja', now())
  on conflict (id) do update set cantidad = excluded.cantidad, updated_at = excluded.updated_at;
reset role;
select pg_temp.comprobar((select cantidad from public.compra_casa where id = 'f0000000-0000-4000-8000-0000000000e9') = 'nueva', 'una versión antigua pisa la nueva');

-- @caso: lista de casa (tester): el expulsado que sube sus cambios pendientes (upsert del motor) recibe un error de RLS y no cambia nada
reset role;
insert into public.hogares (id, user_id) values ('a0000000-0000-4000-8000-0000000000b0', 'aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogar_miembros (hogar_id, user_id, nombre) values ('a0000000-0000-4000-8000-0000000000b0', 'ffffffff-0000-4000-8000-00000000000f', 'Familiar');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.compra_casa (id, hogar_id, nombre) values ('a0000000-0000-4000-8000-0000000000e7', 'a0000000-0000-4000-8000-0000000000b0', 'Leche');
delete from public.hogar_miembros where user_id = 'ffffffff-0000-4000-8000-00000000000f';
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.debe_fallar($q$insert into public.compra_casa (id, hogar_id, nombre, cantidad, updated_at)
  values ('a0000000-0000-4000-8000-0000000000e7', 'a0000000-0000-4000-8000-0000000000b0', 'Leche', 'venganza', now() + interval '1 day')
  on conflict (id) do update set cantidad = excluded.cantidad, updated_at = excluded.updated_at$q$, array['42501'], 'el expulsado edita con un upsert');
select pg_temp.debe_fallar($q$insert into public.compra_casa (hogar_id, nombre) values ('a0000000-0000-4000-8000-0000000000b0', 'nuevo')
  on conflict (id) do nothing$q$, array['42501'], 'el expulsado apunta con un upsert');
select pg_temp.comprobar(public.es_miembro('a0000000-0000-4000-8000-0000000000b0') = false, 'es_miembro dice que el expulsado sigue');
reset role;
select pg_temp.comprobar((select cantidad from public.compra_casa where id = 'a0000000-0000-4000-8000-0000000000e7') is null
  and (select count(*) from public.compra_casa) = 1, 'el expulsado ha cambiado la lista');

-- @caso: invitación (tester): un código usado no sirve ni al expulsado ni a otro; caduca justo en su hora; borrar el hogar lo anula
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogares (id) values ('a0000000-0000-4000-8000-0000000000b0');
create temporary table cod as select * from public.crear_invitacion();
create temporary table cod2 as select * from public.crear_invitacion();
create temporary table cod3 as select * from public.crear_invitacion();
grant select on cod, cod2, cod3 to authenticated;
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar(public.unirse_hogar((select codigo from cod)) = 'ok', 'F no entra');
-- F (miembro, no dueño) no crea ni ve ni anula invitaciones
select pg_temp.debe_fallar($q$select public.crear_invitacion()$q$, array['42501'], 'un miembro crea invitaciones');
select pg_temp.comprobar((select count(*) from public.hogar_invitaciones) = 0, 'un miembro ve las invitaciones');
delete from public.hogar_invitaciones;
-- Le expulsan y prueba otra vez con el mismo código
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.comprobar((select count(*) from public.hogar_invitaciones) = 3, 'un miembro ha anulado invitaciones');
delete from public.hogar_miembros where user_id = 'ffffffff-0000-4000-8000-00000000000f';
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar(public.unirse_hogar((select codigo from cod)) = 'usado', 'el expulsado vuelve con el código usado');
-- Caduca justo ahora: ya no vale (caduca_en <= now())
reset role;
update public.hogar_invitaciones set caduca_en = now()
  where codigo_hash = sha256(convert_to(public.normalizar_codigo((select codigo from cod2)), 'UTF8'));
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar(public.unirse_hogar((select codigo from cod2)) = 'caducado', 'un código vale en el instante en que caduca');
-- A borra el hogar: el último código ya no existe
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
delete from public.hogares;
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar(public.unirse_hogar((select codigo from cod3)) = 'invalido', 'un código de un hogar borrado sirve');
reset role;
select pg_temp.comprobar(not exists (select 1 from public.hogar_miembros), 'alguien ha entrado');

-- @caso: invitación (tester): con el tope de intentos alcanzado ni siquiera un código bueno sirve
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogares (id) values ('a0000000-0000-4000-8000-0000000000b0');
create temporary table cod as select * from public.crear_invitacion();
grant select on cod to authenticated;
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
do $$ begin for i in 1..10 loop perform public.unirse_hogar('ZZZZZ-ZZZZ' || i); end loop; end $$;
select pg_temp.comprobar(public.unirse_hogar((select codigo from cod)) = 'demasiados_intentos', 'el bueno entra tras 10 fallos');
-- Pasada la hora, sí
reset role;
update public.hogar_intentos set cuando = now() - interval '61 minutes';
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar(public.unirse_hogar((select codigo from cod)) = 'ok', 'pasada la hora el código bueno no sirve');
-- Nadie lee los intentos
select pg_temp.debe_fallar($q$select * from public.hogar_intentos$q$, array['42501'], 'B lee hogar_intentos');

-- @caso: hogar (tester): las funciones de ayuda no se pueden usar para espiar
reset role;
insert into public.hogares (id, user_id) values ('a0000000-0000-4000-8000-0000000000b0', 'aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select public.es_miembro('a0000000-0000-4000-8000-0000000000b0')$q$, array['42501'], 'anon usa es_miembro');
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar(public.es_miembro('a0000000-0000-4000-8000-0000000000b0') = false, 'B es miembro de un hogar ajeno');
select pg_temp.comprobar(public.es_dueno_hogar('a0000000-0000-4000-8000-0000000000b0') = false, 'B es dueño de un hogar ajeno');
select pg_temp.debe_fallar($q$select public.nombre_de_usuario('aaaaaaaa-0000-4000-8000-00000000000a')$q$, array['42501'], 'B pregunta el nombre de cualquiera');
select pg_temp.debe_fallar($q$select public.despues_de_borrar_hogar()$q$, array['42501', '0A000'], 'B llama a una función de trigger');
select pg_temp.comprobar((select count(*) from public.hogar_avisos) = 0, 'B ve avisos ajenos');
-- B no se puede apuntar en hogar_miembros ni cambiar su nombre en el hogar de otro
select pg_temp.debe_fallar($q$update public.hogar_miembros set nombre = 'x'$q$, array['42501'], 'B cambia hogar_miembros');
select pg_temp.debe_fallar($q$insert into public.hogar_avisos (user_id) values ('aaaaaaaa-0000-4000-8000-00000000000a')$q$, array['42501'], 'B crea avisos');

-- @caso: hogar: se puede borrar la cuenta de un miembro y la del dueño (los avisos no lo impiden)
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.hogares (id) values ('a0000000-0000-4000-8000-0000000000b0');
create temporary table cod as select * from public.crear_invitacion();
grant select on cod to authenticated;
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar(public.unirse_hogar((select codigo from cod)) = 'ok', 'F no entra');
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar((select count(*) from public.hogar_avisos) = 0, 'B ve avisos ajenos');
reset role;
-- Borrar la cuenta del miembro
delete from auth.users where id = 'ffffffff-0000-4000-8000-00000000000f';
select pg_temp.comprobar(not exists (select 1 from public.hogar_miembros where user_id = 'ffffffff-0000-4000-8000-00000000000f'), 'queda el miembro borrado');
-- Al dueño le llega el aviso de que alguien ha salido
select pg_temp.comprobar(exists (select 1 from public.hogar_avisos where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 'el dueño no recibe aviso');
-- Borrar la cuenta del dueño se lleva el hogar
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-00000000000a';
select pg_temp.comprobar(not exists (select 1 from public.hogares) and not exists (select 1 from public.hogar_miembros), 'queda el hogar del dueño borrado');

-- @caso: agente: no lee ninguna tabla de Mi Panel ni de la compra; solo su fila y el Puente de su dueño
reset role;
-- Como la Edge Function: su email se permite justo para crearlo y se quita después
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
delete from public.emails_permitidos where email = 'agente-1@agente.invalid';
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');
insert into public.habitos (user_id, nombre) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'de A');
insert into public.tareas (user_id, texto) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'de A');
insert into public.movimientos (user_id, tipo, concepto, importe_centimos, fecha) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'gasto', 'x', 100, '2026-11-22');
insert into public.compra_mia (user_id, nombre) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'de A');
insert into public.puente (user_id, tipo, contenido) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'texto', 'para el PC');
insert into public.puente (user_id, tipo, contenido) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'texto', 'de B');
insert into public.agentes (id, user_id, nombre) select '88888888-0000-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-00000000000b', 'PC de B'
  where false; -- (solo para documentar: otro agente sería de otro dueño)
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar(public.tipo_cuenta() = 'agente', 'no es agente');
select pg_temp.comprobar((select count(*) from public.habitos) = 0 and (select count(*) from public.tareas) = 0
  and (select count(*) from public.movimientos) = 0 and (select count(*) from public.compra_mia) = 0, 'el agente lee datos de su dueño');
select pg_temp.comprobar((select array_agg(contenido) from public.puente) = array['para el PC'], 'el agente no ve solo el Puente de su dueño');
select pg_temp.comprobar((select count(*) from public.agentes) = 1, 'el agente no ve solo su fila');
select pg_temp.debe_fallar($q$insert into public.puente (tipo, contenido, user_id) values ('texto', 'x', 'aaaaaaaa-0000-4000-8000-00000000000a')$q$, array['42501'], 'el agente escribe en el Puente directamente');
update public.puente set contenido = 'cambiado';
delete from public.puente;
select pg_temp.debe_fallar($q$insert into public.tareas (texto) values ('x')$q$, array['42501'], 'el agente crea tareas');
select pg_temp.debe_fallar($q$insert into public.compra_mia (nombre) values ('x')$q$, array['42501'], 'el agente usa la lista');
select pg_temp.debe_fallar($q$insert into public.hogares (nombre) values ('x')$q$, array['42501'], 'el agente crea un hogar');
-- Su fila no la puede tocar (ni el nombre ni el latido) salvo con agente_latido
select pg_temp.debe_fallar($q$update public.agentes set ultimo_latido = now() + interval '1 year'$q$, array['42501'], 'el agente falsea su latido');
update public.agentes set nombre = 'otro';
select pg_temp.debe_fallar($q$select public.crear_codigo_vinculacion()$q$, array['42501'], 'el agente vincula otro PC');
reset role;
select pg_temp.comprobar((select contenido from public.puente where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a') = 'para el PC', 'el agente ha tocado el Puente');
select pg_temp.comprobar((select nombre from public.agentes) = 'PC casa' and (select ultimo_latido from public.agentes) is null, 'el agente ha cambiado su fila');

-- @caso: agente: latido y mandar al Puente solo con sus funciones; desvincular le quita todo al momento
reset role;
-- Como la Edge Function: su email se permite justo para crearlo y se quita después
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
delete from public.emails_permitidos where email = 'agente-1@agente.invalid';
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select public.agente_latido(array['Firefox', ' Steam ', '', E'mal\nnombre'], '0.1.0');
select public.agente_enviar_puente('  https://ejemplo.com/x  ');
select public.agente_enviar_puente(E'linea 1\nlinea 2');
select pg_temp.debe_fallar($q$select public.agente_enviar_puente('   ')$q$, array['23514'], 'mandar vacío');
reset role;
select pg_temp.comprobar((select apps from public.agentes) = array['Firefox', 'Steam'] and (select ultimo_latido from public.agentes) is not null, 'el latido no guarda bien');
select pg_temp.comprobar((select count(*) from public.puente where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and dispositivo = 'PC casa') = 2
  and exists (select 1 from public.puente where tipo = 'enlace' and contenido = 'https://ejemplo.com/x'), 'agente_enviar_puente no manda bien');
-- Una cuenta normal no puede usar las funciones del agente
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$select public.agente_latido('{}', null)$q$, array['42501'], 'una cuenta normal usa agente_latido');
select pg_temp.debe_fallar($q$select public.agente_enviar_puente('x')$q$, array['42501'], 'una cuenta normal usa agente_enviar_puente');
-- El dueño lo desvincula (borra la fila): al momento, el agente ya no ve ni hace nada, y sigue sin ser cuenta normal
delete from public.agentes where id = '99999999-0000-4000-8000-000000000009';
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar(public.tipo_cuenta() = 'agente', 'un agente desvinculado pasa a ser cuenta normal');
select pg_temp.comprobar((select count(*) from public.puente) = 0, 'el agente desvinculado sigue viendo el Puente');
select pg_temp.debe_fallar($q$select public.agente_latido('{}', null)$q$, array['42501'], 'el agente desvinculado manda latidos');
select pg_temp.debe_fallar($q$select public.agente_enviar_puente('x')$q$, array['42501'], 'el agente desvinculado manda al Puente');
select pg_temp.debe_fallar($q$insert into public.tareas (texto) values ('x')$q$, array['42501'], 'el agente desvinculado crea tareas');

-- @caso: agentes: el dueño ve y renombra sus PC; nadie más los ve; nadie los crea desde la app
reset role;
-- Como la Edge Function: su email se permite justo para crearlo y se quita después
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
delete from public.emails_permitidos where email = 'agente-1@agente.invalid';
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
update public.agentes set nombre = 'Sobremesa';
select pg_temp.debe_fallar($q$update public.agentes set ultimo_latido = now()$q$, array['42501'], 'el dueño falsea el latido');
select pg_temp.debe_fallar($q$update public.agentes set user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'$q$, array['42501'], 'el dueño regala su PC');
select pg_temp.debe_fallar($q$insert into public.agentes (id, user_id, nombre) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'aaaaaaaa-0000-4000-8000-00000000000a', 'x')$q$, array['42501'], 'crear un agente desde la app');
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar((select count(*) from public.agentes) = 0, 'B ve los PC de A');
delete from public.agentes;
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.debe_fallar($q$select public.crear_codigo_vinculacion()$q$, array['42501'], 'un familiar vincula un PC');
reset role;
select pg_temp.comprobar((select nombre from public.agentes) = 'Sobremesa', 'el dueño no puede renombrar o B ha borrado');

-- @caso: vincular: código de un solo uso que caduca en 10 minutos; solo la service role lo gasta; tope de intentos
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
create temporary table cv as select * from public.crear_codigo_vinculacion();
grant select on cv to authenticated, service_role;
select pg_temp.comprobar((select codigo from cv) ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$', 'formato del código');
select pg_temp.comprobar((select caduca_en from cv) between now() + interval '9 minutes' and now() + interval '11 minutes', 'no caduca en 10 minutos');
select pg_temp.debe_fallar($q$select codigo_hash from public.codigos_vinculacion$q$, array['42501'], 'leer el hash');
select pg_temp.debe_fallar($q$select public.usar_codigo_vinculacion((select codigo from cv))$q$, array['42501'], 'un usuario gasta el código');
select public.crear_codigo_vinculacion(); select public.crear_codigo_vinculacion();
select pg_temp.debe_fallar($q$select public.crear_codigo_vinculacion()$q$, array['23514'], 'un cuarto código activo');
select pg_temp.como('service');
select pg_temp.comprobar(public.usar_codigo_vinculacion(lower((select codigo from cv))) = 'aaaaaaaa-0000-4000-8000-00000000000a', 'el código no sirve');
select pg_temp.comprobar(public.usar_codigo_vinculacion((select codigo from cv)) is null, 'el código sirve dos veces');
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
create temporary table cv2 as select * from public.crear_codigo_vinculacion();
grant select on cv2 to service_role;
reset role;
update public.codigos_vinculacion set caduca_en = now() - interval '1 second' where usado_en is null;
select pg_temp.como('service');
select pg_temp.comprobar(public.usar_codigo_vinculacion((select codigo from cv2)) is null, 'un código caducado sirve');
do $$ begin for i in 1..30 loop perform public.usar_codigo_vinculacion('ZZZZZZZ' || i); end loop; end $$;
reset role;
update public.codigos_vinculacion set caduca_en = now() + interval '5 minutes' where id = (select id from public.codigos_vinculacion where usado_en is null limit 1);
-- con 30 fallos en 10 minutos, nada sirve (ni un código bueno)
select pg_temp.como('service');
select pg_temp.comprobar(public.usar_codigo_vinculacion((select codigo from cv2)) is null, 'no hay tope de intentos');

-- @caso: agente: tampoco es cuenta de la web de exámenes, ni de Storage, ni de Gemini
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"provider": "email", "tipo": "agente"}');
delete from public.emails_permitidos where email = 'agente-1@agente.invalid';
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.debe_fallar($q$insert into public.modulos (nombre, abreviatura) values ('x', 'X')$q$, array['42501'], 'el agente crea módulos (web de exámenes)');
select pg_temp.debe_fallar($q$insert into public.perfiles (nombre) values ('x')$q$, array['42501'], 'el agente crea un perfil');
select pg_temp.debe_fallar($q$insert into public.borrados (user_id, tabla, fila_id) values (auth.uid(), 'x', gen_random_uuid())$q$, array['42501'], 'el agente escribe en borrados');
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name) values ('temarios', '99999999-0000-4000-8000-000000000009/x/a.pdf')$q$, array['42501'], 'el agente sube a temarios');
select pg_temp.comprobar(public.inicializar_cuenta() = false, 'inicializar_cuenta crea algo al agente');
select pg_temp.como('service');
select pg_temp.comprobar(public.sumar_uso_ia('99999999-0000-4000-8000-000000000009', 100) is null, 'el agente puede gastar Gemini');
select pg_temp.comprobar(public.sumar_uso_ia('aaaaaaaa-0000-4000-8000-00000000000a', 100) = 1, 'una cuenta normal no puede usar Gemini');
-- Toda tabla de public con RLS cierra el paso a los agentes (salvo agentes y puente, que tienen las suyas)
reset role;
select pg_temp.comprobar(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname not in ('agentes', 'puente')
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.permissive = 'RESTRICTIVE'
                    and p.policyname in ('solo_cuentas_normales', 'sin_agentes'))),
  'una tabla de public no cierra el paso a los agentes: ' || coalesce((
    select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname not in ('agentes', 'puente')
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.permissive = 'RESTRICTIVE'
                      and p.policyname in ('solo_cuentas_normales', 'sin_agentes'))), ''));

-- @caso: agente: con el usuario ya borrado, su token (que vale hasta una hora) sigue siendo de agente
reset role;
-- Sin fila en agentes ni en auth.users: solo queda el token, con app_metadata firmado por el servidor
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub": "77777777-0000-4000-8000-000000000007", "role": "authenticated", "app_metadata": {"tipo": "agente"}}', true);
select pg_temp.comprobar(public.tipo_cuenta() = 'agente', 'un token de agente borrado pasa a cuenta normal');
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name) values ('temarios', '77777777-0000-4000-8000-000000000007/x/a.pdf')$q$, array['42501'], 'el token huérfano sube a temarios');
select pg_temp.debe_fallar($q$insert into public.tareas (texto) values ('x')$q$, array['42501', '23503'], 'el token huérfano crea tareas');

-- @caso: solo se crean cuentas de Google (o agentes): email y contraseña no, ni siquiera con un email permitido
reset role;
insert into public.emails_permitidos (email) values ('companero-nuevo@rls.test');
select pg_temp.debe_fallar($q$insert into auth.users (id, email, raw_app_meta_data) values (gen_random_uuid(), 'companero-nuevo@rls.test', '{"provider": "email", "providers": ["email"]}')$q$,
  array['42501'], 'alta con email y contraseña de un email permitido');
-- un email de agente sin la marca se deja crear (GoTrue la pone en otro paso), pero es de agente: ver tests/rls-agente.sql
-- Google sí
insert into auth.users (id, email, raw_app_meta_data) values (gen_random_uuid(), 'companero-nuevo@rls.test', '{"provider": "google", "providers": ["google"]}');

-- @caso: limpieza de vincular a medias: emails de agente olvidados y usuarios agente sin fila (solo la service role)
reset role;
insert into public.emails_permitidos (email, created_at) values ('agente-viejo@agente.invalid', now() - interval '1 hour'), ('agente-nuevo@agente.invalid', now());
insert into public.emails_permitidos (email) values ('agente-2@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data, created_at) values ('66666666-0000-4000-8000-000000000006', 'agente-2@agente.invalid', '{"provider": "email", "tipo": "agente"}', now() - interval '1 hour');
delete from public.emails_permitidos where email = 'agente-2@agente.invalid';
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$select public.agentes_huerfanos()$q$, array['42501'], 'un usuario usa la limpieza de agentes');
select pg_temp.como('service');
select pg_temp.comprobar((select array_agg(h) from public.agentes_huerfanos() h) = array['66666666-0000-4000-8000-000000000006'::uuid], 'no encuentra el agente huérfano');
reset role;
select pg_temp.comprobar(not exists (select 1 from public.emails_permitidos where email = 'agente-viejo@agente.invalid')
  and exists (select 1 from public.emails_permitidos where email = 'agente-nuevo@agente.invalid'), 'no limpia bien los emails de agente');

-- @caso: mando: el dueño manda órdenes a SU PC (lista fija); nadie más; el agente no las crea
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre, apps) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa', array['Firefox']);
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.comandos (agente_id, accion) values ('99999999-0000-4000-8000-000000000009', 'bloquear');
insert into public.comandos (agente_id, accion, valor) values ('99999999-0000-4000-8000-000000000009', 'volumen', '40');
insert into public.comandos (agente_id, accion, valor) values ('99999999-0000-4000-8000-000000000009', 'abrir_app', 'Firefox');
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion, valor) values ('99999999-0000-4000-8000-000000000009', 'abrir_app', 'rm -rf ~')$q$, array['23514'], 'abrir una app que el PC no conoce');
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion, valor) values ('99999999-0000-4000-8000-000000000009', 'ejecutar', 'ls')$q$, array['23514'], 'una acción fuera de la lista');
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion, valor) values ('99999999-0000-4000-8000-000000000009', 'volumen', '101')$q$, array['23514'], 'volumen fuera de rango');
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion, valor) values ('99999999-0000-4000-8000-000000000009', 'apagar', 'ahora')$q$, array['23514'], 'apagar con valor');
select pg_temp.debe_fallar($q$update public.comandos set estado = 'hecho'$q$, array['42501'], 'el dueño cambia el estado');
-- B no manda órdenes al PC de A ni las ve
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion) values ('99999999-0000-4000-8000-000000000009', 'apagar')$q$, array['42501'], 'B apaga el PC de A');
select pg_temp.debe_fallar($q$insert into public.comandos (user_id, agente_id, accion) values ('aaaaaaaa-0000-4000-8000-00000000000a', '99999999-0000-4000-8000-000000000009', 'apagar')$q$, array['42501'], 'B manda a nombre de A');
select pg_temp.comprobar((select count(*) from public.comandos) = 0, 'B ve las órdenes de A');
-- El familiar tampoco
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion) values ('99999999-0000-4000-8000-000000000009', 'apagar')$q$, array['42501'], 'el familiar apaga el PC');
-- El agente ve las suyas pero no crea ni cambia ninguna directamente
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar((select count(*) from public.comandos) = 3, 'el agente no ve sus órdenes');
select pg_temp.debe_fallar($q$insert into public.comandos (user_id, agente_id, accion) values ('aaaaaaaa-0000-4000-8000-00000000000a', '99999999-0000-4000-8000-000000000009', 'apagar')$q$, array['42501'], 'el agente se manda órdenes');
select pg_temp.debe_fallar($q$update public.comandos set estado = 'hecho'$q$, array['42501'], 'el agente cambia estados directamente');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select * from public.comandos$q$, array['42501'], 'anon lee órdenes');

-- @caso: mando: el agente coge cada orden una sola vez, solo si no ha caducado (30 s), y cuenta el resultado
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid'), ('agente-2@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values
  ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}'),
  ('88888888-0000-4000-8000-000000000008', 'agente-2@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre) values
  ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa'),
  ('88888888-0000-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-00000000000b', 'PC de B');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.comandos (id, agente_id, accion, caduca_en, estado) values ('c0000000-0000-4000-8000-000000000001', '99999999-0000-4000-8000-000000000009', 'bloquear', now() + interval '1 year', 'hecho');
insert into public.comandos (id, agente_id, accion) values ('c0000000-0000-4000-8000-000000000002', '99999999-0000-4000-8000-000000000009', 'play_pausa');
reset role;
select pg_temp.comprobar((select estado = 'pendiente' and caduca_en <= now() + interval '31 seconds' from public.comandos where id = 'c0000000-0000-4000-8000-000000000001'),
  'la app decide el estado o la caducidad');
-- La primera ya caducó (como si el PC hubiera estado apagado)
update public.comandos set caduca_en = now() - interval '1 second' where id = 'c0000000-0000-4000-8000-000000000001';
-- El agente de B no puede coger las de A
select pg_temp.como('88888888-0000-4000-8000-000000000008');
select pg_temp.comprobar((select count(*) from public.agente_tomar_comando('c0000000-0000-4000-8000-000000000002')) = 0, 'el agente de B coge una orden de A');
select pg_temp.comprobar((select count(*) from public.comandos) = 0, 'el agente de B ve órdenes de A');
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar((select array_agg(x) from public.agente_comandos_pendientes() x) = array['c0000000-0000-4000-8000-000000000002'::uuid], 'pendientes mal');
select pg_temp.comprobar((select accion from public.agente_tomar_comando('c0000000-0000-4000-8000-000000000002')) = 'play_pausa', 'no la coge');
select pg_temp.comprobar((select count(*) from public.agente_tomar_comando('c0000000-0000-4000-8000-000000000002')) = 0, 'la coge dos veces');
select pg_temp.comprobar((select count(*) from public.agente_tomar_comando('c0000000-0000-4000-8000-000000000001')) = 0, 'ejecuta una orden caducada');
select public.agente_resultado('c0000000-0000-4000-8000-000000000002', true, E'Hecho\n');
select public.agente_resultado('c0000000-0000-4000-8000-000000000001', true, 'trampa');
reset role;
select pg_temp.comprobar((select estado from public.comandos where id = 'c0000000-0000-4000-8000-000000000001') = 'caducado', 'la caducada no queda caducada');
select pg_temp.comprobar((select estado || '|' || mensaje from public.comandos where id = 'c0000000-0000-4000-8000-000000000002') = 'hecho|Hecho ', 'el resultado no se guarda bien');
-- Una cuenta normal no usa las funciones del agente
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$select public.agente_tomar_comando('c0000000-0000-4000-8000-000000000002')$q$, array['42501'], 'una cuenta normal coge órdenes');
select pg_temp.debe_fallar($q$select public.agente_resultado('c0000000-0000-4000-8000-000000000002', true)$q$, array['42501'], 'una cuenta normal pone resultados');

-- @caso: mando: tope de 30 órdenes por minuto y PC; desvincular borra sus órdenes
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.comandos (agente_id, accion) select '99999999-0000-4000-8000-000000000009', 'volumen_subir' from generate_series(1, 30);
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion) values ('99999999-0000-4000-8000-000000000009', 'volumen_subir')$q$, array['23514'], 'la orden 31 en un minuto');
delete from public.agentes where id = '99999999-0000-4000-8000-000000000009';
select pg_temp.comprobar((select count(*) from public.comandos) = 0, 'quedan órdenes de un PC desvinculado');

-- @caso: mando: el latido guarda el volumen (0-150) y si está silenciado
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select public.agente_latido(array['Firefox'], '0.2.0', 45, true);
reset role;
select pg_temp.comprobar((select volumen = 45 and silenciado from public.agentes), 'no guarda el volumen');
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select public.agente_latido('{}', null, 999, null);
reset role;
select pg_temp.comprobar((select volumen is null from public.agentes), 'acepta un volumen imposible');

-- @caso: red: el agente manda el escaneo; lo nuevo se cuenta para avisar una sola vez; MAC aleatorias
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar(public.agente_red('[{"mac": "A4:BB:CC:00:00:01", "ip": "192.168.1.10", "fabricante": "Router SA"}, {"mac": "da:00:00:00:00:02", "ip": "192.168.1.20"}, {"mac": "malo", "ip": "1.2.3.4"}, {"mac": "a4:bb:cc:00:00:01", "ip": "192.168.1.11"}]') = 2,
  'no cuenta 2 aparatos nuevos');
-- el agente no lee la red (solo la escribe con su función)
select pg_temp.comprobar((select count(*) from public.red_dispositivos) = 0, 'el agente lee la red');
reset role;
select pg_temp.comprobar((select count(*) from public.red_dispositivos) = 2, 'guarda aparatos de más o de menos');
select pg_temp.comprobar((select aleatoria from public.red_dispositivos where mac = 'da:00:00:00:00:02') and not (select aleatoria from public.red_dispositivos where mac = 'a4:bb:cc:00:00:01'), 'no detecta la MAC aleatoria');
-- Avisos: la service role los reserva una vez
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$select public.red_reservar_avisos('aaaaaaaa-0000-4000-8000-00000000000a')$q$, array['42501'], 'un usuario reserva avisos');
select pg_temp.como('service');
select pg_temp.comprobar((select count(*) from public.red_reservar_avisos('aaaaaaaa-0000-4000-8000-00000000000a')) = 2, 'no reserva los 2');
select pg_temp.comprobar((select count(*) from public.red_reservar_avisos('aaaaaaaa-0000-4000-8000-00000000000a')) = 0, 'repite el aviso');
-- Otro escaneo con los mismos (como si hubiera pasado un minuto): no hay nada nuevo que avisar; el que falta pasa a desconectado
reset role;
update public.agentes set ultimo_escaneo = null;
select pg_temp.como('99999999-0000-4000-8000-000000000009');

select pg_temp.comprobar(public.agente_red('[{"mac": "a4:bb:cc:00:00:01", "ip": "192.168.1.10"}]') = 0, 'vuelve a avisar de algo ya visto');
reset role;
select pg_temp.comprobar(not (select conectado from public.red_dispositivos where mac = 'da:00:00:00:00:02'), 'no pasa a desconectado');
select pg_temp.comprobar((select count(*) from public.red_conexiones c join public.red_dispositivos d on d.id = c.dispositivo_id where d.mac = 'a4:bb:cc:00:00:01') = 1,
  'dos escaneos seguidos no alargan el mismo intervalo');

-- @caso: red: el historial guarda intervalos y borra lo de más de 30 días
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select public.agente_red('[{"mac": "a4:bb:cc:00:00:01"}]');
reset role;
-- Como si el último escaneo hubiera sido hace una hora y hubiera uno de hace 40 días
update public.red_conexiones set desde = now() - interval '2 hours', hasta = now() - interval '1 hour';
insert into public.red_conexiones (dispositivo_id, user_id, desde, hasta)
  select id, user_id, now() - interval '41 days', now() - interval '40 days' from public.red_dispositivos;
reset role;
update public.agentes set ultimo_escaneo = null;
select pg_temp.como('99999999-0000-4000-8000-000000000009');

select public.agente_red('[{"mac": "a4:bb:cc:00:00:01"}]');
reset role;
select pg_temp.comprobar((select count(*) from public.red_conexiones) = 2, 'no abre un intervalo nuevo o no borra el viejo');
select pg_temp.comprobar(not exists (select 1 from public.red_conexiones where hasta < now() - interval '30 days'), 'queda historial de más de 30 días');

-- @caso: red: el dueño pone nombre, conocido y une aparatos; nadie más ve ni toca nada
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select public.agente_red('[{"mac": "a4:bb:cc:00:00:01"}, {"mac": "da:00:00:00:00:02"}]');
reset role;
insert into public.red_dispositivos (id, user_id, mac) values ('b0000000-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-00000000000b', '00:00:00:00:00:0b');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
update public.red_dispositivos set nombre = 'Router', conocido = true where mac = 'a4:bb:cc:00:00:01';
update public.red_dispositivos set unido_a = (select id from public.red_dispositivos where mac = 'a4:bb:cc:00:00:01') where mac = 'da:00:00:00:00:02';
select pg_temp.debe_fallar($q$update public.red_dispositivos set avisado = false$q$, array['42501'], 'el dueño reactiva avisos a mano');
select pg_temp.debe_fallar($q$update public.red_dispositivos set mac = '00:00:00:00:00:00'$q$, array['42501'], 'el dueño cambia una MAC');
select pg_temp.debe_fallar($q$update public.red_dispositivos set unido_a = 'b0000000-0000-4000-8000-0000000000d1' where mac = 'da:00:00:00:00:02'$q$, array['23503'], 'unir con un aparato de B');
select pg_temp.debe_fallar($q$insert into public.red_dispositivos (user_id, mac) values (auth.uid(), '11:11:11:11:11:11')$q$, array['42501'], 'el dueño inventa aparatos');
select pg_temp.debe_fallar($q$delete from public.red_conexiones$q$, array['42501'], 'el dueño borra el historial a mano');
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar((select count(*) from public.red_dispositivos) = 1 and (select count(*) from public.red_conexiones) = 0, 'B ve la red de A');
update public.red_dispositivos set nombre = 'pirata' where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a';
select pg_temp.como('ffffffff-0000-4000-8000-00000000000f');
select pg_temp.comprobar((select count(*) from public.red_dispositivos) = 0, 'el familiar ve la red');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$select public.agente_red('[]')$q$, array['42501'], 'una cuenta normal manda escaneos');
reset role;
select pg_temp.comprobar((select nombre from public.red_dispositivos where mac = 'a4:bb:cc:00:00:01') = 'Router'
  and (select unido_a is not null from public.red_dispositivos where mac = 'da:00:00:00:00:02'), 'el dueño no puede editar o B ha tocado');
-- Escaneos raros se rechazan
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.debe_fallar($q$select public.agente_red('{"mac": "x"}')$q$, array['23514'], 'un escaneo que no es una lista');
select pg_temp.debe_fallar($q$select public.agente_red((select jsonb_agg(jsonb_build_object('mac', 'aa:aa:aa:aa:aa:aa')) from generate_series(1, 513)))$q$, array['23514'], 'un escaneo enorme');

-- @caso: red: topes contra un agente comprometido (1 escaneo por minuto, 500 aparatos, avisos cada 5 minutos, olvidar desconocidos viejos)
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select public.agente_red('[{"mac": "a4:00:00:00:00:01"}]');
-- un segundo escaneo enseguida no hace nada
select public.agente_red('[{"mac": "a4:00:00:00:00:02"}]');
reset role;
select pg_temp.comprobar((select count(*) from public.red_dispositivos) = 1, 'acepta dos escaneos en el mismo minuto');
-- 500 aparatos como mucho: con 499 + 3 nuevos solo entra 1
insert into public.red_dispositivos (user_id, mac)
  select 'aaaaaaaa-0000-4000-8000-00000000000a', 'a4:00:00:00:' || lpad(to_hex(i / 256), 2, '0') || ':' || lpad(to_hex(i % 256), 2, '0') from generate_series(2, 500) i;
update public.agentes set ultimo_escaneo = null;
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select public.agente_red('[{"mac": "b4:00:00:00:00:01"}, {"mac": "b4:00:00:00:00:02"}, {"mac": "a4:00:00:00:00:01"}]');
reset role;
select pg_temp.comprobar((select count(*) from public.red_dispositivos) = 500, 'pasa de 500 aparatos');
select pg_temp.comprobar((select conectado from public.red_dispositivos where mac = 'a4:00:00:00:00:01'), 'un aparato ya conocido deja de actualizarse con el tope');
-- Avisos: el primero sí; otro enseguida no (aunque haya nuevos); pasados 5 minutos, sí y agrupado
select pg_temp.como('service');
select pg_temp.comprobar((select count(*) from public.red_reservar_avisos('aaaaaaaa-0000-4000-8000-00000000000a')) = 500, 'el primer aviso no reserva los nuevos');
reset role;
update public.red_dispositivos set avisado = false where mac in ('a4:00:00:00:00:05', 'a4:00:00:00:00:06');
select pg_temp.como('service');
select pg_temp.comprobar((select count(*) from public.red_reservar_avisos('aaaaaaaa-0000-4000-8000-00000000000a')) = 0, 'avisa dos veces en 5 minutos');
reset role;
update public.red_ultimo_aviso set cuando = now() - interval '6 minutes';
select pg_temp.como('service');
select pg_temp.comprobar((select count(*) from public.red_reservar_avisos('aaaaaaaa-0000-4000-8000-00000000000a')) = 2, 'no avisa agrupado pasados 5 minutos');
-- Los desconocidos que no se ven desde hace 90 días se olvidan (los conocidos no)
reset role;
update public.red_dispositivos set ultima_vez = now() - interval '91 days', conectado = false where mac in ('a4:00:00:00:00:07', 'a4:00:00:00:00:08');
update public.red_dispositivos set conocido = true where mac = 'a4:00:00:00:00:08';
update public.agentes set ultimo_escaneo = null;
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select public.agente_red('[]');
reset role;
select pg_temp.comprobar(not exists (select 1 from public.red_dispositivos where mac = 'a4:00:00:00:00:07')
  and exists (select 1 from public.red_dispositivos where mac = 'a4:00:00:00:00:08'), 'no olvida bien los desconocidos viejos');
-- Nadie lee red_ultimo_aviso desde la app
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$select * from public.red_ultimo_aviso$q$, array['42501'], 'leer red_ultimo_aviso');

-- @caso: mando: una orden que se queda «en marcha» (el agente se cortó) pasa a error y no se repite
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.comandos (id, agente_id, accion) values ('c0000000-0000-4000-8000-000000000009', '99999999-0000-4000-8000-000000000009', 'bloquear');
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select public.agente_tomar_comando('c0000000-0000-4000-8000-000000000009');
reset role;
update public.comandos set created_at = now() - interval '2 minutes';
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar((select count(*) from public.agente_comandos_pendientes()) = 0, 'devuelve la orden a medias');
reset role;
select pg_temp.comprobar((select estado from public.comandos) = 'error', 'la orden a medias no pasa a error');

-- @caso: mando (tester): caducidad justo en los 30 s; pendientes marca las caducadas; resultado solo de una orden cogida
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid'), ('agente-2@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values
  ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}'),
  ('77777777-0000-4000-8000-000000000007', 'agente-2@agente.invalid', '{"tipo": "agente"}');
-- Dos PC del MISMO dueño
insert into public.agentes (id, user_id, nombre) values
  ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa'),
  ('77777777-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Portátil');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.comandos (id, agente_id, accion) values
  ('c0000000-0000-4000-8000-0000000000a1', '99999999-0000-4000-8000-000000000009', 'siguiente'),
  ('c0000000-0000-4000-8000-0000000000a2', '99999999-0000-4000-8000-000000000009', 'anterior'),
  ('c0000000-0000-4000-8000-0000000000a3', '99999999-0000-4000-8000-000000000009', 'silenciar'),
  ('c0000000-0000-4000-8000-0000000000a4', '99999999-0000-4000-8000-000000000009', 'play_pausa'),
  ('c0000000-0000-4000-8000-0000000000a5', '99999999-0000-4000-8000-000000000009', 'volumen_subir');
reset role;
select pg_temp.comprobar((select bool_and(caduca_en = now() + interval '30 seconds') from public.comandos), 'la caducidad no es de 30 s exactos');
-- a5: caduca justo ahora y el agente la pide directamente (sin pasar por pendientes): no la coge y queda caducada
update public.comandos set caduca_en = now() where id = 'c0000000-0000-4000-8000-0000000000a5';
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar((select count(*) from public.agente_tomar_comando('c0000000-0000-4000-8000-0000000000a5')) = 0, 'agente_tomar_comando coge una orden en el segundo exacto en que caduca');
reset role;
select pg_temp.comprobar((select estado from public.comandos where id = 'c0000000-0000-4000-8000-0000000000a5') = 'caducado', 'la orden del borde no queda caducada');
-- a1: caduca justo ahora (borde: ya no vale); a2: le queda 1 ms; a3: caducó hace un rato
update public.comandos set caduca_en = now() where id = 'c0000000-0000-4000-8000-0000000000a1';
update public.comandos set caduca_en = now() + interval '1 millisecond' where id = 'c0000000-0000-4000-8000-0000000000a2';
update public.comandos set caduca_en = now() - interval '1 hour' where id = 'c0000000-0000-4000-8000-0000000000a3';
-- El otro PC del mismo dueño no ve ni coge las órdenes de este
select pg_temp.como('77777777-0000-4000-8000-000000000007');
select pg_temp.comprobar((select count(*) from public.comandos) = 0, 'un PC ve las órdenes de otro PC del mismo dueño');
select pg_temp.comprobar((select count(*) from public.agente_comandos_pendientes()) = 0, 'un PC recibe pendientes de otro');
select pg_temp.comprobar((select count(*) from public.agente_tomar_comando('c0000000-0000-4000-8000-0000000000a4')) = 0, 'un PC coge la orden de otro PC del mismo dueño');
select public.agente_resultado('c0000000-0000-4000-8000-0000000000a4', false, 'trampa');
select pg_temp.como('99999999-0000-4000-8000-000000000009');
-- Resultado de una orden que aún no ha cogido: no cambia nada
select public.agente_resultado('c0000000-0000-4000-8000-0000000000a4', true, 'antes de cogerla');
select pg_temp.comprobar((select array_agg(x order by x) from public.agente_comandos_pendientes() x)
  = array['c0000000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-0000000000a4']::uuid[], 'pendientes no separa las caducadas en el borde');
select pg_temp.comprobar((select estado from public.comandos where id = 'c0000000-0000-4000-8000-0000000000a1') = 'caducado', 'pendientes no marca como caducada la del segundo exacto');
select pg_temp.comprobar((select count(*) from public.agente_tomar_comando('c0000000-0000-4000-8000-0000000000a1')) = 0, 'coge una orden que caduca justo ahora');
select pg_temp.comprobar((select accion from public.agente_tomar_comando('c0000000-0000-4000-8000-0000000000a2')) = 'anterior', 'no coge una orden a la que le queda 1 ms');
select pg_temp.comprobar((select accion from public.agente_tomar_comando('c0000000-0000-4000-8000-0000000000a4')) = 'play_pausa', 'no coge la a4');
select public.agente_resultado('c0000000-0000-4000-8000-0000000000a2', false, repeat('x', 300) || E'\u0007');
select public.agente_resultado('c0000000-0000-4000-8000-0000000000a4', true);
-- Una vez acabada, otro resultado no la cambia
select public.agente_resultado('c0000000-0000-4000-8000-0000000000a4', false, 'otra vez');
-- El agente no borra órdenes
delete from public.comandos;
reset role;
select pg_temp.comprobar((select estado from public.comandos where id = 'c0000000-0000-4000-8000-0000000000a1') = 'caducado'
  and (select estado from public.comandos where id = 'c0000000-0000-4000-8000-0000000000a3') = 'caducado', 'las caducadas no quedan caducadas');
select pg_temp.comprobar((select terminado_en is not null from public.comandos where id = 'c0000000-0000-4000-8000-0000000000a3'), 'caducada sin hora de fin');
select pg_temp.comprobar((select estado = 'error' and length(mensaje) = 200 and mensaje !~ '[[:cntrl:]]' from public.comandos where id = 'c0000000-0000-4000-8000-0000000000a2'), 'el error no se recorta o deja caracteres de control');
select pg_temp.comprobar((select estado || '|' || coalesce(mensaje, '∅') from public.comandos where id = 'c0000000-0000-4000-8000-0000000000a4') = 'hecho|', 'un resultado repetido cambia la orden');
select pg_temp.comprobar((select count(*) from public.comandos) = 5, 'el agente borra órdenes');
-- El dueño sí borra las suyas
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
delete from public.comandos where id = 'c0000000-0000-4000-8000-0000000000a1';
reset role;
select pg_temp.comprobar((select count(*) from public.comandos) = 4, 'el dueño no borra sus órdenes');

-- @caso: mando (tester): lo de más de un día se limpia al mandar otra; abrir_app con espacios; desvinculado no coge nada
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre, apps) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa', array['Firefox']);
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.comandos (id, agente_id, accion) values ('c0000000-0000-4000-8000-0000000000b1', '99999999-0000-4000-8000-000000000009', 'bloquear');
reset role;
update public.comandos set created_at = now() - interval '25 hours';
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
insert into public.comandos (agente_id, accion) values ('99999999-0000-4000-8000-000000000009', 'bloquear');
select pg_temp.comprobar((select count(*) from public.comandos) = 1 and not exists (select 1 from public.comandos where id = 'c0000000-0000-4000-8000-0000000000b1'), 'no limpia lo de más de un día');
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion, valor) values ('99999999-0000-4000-8000-000000000009', 'abrir_app', '   ')$q$, array['23514'], 'abrir una app en blanco');
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion, valor) values ('99999999-0000-4000-8000-000000000009', 'abrir_app', ' Firefox')$q$, array['23514'], 'abrir una app con espacios delante');
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion) values ('99999999-0000-4000-8000-000000000009', 'abrir_app')$q$, array['23514'], 'abrir una app sin nombre');
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion, valor) values ('99999999-0000-4000-8000-000000000009', 'volumen', '040')$q$, array['23514'], 'volumen con cero delante');
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion, valor) values ('99999999-0000-4000-8000-000000000009', 'volumen', E'40\n')$q$, array['23514'], 'volumen con salto de línea');
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'apagar')$q$, array['42501', '23503'], 'una orden a un PC que no existe');
-- Desvinculado: ni pendientes ni coger
delete from public.agentes where id = '99999999-0000-4000-8000-000000000009';
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.debe_fallar($q$select * from public.agente_comandos_pendientes()$q$, array['42501'], 'un agente desvinculado pide pendientes');
select pg_temp.debe_fallar($q$select * from public.agente_tomar_comando('c0000000-0000-4000-8000-0000000000b1')$q$, array['42501'], 'un agente desvinculado coge órdenes');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select * from public.agente_comandos_pendientes()$q$, array['42501'], 'anon pide pendientes');

-- @caso: mando (tester): una orden de volumen SIN valor no se acepta (el check da NULL y deja pasar)
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$insert into public.comandos (agente_id, accion) values ('99999999-0000-4000-8000-000000000009', 'volumen')$q$, array['23514'], 'volumen sin valor');

-- @caso: red (tester): no repetir avisos — solo los nuevos de verdad, por dueño; olvidar uno lo vuelve nuevo
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid'), ('agente-2@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values
  ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}'),
  ('88888888-0000-4000-8000-000000000008', 'agente-2@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre) values
  ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa'),
  ('88888888-0000-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-00000000000b', 'PC de B');
-- B ve la misma MAC en SU casa: es otro aparato, de otro dueño
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('88888888-0000-4000-8000-000000000008');
select pg_temp.comprobar(public.agente_red('[{"mac": "a4:bb:cc:00:00:01"}]') = 1, 'B no cuenta su aparato nuevo');
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar(public.agente_red('[{"mac": "a4:bb:cc:00:00:01"}, {"mac": "a4:bb:cc:00:00:02"}]') = 2, 'A no cuenta 2 nuevos');
-- Mientras no se avisa, cada escaneo sigue diciendo que hay 2 (el agente reintenta el aviso)
select pg_temp.comprobar(public.agente_red('[{"mac": "a4:bb:cc:00:00:01"}, {"mac": "a4:bb:cc:00:00:02"}]') = 2, 'pierde los pendientes de avisar');
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('service');
select pg_temp.comprobar((select array_agg(mac order by mac) from public.red_reservar_avisos('aaaaaaaa-0000-4000-8000-00000000000a')) = array['a4:bb:cc:00:00:01', 'a4:bb:cc:00:00:02'], 'no reserva los de A');
-- Lo de B no se ha tocado al avisar a A
reset role;
select pg_temp.comprobar((select not avisado from public.red_dispositivos where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 'avisar a A marca lo de B');
-- Se van y vuelven (desconectados y otra vez conectados): no es nuevo
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar(public.agente_red('[]') = 0, 'un escaneo vacío avisa');
reset role;
select pg_temp.comprobar((select count(*) from public.red_dispositivos where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and conectado) = 0, 'el escaneo vacío no los desconecta');
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar(public.agente_red('[{"mac": "a4:bb:cc:00:00:01"}, {"mac": "a4:bb:cc:00:00:02"}, {"mac": "a4:bb:cc:00:00:03"}]') = 1, 'vuelve a avisar de los que vuelven');
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('service');
select pg_temp.comprobar((select array_agg(mac) from public.red_reservar_avisos('aaaaaaaa-0000-4000-8000-00000000000a')) = array['a4:bb:cc:00:00:03'], 'no avisa SOLO del nuevo');
-- Ponerle nombre, marcarlo como conocido o desconocido no lo vuelve a avisar
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
update public.red_dispositivos set nombre = 'Tele', conocido = true where mac = 'a4:bb:cc:00:00:01';
update public.red_dispositivos set conocido = false where mac = 'a4:bb:cc:00:00:01';
-- Olvidarlo: si vuelve a salir, es nuevo y se avisa (lo que dice la pantalla)
delete from public.red_dispositivos where mac = 'a4:bb:cc:00:00:02';
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar(public.agente_red('[{"mac": "a4:bb:cc:00:00:01"}, {"mac": "a4:bb:cc:00:00:02"}]') = 1, 'olvidado y vuelto no cuenta como nuevo, o el renombrado sí');
reset role;
select pg_temp.comprobar((select nombre = 'Tele' and not conocido from public.red_dispositivos where mac = 'a4:bb:cc:00:00:01' and user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 'un escaneo borra el nombre que le pusiste');
-- La función de avisos con un dueño sin nada (o inventado): nada
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('service');
select pg_temp.comprobar((select count(*) from public.red_reservar_avisos('ffffffff-0000-4000-8000-00000000000f')) = 0, 'reserva para alguien sin red');
select pg_temp.como('anon');
select pg_temp.debe_fallar($q$select public.red_reservar_avisos('aaaaaaaa-0000-4000-8000-00000000000a')$q$, array['42501'], 'anon reserva avisos');
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.debe_fallar($q$select public.red_reservar_avisos('aaaaaaaa-0000-4000-8000-00000000000a')$q$, array['42501'], 'el agente reserva avisos sin pasar por aviso-red');

-- @caso: red (tester): caducidad del historial (30 días justos) y ventana de 12 minutos para alargar un intervalo
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid'), ('agente-2@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values
  ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}'),
  ('88888888-0000-4000-8000-000000000008', 'agente-2@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre) values
  ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa'),
  ('88888888-0000-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-00000000000b', 'PC de B');
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select public.agente_red('[{"mac": "a4:bb:cc:00:00:01"}, {"mac": "a4:bb:cc:00:00:02"}, {"mac": "a4:bb:cc:00:00:03"}]');
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('88888888-0000-4000-8000-000000000008');
select public.agente_red('[{"mac": "b4:bb:cc:00:00:01"}]');
reset role;
-- 01: su último intervalo acabó hace 12 min justos (se alarga); 02: hace 12 min y 1 s (otro intervalo nuevo)
update public.red_conexiones c set desde = now() - interval '1 hour', hasta = now() - interval '12 minutes'
  from public.red_dispositivos d where d.id = c.dispositivo_id and d.mac = 'a4:bb:cc:00:00:01';
update public.red_conexiones c set desde = now() - interval '1 hour', hasta = now() - interval '12 minutes 1 second'
  from public.red_dispositivos d where d.id = c.dispositivo_id and d.mac = 'a4:bb:cc:00:00:02';
-- 03: historial viejo: uno de hace 30 días justos (se queda) y otro de 30 días y 1 s (se borra)
insert into public.red_conexiones (dispositivo_id, user_id, desde, hasta)
  select id, user_id, now() - interval '31 days', now() - interval '30 days' from public.red_dispositivos where mac = 'a4:bb:cc:00:00:03';
insert into public.red_conexiones (dispositivo_id, user_id, desde, hasta)
  select id, user_id, now() - interval '31 days', now() - interval '30 days 1 second' from public.red_dispositivos where mac = 'a4:bb:cc:00:00:03';
-- Lo viejo de B lo borra SU agente, no el de A
insert into public.red_conexiones (dispositivo_id, user_id, desde, hasta)
  select id, user_id, now() - interval '50 days', now() - interval '45 days' from public.red_dispositivos where mac = 'b4:bb:cc:00:00:01';
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select public.agente_red('[{"mac": "a4:bb:cc:00:00:01"}, {"mac": "a4:bb:cc:00:00:02"}]');
reset role;
select pg_temp.comprobar((select count(*) = 1 and min(desde) = now() - interval '1 hour' and max(hasta) = now()
  from public.red_conexiones c join public.red_dispositivos d on d.id = c.dispositivo_id where d.mac = 'a4:bb:cc:00:00:01'), 'a los 12 min justos no alarga el intervalo');
select pg_temp.comprobar((select count(*) from public.red_conexiones c join public.red_dispositivos d on d.id = c.dispositivo_id where d.mac = 'a4:bb:cc:00:00:02') = 2,
  'pasados 12 min alarga el intervalo en vez de abrir otro');
select pg_temp.comprobar((select count(*) from public.red_conexiones c join public.red_dispositivos d on d.id = c.dispositivo_id
  where d.mac = 'a4:bb:cc:00:00:03' and c.hasta < now() - interval '1 day') = 1, 'el borde de 30 días no es el esperado');
select pg_temp.comprobar(not exists (select 1 from public.red_conexiones c join public.red_dispositivos d on d.id = c.dispositivo_id
  where d.mac = 'a4:bb:cc:00:00:03' and c.hasta = now() - interval '30 days 1 second'), 'no borra lo de 30 días y 1 s');
select pg_temp.comprobar((select count(*) from public.red_conexiones where user_id = 'bbbbbbbb-0000-4000-8000-00000000000b') = 2, 'el agente de A borra el historial de B');
-- El aparato que no ha salido en el escaneo deja de estar conectado y su intervalo no crece
select pg_temp.comprobar((select not conectado from public.red_dispositivos where mac = 'a4:bb:cc:00:00:03'), 'el que falta sigue conectado');
select pg_temp.comprobar((select max(hasta) from public.red_conexiones c join public.red_dispositivos d on d.id = c.dispositivo_id where d.mac = 'a4:bb:cc:00:00:03') = now(), 'el historial del ausente cambia');

-- @caso: red (tester): escaneos raros (no objetos, MAC en mayúsculas, IP mala, fabricante con control) y lo tuyo no se pisa
reset role;
insert into public.emails_permitidos (email) values ('agente-1@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-1@agente.invalid', '{"tipo": "agente"}');
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar(public.agente_red($j$[1, "a4:bb:cc:00:00:09", null, [], {"mac": {"x": 1}}, {"mac": "A4:BB:CC:00:00:01", "ip": "192.168.1.5; drop", "fabricante": "Marca\u0007\u001b[31m SA"},
  {"mac": "a4:bb:cc:00:00:02", "ip": "192.168.1.6", "fabricante": "%s"}]$j$::jsonb) = 2, 'no ignora lo que no tiene forma');
reset role;
select pg_temp.comprobar((select ip is null and fabricante = 'Marca[31m SA' and mac = 'a4:bb:cc:00:00:01' from public.red_dispositivos where mac = 'a4:bb:cc:00:00:01'), 'no limpia la IP, el fabricante o la MAC');
select pg_temp.comprobar((select fabricante from public.red_dispositivos where mac = 'a4:bb:cc:00:00:02') = '%s', 'cambia un fabricante normal');
-- Lo que pones tú se queda; un escaneo sin fabricante ni IP no borra los que había
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
update public.red_dispositivos set nombre = 'Impresora', conocido = true where mac = 'a4:bb:cc:00:00:02';
reset role;
update public.agentes set ultimo_escaneo = null; delete from public.red_ultimo_aviso; -- (como si hubieran pasado los minutos de los topes)
select pg_temp.como('99999999-0000-4000-8000-000000000009');
select public.agente_red('[{"mac": "a4:bb:cc:00:00:02"}]');
reset role;
select pg_temp.comprobar((select nombre = 'Impresora' and conocido and ip = '192.168.1.6' and fabricante = '%s' from public.red_dispositivos where mac = 'a4:bb:cc:00:00:02'), 'un escaneo pisa lo tuyo o lo que ya se sabía');
-- Un nombre en blanco no vale; el nombre se puede quitar (null)
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$update public.red_dispositivos set nombre = '   ' where mac = 'a4:bb:cc:00:00:02'$q$, array['23514'], 'nombre en blanco');
update public.red_dispositivos set nombre = null where mac = 'a4:bb:cc:00:00:02';
-- Olvidar el principal deja a sus unidos sueltos (sin borrarlos)
update public.red_dispositivos set unido_a = (select id from public.red_dispositivos where mac = 'a4:bb:cc:00:00:02') where mac = 'a4:bb:cc:00:00:01';
select pg_temp.debe_fallar($q$update public.red_dispositivos set unido_a = id where mac = 'a4:bb:cc:00:00:01'$q$, array['23514'], 'unir un aparato consigo mismo');
delete from public.red_dispositivos where mac = 'a4:bb:cc:00:00:02';
reset role;
select pg_temp.comprobar((select unido_a is null and user_id = 'aaaaaaaa-0000-4000-8000-00000000000a' from public.red_dispositivos where mac = 'a4:bb:cc:00:00:01'), 'olvidar el principal se lleva a sus unidos');
select pg_temp.comprobar(not exists (select 1 from public.red_conexiones c where not exists (select 1 from public.red_dispositivos d where d.id = c.dispositivo_id)), 'queda historial de un aparato olvidado');
-- Borrar la cuenta se lleva la red
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-00000000000a';
select pg_temp.comprobar(not exists (select 1 from public.red_dispositivos) and not exists (select 1 from public.red_conexiones), 'la red sobrevive a la cuenta');


-- @fin
rollback;
