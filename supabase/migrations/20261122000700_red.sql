-- =============================================================================
-- Fase 9 · Vigilante de la red de casa
--
-- Cada 5 minutos el agente del PC mira qué aparatos hay en tu red de casa
-- (solo si el PC está en ella) y lo manda con agente_red(). Aquí:
--   · red_dispositivos: un aparato por MAC, con el nombre que le pongas, si
--     es conocido, primera y última vez visto. Los nuevos llegan con
--     avisado = false; la Edge Function aviso-red manda UNA notificación por
--     cada uno y lo marca (no se repite por el mismo aparato).
--   · red_conexiones: cuándo estuvo conectado cada aparato, por intervalos
--     (desde-hasta), no una fila por escaneo. Lo de más de 30 días se borra.
--   · MAC aleatorias: los móviles cambian de MAC (por privacidad), así que un
--     mismo móvil puede salir como «nuevo». Se puede unir con uno conocido
--     (unido_a) y desde entonces cuenta como ese.
-- =============================================================================

create table public.red_dispositivos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mac text not null check (mac ~ '^([0-9a-f]{2}:){5}[0-9a-f]{2}$'),
  nombre text check (nombre is null or length(btrim(nombre)) between 1 and 40),
  fabricante text check (fabricante is null or length(fabricante) <= 80),
  ip text check (ip is null or ip ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'),
  -- MAC «administrada localmente»: casi siempre una MAC aleatoria de un móvil
  aleatoria boolean not null default false,
  conectado boolean not null default true,
  conocido boolean not null default false,
  unido_a uuid,
  avisado boolean not null default false,
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mac),
  unique (id, user_id),
  check (unido_a is null or unido_a <> id),
  -- Solo se une con un aparato tuyo
  foreign key (unido_a, user_id) references public.red_dispositivos (id, user_id) on delete set null (unido_a)
);
create index red_dispositivos_user_idx on public.red_dispositivos (user_id);

create table public.red_conexiones (
  id bigint generated always as identity primary key,
  dispositivo_id uuid not null,
  user_id uuid not null,
  desde timestamptz not null,
  hasta timestamptz not null,
  check (hasta >= desde),
  foreign key (dispositivo_id, user_id) references public.red_dispositivos (id, user_id) on delete cascade
);
create index red_conexiones_dispositivo_idx on public.red_conexiones (dispositivo_id, hasta desc);
create index red_conexiones_user_hasta_idx on public.red_conexiones (user_id, hasta);

-- updated_at al cambiar el nombre, conocido o unido_a
create or replace function public.red_al_editar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.red_al_editar() from public, anon, authenticated;
create trigger red_al_editar before update on public.red_dispositivos
  for each row execute function public.red_al_editar();

-- -----------------------------------------------------------------------------
-- RLS: solo el dueño ve y edita; el agente escribe con agente_red()
-- -----------------------------------------------------------------------------

alter table public.red_dispositivos enable row level security;
create policy "solo_mis_filas_select" on public.red_dispositivos
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "solo_mis_filas_update" on public.red_dispositivos
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_delete" on public.red_dispositivos
  for delete to authenticated using ((select auth.uid()) = user_id);
create policy "solo_cuentas_normales" on public.red_dispositivos as restrictive for all to authenticated
  using ((select public.tipo_cuenta()) = 'normal') with check ((select public.tipo_cuenta()) = 'normal');
revoke all on public.red_dispositivos from anon;
revoke insert, update, truncate, references, trigger on public.red_dispositivos from authenticated;
-- Desde la app solo se cambia lo tuyo: el nombre, si es conocido y con cuál se une
grant update (nombre, conocido, unido_a) on public.red_dispositivos to authenticated;

alter table public.red_conexiones enable row level security;
create policy "solo_mis_filas_select" on public.red_conexiones
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "solo_cuentas_normales" on public.red_conexiones as restrictive for all to authenticated
  using ((select public.tipo_cuenta()) = 'normal') with check ((select public.tipo_cuenta()) = 'normal');
revoke all on public.red_conexiones from anon;
revoke insert, update, delete, truncate, references, trigger on public.red_conexiones from authenticated;

-- -----------------------------------------------------------------------------
-- Lo que manda el agente
-- -----------------------------------------------------------------------------

-- dispositivos: [{ "mac": "aa:bb:…", "ip": "192.168.1.20", "fabricante": "…" }, …]
-- Devuelve cuántos aparatos están sin avisar (los nuevos), para que el agente
-- llame a la Edge Function aviso-red solo cuando haga falta.
create or replace function public.agente_red(dispositivos jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_dueno uuid := public.mi_dueno();
  v_ahora timestamptz := now();
  v_macs text[] := '{}';
  d jsonb;
  v_mac text;
  v_ip text;
  v_fab text;
  v_id uuid;
begin
  if v_dueno is null then
    raise exception 'No es un agente vinculado' using errcode = '42501';
  end if;
  if jsonb_typeof(dispositivos) <> 'array' or jsonb_array_length(dispositivos) > 512 then
    raise exception 'Escaneo no válido' using errcode = 'check_violation';
  end if;
  -- Un escaneo a la vez por dueño (dos PC en casa podrían mandar a la vez)
  perform pg_advisory_xact_lock(hashtext('red:' || v_dueno::text));

  for d in select * from jsonb_array_elements(dispositivos) loop
    v_mac := lower(d ->> 'mac');
    v_ip := d ->> 'ip';
    v_fab := left(regexp_replace(coalesce(d ->> 'fabricante', ''), '[[:cntrl:]]', '', 'g'), 80);
    -- Lo que no tenga buena forma se ignora (el check de la tabla lo pararía)
    continue when v_mac is null or v_mac !~ '^([0-9a-f]{2}:){5}[0-9a-f]{2}$' or v_mac = any (v_macs);
    if v_ip is not null and v_ip !~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' then v_ip := null; end if;
    v_macs := v_macs || v_mac;

    insert into public.red_dispositivos (user_id, mac, ip, fabricante, aleatoria, conectado, primera_vez, ultima_vez)
    values (v_dueno, v_mac, v_ip, nullif(v_fab, ''), substr(v_mac, 2, 1) in ('2', '6', 'a', 'e'), true, v_ahora, v_ahora)
    on conflict (user_id, mac) do update
      set ip = coalesce(excluded.ip, public.red_dispositivos.ip),
          fabricante = coalesce(excluded.fabricante, public.red_dispositivos.fabricante),
          conectado = true,
          ultima_vez = v_ahora
    returning id into v_id;

    -- Historial: si se vio hace poco (dos escaneos), se alarga el intervalo; si no, otro nuevo
    update public.red_conexiones set hasta = v_ahora
    where id = (select c.id from public.red_conexiones c
                where c.dispositivo_id = v_id and c.hasta >= v_ahora - interval '12 minutes'
                order by c.hasta desc limit 1);
    if not found then
      insert into public.red_conexiones (dispositivo_id, user_id, desde, hasta) values (v_id, v_dueno, v_ahora, v_ahora);
    end if;
  end loop;

  -- Los que no han salido en este escaneo ya no están conectados
  update public.red_dispositivos set conectado = false
  where user_id = v_dueno and conectado and not (mac = any (v_macs));

  -- Historial corto: 30 días
  delete from public.red_conexiones where user_id = v_dueno and hasta < v_ahora - interval '30 days';

  return (select count(*) from public.red_dispositivos where user_id = v_dueno and not avisado);
end;
$$;
revoke execute on function public.agente_red(jsonb) from public, anon;
grant execute on function public.agente_red(jsonb) to authenticated;

-- Para la Edge Function aviso-red (service role): reserva los aparatos nuevos
-- de un dueño (los marca como avisados) y los devuelve para avisar. Así, aunque
-- se llame dos veces a la vez, cada aparato se avisa una sola vez.
create or replace function public.red_reservar_avisos(dueno uuid)
returns table (mac text, ip text, fabricante text, aleatoria boolean)
language sql
volatile
security definer
set search_path = ''
as $$
  update public.red_dispositivos d set avisado = true
  where d.user_id = dueno and not d.avisado
  returning d.mac, d.ip, d.fabricante, d.aleatoria;
$$;
revoke execute on function public.red_reservar_avisos(uuid) from public, anon, authenticated;
grant execute on function public.red_reservar_avisos(uuid) to service_role;

-- Realtime: la pantalla de la red se actualiza sola (cada uno, lo suyo)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.red_dispositivos';
  end if;
end;
$$;
