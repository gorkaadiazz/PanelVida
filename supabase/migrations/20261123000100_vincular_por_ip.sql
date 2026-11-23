-- =============================================================================
-- Fase 9 · Vincular un PC: tope de intentos también por IP
--
-- usar_codigo_vinculacion (20261122000500) solo tenía un tope global (1000
-- fallos cada 10 minutos). Ahora, además, como mucho 20 fallos cada 10
-- minutos desde la misma IP: alguien probando códigos se bloquea a sí mismo
-- sin bloquear el vincular de los demás.
--
-- La IP no se guarda: la Edge Function manda un hash (sha256 con un secreto),
-- que sirve para contar pero no para saber de dónde se llamó.
-- =============================================================================

alter table public.vinculacion_intentos add column ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$');
create index vinculacion_intentos_ip_idx on public.vinculacion_intentos (ip_hash, cuando);

drop function public.usar_codigo_vinculacion(text);

create or replace function public.usar_codigo_vinculacion(codigo text, ip_hash text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_normal text := upper(regexp_replace(coalesce(codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_ip text := case when ip_hash ~ '^[0-9a-f]{64}$' then ip_hash else null end;
  v_cod public.codigos_vinculacion%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('vinculacion-intentos'));
  if (select count(*) from public.vinculacion_intentos where cuando > now() - interval '10 minutes') >= 1000 then
    return null;
  end if;
  if v_ip is not null and (select count(*) from public.vinculacion_intentos i
                           where i.ip_hash = v_ip and i.cuando > now() - interval '10 minutes') >= 20 then
    return null;
  end if;
  select * into v_cod from public.codigos_vinculacion c
  where length(v_normal) = 8 and c.codigo_hash = sha256(convert_to(v_normal, 'UTF8'))
  for update;
  if not found or v_cod.usado_en is not null or v_cod.caduca_en <= now() then
    insert into public.vinculacion_intentos (ip_hash) values (v_ip);
    delete from public.vinculacion_intentos where cuando < now() - interval '1 day';
    return null;
  end if;
  update public.codigos_vinculacion set usado_en = now() where id = v_cod.id;
  return v_cod.user_id;
end;
$$;
revoke execute on function public.usar_codigo_vinculacion(text, text) from public, anon, authenticated;
grant execute on function public.usar_codigo_vinculacion(text, text) to service_role;
