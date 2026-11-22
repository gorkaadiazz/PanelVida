-- =============================================================================
-- Fase 9 (Casa) · sección 3: agente del PC (casos del tester)
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


-- G = el agente del PC de A, tal como lo crea la Edge Function `agentes`
insert into public.emails_permitidos (email) values ('agente-g@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('99999999-0000-4000-8000-000000000009', 'agente-g@agente.invalid', '{"tipo": "agente", "provider": "email"}');
delete from public.emails_permitidos where email = 'agente-g@agente.invalid';
insert into public.agentes (id, user_id, nombre) values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC casa');

-- Como el JWT de Supabase: el del agente lleva app_metadata.tipo = 'agente'
create or replace function pg_temp.como_agente(usuario text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', usuario, 'role', 'authenticated', 'app_metadata', json_build_object('tipo', 'agente', 'provider', 'email'))::text, true);
end;
$$;

-- -----------------------------------------------------------------------------
-- @caso: agente: toda tabla de public (salvo agentes y puente) y storage.objects le cierran el paso
reset role;
select pg_temp.comprobar(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not in ('agentes', 'puente')
    and has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                    and p.permissive = 'RESTRICTIVE' and p.policyname in ('solo_cuentas_normales', 'sin_agentes'))),
  'una tabla de public no cierra el paso a los agentes');
select pg_temp.comprobar(exists (select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
  and p.permissive = 'RESTRICTIVE' and p.qual like '%tipo_cuenta%'), 'storage.objects no cierra el paso a los agentes');

-- @caso: agente: no se crea filas propias en las tablas de la web de exámenes ni sube archivos
reset role;
select pg_temp.como_agente('99999999-0000-4000-8000-000000000009');
select pg_temp.debe_fallar($q$insert into public.modulos (nombre, abreviatura) values ('x', 'X')$q$, array['42501'], 'el agente crea módulos');
select pg_temp.debe_fallar($q$insert into public.habitos (nombre) values ('x')$q$, array['42501'], 'el agente crea hábitos');
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name) values ('temarios', '99999999-0000-4000-8000-000000000009/x.pdf')$q$, array['42501'], 'el agente sube a temarios');
select pg_temp.debe_fallar($q$insert into storage.objects (bucket_id, name) values ('puente', '99999999-0000-4000-8000-000000000009/x/y.pdf')$q$, array['42501'], 'el agente sube al puente');
select pg_temp.comprobar(public.inicializar_cuenta() = false, 'inicializar_cuenta trata al agente como cuenta normal');
reset role;
select pg_temp.comprobar(not exists (select 1 from public.perfiles where user_id = '99999999-0000-4000-8000-000000000009')
  and not exists (select 1 from public.habitos where user_id = '99999999-0000-4000-8000-000000000009'), 'al agente se le ha creado una cuenta');

-- @caso: agente: no entra en un hogar con un código de invitación (unirse_hogar es security definer)
reset role;
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.hogares (nombre) values ('Casa de B');
create temporary table inv as select * from public.crear_invitacion();
grant select on inv to authenticated;
select pg_temp.como_agente('99999999-0000-4000-8000-000000000009');
do $$
begin
  perform public.unirse_hogar((select codigo from inv));
exception when insufficient_privilege then null;
end $$;
reset role;
select pg_temp.comprobar(not exists (select 1 from public.hogar_miembros where user_id = '99999999-0000-4000-8000-000000000009'),
  'el agente se ha unido a un hogar');
select pg_temp.comprobar((select usado_en from public.hogar_invitaciones) is null, 'el agente ha gastado la invitación de B');

-- @caso: agente: no crea invitaciones, hogares ni códigos de vincular, ni gasta códigos ni llama a funciones del servidor
reset role;
select pg_temp.como_agente('99999999-0000-4000-8000-000000000009');
select pg_temp.debe_fallar($q$select public.crear_invitacion()$q$, array['42501'], 'el agente crea una invitación');
select pg_temp.debe_fallar($q$insert into public.hogares (nombre) values ('x')$q$, array['42501'], 'el agente crea un hogar');
select pg_temp.debe_fallar($q$select public.crear_codigo_vinculacion()$q$, array['42501'], 'el agente crea un código de vincular');
select pg_temp.debe_fallar($q$select public.usar_codigo_vinculacion('ABCDEFGH')$q$, array['42501'], 'el agente gasta códigos');
select pg_temp.debe_fallar($q$select public.agentes_huerfanos()$q$, array['42501'], 'el agente llama a agentes_huerfanos');
select pg_temp.debe_fallar($q$select public.sumar_uso_ia('99999999-0000-4000-8000-000000000009', 10)$q$, array['42501'], 'el agente llama a sumar_uso_ia');
reset role;
select pg_temp.como('service');
select pg_temp.comprobar(public.sumar_uso_ia('99999999-0000-4000-8000-000000000009', 10) is null, 'el agente gasta Gemini');
select pg_temp.comprobar(public.sumar_uso_ia('aaaaaaaa-0000-4000-8000-00000000000a', 10) = 1, 'sumar_uso_ia ya no cuenta a una persona');

-- @caso: agente: no lee los códigos de su dueño ni los borra; no se borra ni ve a sus hermanos
reset role;
insert into public.emails_permitidos (email) values ('agente-h@agente.invalid');
insert into auth.users (id, email, raw_app_meta_data) values ('88888888-0000-4000-8000-000000000008', 'agente-h@agente.invalid', '{"tipo": "agente", "provider": "email"}');
insert into public.agentes (id, user_id, nombre) values ('88888888-0000-4000-8000-000000000008', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Portátil');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select public.crear_codigo_vinculacion();
select pg_temp.como_agente('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar((select count(*) from public.codigos_vinculacion) = 0, 'el agente ve los códigos de su dueño');
delete from public.codigos_vinculacion;
select pg_temp.comprobar((select array_agg(nombre) from public.agentes) = array['PC casa'], 'el agente ve a los otros PC de su dueño');
delete from public.agentes;
select public.agente_latido(array['Firefox'], '9.9.9');
reset role;
select pg_temp.comprobar((select count(*) from public.codigos_vinculacion) = 1, 'el agente borra los códigos de su dueño');
select pg_temp.comprobar((select count(*) from public.agentes) = 2, 'el agente se borra a sí mismo o a un hermano');
select pg_temp.comprobar((select ultimo_latido from public.agentes where nombre = 'Portátil') is null
  and (select ultimo_latido from public.agentes where nombre = 'PC casa') is not null, 'el latido toca otra fila');

-- @caso: latido: recorta apps (30, 40 caracteres), versión (20) y acepta null
reset role;
select pg_temp.como_agente('99999999-0000-4000-8000-000000000009');
select public.agente_latido((select array_agg('App ' || i || repeat('x', 50)) from generate_series(1, 40) i), repeat('v', 50));
reset role;
select pg_temp.comprobar(cardinality((select apps from public.agentes)) = 30, 'más de 30 apps');
select pg_temp.comprobar((select bool_and(length(a) <= 40) from public.agentes, unnest(apps) a), 'una app de más de 40 caracteres');
select pg_temp.comprobar(length((select version from public.agentes)) = 20, 'la versión no se recorta');
select pg_temp.como_agente('99999999-0000-4000-8000-000000000009');
select public.agente_latido(null, null);
reset role;
select pg_temp.comprobar((select apps from public.agentes) = '{}' and (select version from public.agentes) is null, 'latido con null');

-- @caso: agente_enviar_puente: enlaces de verdad, nada de javascript:, tope de tamaño y marca de origen
reset role;
select pg_temp.como_agente('99999999-0000-4000-8000-000000000009');
select public.agente_enviar_puente('javascript:alert(1)');
select public.agente_enviar_puente('https://a.es con espacio');
select public.agente_enviar_puente(E'\t https://a.es/x?y=1 \n');
select pg_temp.debe_fallar($q$select public.agente_enviar_puente(repeat('x', 10001))$q$, array['23514'], 'mandar más de 10.000 caracteres');
select pg_temp.debe_fallar($q$select public.agente_enviar_puente(null)$q$, array['23514'], 'mandar null');
reset role;
select pg_temp.comprobar((select array_agg(tipo || ':' || contenido order by contenido) from public.puente)
  = array['texto:https://a.es con espacio', 'enlace:https://a.es/x?y=1', 'texto:javascript:alert(1)'], 'tipos mal detectados');
select pg_temp.comprobar((select bool_and(origen_agente = '99999999-0000-4000-8000-000000000009' and dispositivo = 'PC casa'
  and user_id = 'aaaaaaaa-0000-4000-8000-00000000000a') from public.puente), 'falta la marca del agente o el dueño');

-- @caso: desvinculado y con el usuario ya borrado: con su token aún válido no es cuenta normal
reset role;
delete from public.agentes;
delete from auth.users where id = '99999999-0000-4000-8000-000000000009';
select pg_temp.como_agente('99999999-0000-4000-8000-000000000009');
select pg_temp.comprobar(public.tipo_cuenta() = 'agente', 'un agente borrado pasa a ser cuenta normal');
select pg_temp.comprobar(public.mi_dueno() is null, 'un agente borrado sigue teniendo dueño');
select pg_temp.debe_fallar($q$select public.crear_codigo_vinculacion()$q$, array['42501'], 'un agente borrado crea códigos');
select pg_temp.debe_fallar($q$insert into public.hogares (nombre) values ('x')$q$, array['42501', '23503'], 'un agente borrado crea un hogar');
select pg_temp.debe_fallar($q$select public.agente_enviar_puente('x')$q$, array['42501'], 'un agente borrado manda al Puente');
select pg_temp.comprobar(public.inicializar_cuenta() = false, 'un agente borrado inicializa una cuenta');
select pg_temp.comprobar((select count(*) from public.puente) = 0, 'un agente borrado ve el Puente');

-- @caso: desvincular: el dueño sí, B no, el agente tampoco; y la fila de B ni la ve
reset role;
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
delete from public.agentes;
update public.agentes set nombre = 'Pirata';
select pg_temp.como_agente('99999999-0000-4000-8000-000000000009');
delete from public.agentes;
reset role;
select pg_temp.comprobar((select nombre from public.agentes) = 'PC casa', 'B o el agente desvinculan o renombran el PC de A');
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$update public.agentes set nombre = '   '$q$, array['23514'], 'nombre vacío');
select pg_temp.debe_fallar($q$update public.agentes set nombre = repeat('x', 41)$q$, array['23514'], 'nombre de 41');
delete from public.agentes;
reset role;
select pg_temp.comprobar(not exists (select 1 from public.agentes), 'el dueño no puede desvincular');

-- @caso: códigos: los caducados no cuentan para el tope de 3; 5 PC como mucho; el dueño borra los suyos; B no los ve
reset role;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select public.crear_codigo_vinculacion(); select public.crear_codigo_vinculacion(); select public.crear_codigo_vinculacion();
reset role;
update public.codigos_vinculacion set caduca_en = now() - interval '1 second';
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select public.crear_codigo_vinculacion();
select pg_temp.como('bbbbbbbb-0000-4000-8000-00000000000b');
select pg_temp.comprobar((select count(*) from public.codigos_vinculacion) = 0, 'B ve los códigos de A');
delete from public.codigos_vinculacion;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.comprobar((select count(*) from public.codigos_vinculacion) = 4, 'B borra los códigos de A');
delete from public.codigos_vinculacion where caduca_en < now();
select pg_temp.comprobar((select count(*) from public.codigos_vinculacion) = 1, 'el dueño no borra sus códigos');
reset role;
insert into public.emails_permitidos (email) select 'agente-' || i || '@agente.invalid' from generate_series(1, 4) i;
insert into auth.users (id, email, raw_app_meta_data)
  select ('7777777' || i || '-0000-4000-8000-000000000007')::uuid, 'agente-' || i || '@agente.invalid', '{"tipo": "agente"}' from generate_series(1, 4) i;
insert into public.agentes (id, user_id, nombre)
  select ('7777777' || i || '-0000-4000-8000-000000000007')::uuid, 'aaaaaaaa-0000-4000-8000-00000000000a', 'PC ' || i from generate_series(1, 4) i;
select pg_temp.como('aaaaaaaa-0000-4000-8000-00000000000a');
select pg_temp.debe_fallar($q$select public.crear_codigo_vinculacion()$q$, array['23514'], 'un sexto PC');

-- @caso: solo Google y los agentes pueden crear cuentas con email y contraseña
reset role;
insert into public.emails_permitidos (email) values ('nuevo@rls.test'), ('falso@agente.invalid');
select pg_temp.debe_fallar($q$insert into auth.users (id, email, raw_app_meta_data) values (gen_random_uuid(), 'nuevo@rls.test', '{"provider": "email"}')$q$, array['42501'], 'alta con email y contraseña');
select pg_temp.debe_fallar($q$insert into auth.users (id, email, raw_app_meta_data) values (gen_random_uuid(), 'falso@agente.invalid', '{"provider": "email"}')$q$, array['42501'], 'alta como agente sin app_metadata de agente');
select pg_temp.debe_fallar($q$insert into auth.users (id, email, raw_app_meta_data) values (gen_random_uuid(), 'nuevo@rls.test', '{"provider": "email", "tipo": "agente"}')$q$, array['42501'], 'alta de agente con un email que no es de agente');
insert into auth.users (id, email, raw_app_meta_data) values (gen_random_uuid(), 'nuevo@rls.test', '{"provider": "google"}');

-- @fin
rollback;
