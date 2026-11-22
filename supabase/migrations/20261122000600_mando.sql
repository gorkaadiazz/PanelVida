-- =============================================================================
-- Fase 9 · Mando del PC
--
-- Desde la app pides una acción («apagar», «volumen al 40 %»…) y el agente
-- del PC la ejecuta. Reglas:
--   · Solo acciones de una LISTA FIJA (check de la tabla y, otra vez, la
--     tabla de acciones dentro del agente). Nunca un comando libre.
--   · Cada orden caduca a los 30 segundos (lo pone el servidor, no la app):
--     si el PC estaba apagado, al encenderse NO ejecuta órdenes viejas.
--   · El agente no escribe en la tabla: «coge» una orden con
--     agente_tomar_comando() (una sola vez, aunque le llegue dos veces) y
--     cuenta cómo ha ido con agente_resultado().
-- =============================================================================

create table public.comandos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agente_id uuid not null references public.agentes (id) on delete cascade,
  accion text not null check (accion in (
    'apagar', 'reiniciar', 'suspender', 'bloquear',
    'volumen_subir', 'volumen_bajar', 'silenciar', 'volumen',
    'play_pausa', 'siguiente', 'anterior', 'abrir_app')),
  -- volumen: '0'..'100'; abrir_app: el nombre de la app (de agentes.apps); el resto, nada
  valor text check (valor is null or length(valor) <= 40),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'ejecutando', 'hecho', 'error', 'caducado')),
  mensaje text check (mensaje is null or length(mensaje) <= 200),
  caduca_en timestamptz not null default now() + interval '30 seconds',
  created_at timestamptz not null default now(),
  terminado_en timestamptz,
  constraint comandos_valor check (
    case accion
      -- (con «is not null»: un check que da NULL deja pasar la fila)
      when 'volumen' then valor is not null and valor ~ '^(100|[1-9]?[0-9])$'
      when 'abrir_app' then valor is not null and length(btrim(valor)) between 1 and 40
      else valor is null
    end)
);
create index comandos_agente_idx on public.comandos (agente_id, created_at desc);
create index comandos_user_idx on public.comandos (user_id, created_at desc);

-- Al crear: lo pone todo el servidor (estado, caducidad, sin mensaje) y
-- comprueba que el PC es tuyo y, para abrir una app, que el PC la conoce.
create or replace function public.antes_de_crear_comando()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agente public.agentes%rowtype;
begin
  select * into v_agente from public.agentes a where a.id = new.agente_id;
  if not found or v_agente.user_id <> new.user_id then
    raise exception 'Ese PC no es tuyo' using errcode = '42501';
  end if;
  if new.accion = 'abrir_app' and not (new.valor = any (v_agente.apps)) then
    raise exception 'Ese PC no sabe abrir esa app' using errcode = 'check_violation';
  end if;
  -- Como mucho 30 órdenes por minuto y PC (botones pulsados sin parar)
  perform pg_advisory_xact_lock(hashtext('comandos:' || new.agente_id::text));
  if (select count(*) from public.comandos c where c.agente_id = new.agente_id and c.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Demasiadas órdenes seguidas: espera un poco' using errcode = 'check_violation';
  end if;
  new.estado := 'pendiente';
  new.mensaje := null;
  new.terminado_en := null;
  new.created_at := now();
  new.caduca_en := now() + interval '30 seconds';
  -- Lo viejo sobra (solo se enseñan las últimas)
  delete from public.comandos c where c.agente_id = new.agente_id and c.created_at < now() - interval '1 day';
  return new;
end;
$$;
revoke execute on function public.antes_de_crear_comando() from public, anon, authenticated;
create trigger antes_de_crear_comando before insert on public.comandos
  for each row execute function public.antes_de_crear_comando();

alter table public.comandos enable row level security;
-- El dueño crea, ve y borra las suyas; el agente ve las de él (para recibirlas)
create policy "dueno_o_su_agente_select" on public.comandos
  for select to authenticated using (
    user_id = (select auth.uid())
    or (agente_id = (select auth.uid()) and user_id = (select public.mi_dueno())));
create policy "dueno_insert" on public.comandos
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "dueno_delete" on public.comandos
  for delete to authenticated using (user_id = (select auth.uid()));
-- Nadie las cambia directamente (el agente, con sus funciones)
revoke update on public.comandos from authenticated;
revoke all on public.comandos from anon;
revoke truncate, references, trigger on public.comandos from authenticated;

-- Restrictivas: leer, cuenta normal o agente; crear y borrar, solo cuenta normal
create policy "solo_cuentas_normales" on public.comandos as restrictive for select to authenticated
  using ((select public.tipo_cuenta()) in ('normal', 'agente'));
create policy "solo_cuentas_normales_insert" on public.comandos as restrictive for insert to authenticated
  with check ((select public.tipo_cuenta()) = 'normal');
create policy "solo_cuentas_normales_delete" on public.comandos as restrictive for delete to authenticated
  using ((select public.tipo_cuenta()) = 'normal');

-- -----------------------------------------------------------------------------
-- Lo que hace el agente con las órdenes
-- -----------------------------------------------------------------------------

-- Coge una orden para ejecutarla: solo si es suya, sigue pendiente y no ha
-- caducado (con la hora del servidor). Si ha caducado, la marca. Devuelve la
-- acción y el valor, o nada si no hay que ejecutarla. Una orden solo se coge
-- una vez aunque llegue repetida.
create or replace function public.agente_tomar_comando(comando uuid)
returns table (accion text, valor text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.comandos%rowtype;
begin
  if public.mi_dueno() is null then
    raise exception 'No es un agente vinculado' using errcode = '42501';
  end if;
  select * into v_c from public.comandos c where c.id = comando and c.agente_id = auth.uid() for update;
  if not found or v_c.estado <> 'pendiente' then
    return;
  end if;
  if v_c.caduca_en <= now() then
    update public.comandos set estado = 'caducado', terminado_en = now() where id = v_c.id;
    return;
  end if;
  update public.comandos set estado = 'ejecutando' where id = v_c.id;
  return query select v_c.accion, v_c.valor;
end;
$$;
revoke execute on function public.agente_tomar_comando(uuid) from public, anon;
grant execute on function public.agente_tomar_comando(uuid) to authenticated;

-- Las pendientes de este agente (al arrancar o reconectar): las caducadas se
-- marcan como tales y las demás se devuelven para cogerlas.
create or replace function public.agente_comandos_pendientes()
returns setof uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.mi_dueno() is null then
    raise exception 'No es un agente vinculado' using errcode = '42501';
  end if;
  update public.comandos set estado = 'caducado', terminado_en = now()
  where agente_id = auth.uid() and estado = 'pendiente' and caduca_en <= now();
  -- Las que se quedaron «en marcha» (el agente se cortó a medias): error, nunca se repiten
  update public.comandos set estado = 'error', mensaje = 'El agente se cortó mientras la ejecutaba', terminado_en = now()
  where agente_id = auth.uid() and estado = 'ejecutando' and created_at < now() - interval '1 minute';
  return query
    select c.id from public.comandos c
    where c.agente_id = auth.uid() and c.estado = 'pendiente' and c.caduca_en > now()
    order by c.created_at;
end;
$$;
revoke execute on function public.agente_comandos_pendientes() from public, anon;
grant execute on function public.agente_comandos_pendientes() to authenticated;

-- Cómo ha ido: 'hecho' o 'error' (con un mensaje corto), solo de una orden que cogió.
create or replace function public.agente_resultado(comando uuid, ok boolean, mensaje text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.mi_dueno() is null then
    raise exception 'No es un agente vinculado' using errcode = '42501';
  end if;
  update public.comandos c
  set estado = case when ok then 'hecho' else 'error' end,
      mensaje = left(regexp_replace(coalesce(agente_resultado.mensaje, ''), '[[:cntrl:]]', ' ', 'g'), 200),
      terminado_en = now()
  where c.id = comando and c.agente_id = auth.uid() and c.estado = 'ejecutando';
end;
$$;
revoke execute on function public.agente_resultado(uuid, boolean, text) from public, anon;
grant execute on function public.agente_resultado(uuid, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- El volumen actual va en el latido (para el control deslizante)
-- -----------------------------------------------------------------------------

alter table public.agentes add column volumen smallint check (volumen is null or volumen between 0 and 150);
alter table public.agentes add column silenciado boolean;

create or replace function public.agente_latido(apps text[] default '{}', version text default null, volumen integer default null, silenciado boolean default null)
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
  select coalesce(array_agg(left(btrim(a), 40) order by ord), '{}') into v_apps
  from unnest(coalesce(apps, '{}')) with ordinality as x(a, ord)
  where ord <= 30 and btrim(a) <> '' and btrim(a) !~ '[[:cntrl:]]';
  update public.agentes
  set ultimo_latido = now(), apps = v_apps, version = left(agente_latido.version, 20),
      volumen = case when agente_latido.volumen between 0 and 150 then agente_latido.volumen else null end,
      silenciado = agente_latido.silenciado,
      updated_at = now()
  where id = auth.uid();
end;
$$;
-- La versión anterior (2 parámetros) se quita para no dejar dos
drop function public.agente_latido(text[], text);
revoke execute on function public.agente_latido(text[], text, integer, boolean) from public, anon;
grant execute on function public.agente_latido(text[], text, integer, boolean) to authenticated;

-- Realtime: el agente recibe sus órdenes; el dueño ve cómo acaban
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.comandos';
  end if;
end;
$$;
