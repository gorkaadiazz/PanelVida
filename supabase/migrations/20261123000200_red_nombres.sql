-- =============================================================================
-- Fase 9 · Red de casa: el nombre con el que se anuncia cada aparato
--
-- El agente averigua (por mDNS o por el DNS del router) cómo se presenta cada
-- aparato: «Tele salón (Chromecast o Google TV)», «Amazon Fire TV o Echo»,
-- «Canon TS700 series (Impresora)»… Se guarda aparte del nombre que le pongas
-- tú (nombre): el tuyo manda siempre. Es solo texto para enseñar.
-- =============================================================================

alter table public.red_dispositivos add column nombre_red text check (nombre_red is null or length(nombre_red) between 1 and 60);

-- agente_red: igual que en 20261122000700 (con los topes) y además guarda
-- nombre_red si llega (si no llega, se queda el que hubiera).
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
  v_nombre text;
  v_id uuid;
begin
  if v_dueno is null then
    raise exception 'No es un agente vinculado' using errcode = '42501';
  end if;
  if jsonb_typeof(dispositivos) <> 'array' or jsonb_array_length(dispositivos) > 512 then
    raise exception 'Escaneo no válido' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('red:' || v_dueno::text));
  if exists (select 1 from public.agentes a where a.id = auth.uid() and a.ultimo_escaneo > v_ahora - interval '1 minute') then
    return (select count(*) from public.red_dispositivos where user_id = v_dueno and not avisado);
  end if;
  update public.agentes set ultimo_escaneo = v_ahora where id = auth.uid();

  for d in select * from jsonb_array_elements(dispositivos) loop
    continue when jsonb_typeof(d) <> 'object';
    v_mac := lower(d ->> 'mac');
    v_ip := d ->> 'ip';
    v_fab := left(regexp_replace(coalesce(d ->> 'fabricante', ''), '[[:cntrl:]]', '', 'g'), 80);
    -- Sin controles ni caracteres invisibles de formato (los que dan la vuelta al texto, U+202E…)
    v_nombre := btrim(left(regexp_replace(coalesce(d ->> 'nombre_red', ''), '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]', '', 'g'), 60));
    continue when v_mac is null or v_mac !~ '^([0-9a-f]{2}:){5}[0-9a-f]{2}$' or v_mac = any (v_macs);
    if v_ip is not null and v_ip !~ '^(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])){3}$' then v_ip := null; end if;
    v_macs := v_macs || v_mac;

    if not exists (select 1 from public.red_dispositivos x where x.user_id = v_dueno and x.mac = v_mac)
       and (select count(*) from public.red_dispositivos x where x.user_id = v_dueno) >= 500 then
      continue;
    end if;
    insert into public.red_dispositivos (user_id, mac, ip, fabricante, nombre_red, aleatoria, conectado, primera_vez, ultima_vez)
    values (v_dueno, v_mac, v_ip, nullif(v_fab, ''), nullif(v_nombre, ''), substr(v_mac, 2, 1) in ('2', '6', 'a', 'e'), true, v_ahora, v_ahora)
    on conflict (user_id, mac) do update
      set ip = coalesce(excluded.ip, public.red_dispositivos.ip),
          fabricante = coalesce(excluded.fabricante, public.red_dispositivos.fabricante),
          nombre_red = coalesce(excluded.nombre_red, public.red_dispositivos.nombre_red),
          conectado = true,
          ultima_vez = v_ahora
    returning id into v_id;

    update public.red_conexiones set hasta = v_ahora
    where id = (select c.id from public.red_conexiones c
                where c.dispositivo_id = v_id and c.hasta >= v_ahora - interval '12 minutes'
                order by c.hasta desc limit 1);
    if not found then
      insert into public.red_conexiones (dispositivo_id, user_id, desde, hasta) values (v_id, v_dueno, v_ahora, v_ahora);
    end if;
  end loop;

  update public.red_dispositivos set conectado = false
  where user_id = v_dueno and conectado and not (mac = any (v_macs));
  delete from public.red_conexiones where user_id = v_dueno and hasta < v_ahora - interval '30 days';
  delete from public.red_dispositivos
  where user_id = v_dueno and not conocido and ultima_vez < v_ahora - interval '90 days'
    and not exists (select 1 from public.red_dispositivos u where u.unido_a = red_dispositivos.id);

  return (select count(*) from public.red_dispositivos where user_id = v_dueno and not avisado);
end;
$$;
revoke execute on function public.agente_red(jsonb) from public, anon;
grant execute on function public.agente_red(jsonb) to authenticated;

-- red_reservar_avisos devuelve también nombre_red (para el texto del aviso).
-- Cambia lo que devuelve, así que hay que borrarla y crearla otra vez.
drop function public.red_reservar_avisos(uuid);
create function public.red_reservar_avisos(dueno uuid)
returns table (mac text, ip text, fabricante text, aleatoria boolean, nombre_red text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('aviso-red:' || dueno::text));
  if exists (select 1 from public.red_ultimo_aviso u where u.user_id = dueno and u.cuando > now() - interval '5 minutes') then
    return;
  end if;
  if not exists (select 1 from public.red_dispositivos d where d.user_id = dueno and not d.avisado) then
    return;
  end if;
  insert into public.red_ultimo_aviso (user_id, cuando) values (dueno, now())
  on conflict (user_id) do update set cuando = excluded.cuando;
  return query
    update public.red_dispositivos d set avisado = true
    where d.user_id = dueno and not d.avisado
    returning d.mac, d.ip, d.fabricante, d.aleatoria, d.nombre_red;
end;
$$;
revoke execute on function public.red_reservar_avisos(uuid) from public, anon, authenticated;
grant execute on function public.red_reservar_avisos(uuid) to service_role;
