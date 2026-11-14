-- =============================================================================
-- Fase 8 · Gastos fijos con frecuencia y revisiones de ahorro (sección 5)
--
-- 1. movimientos_fijos:
--    · frecuencia: diaria, semanal, mensual (la de siempre) o anual.
--      - mensual: `dia` = día del mes (si el mes es más corto, el último).
--      - anual:   `dia` + `mes` (1-12). El 29/2 se apunta el 28 en años no bisiestos.
--      - semanal: `dia` = día de la semana (1 = lunes … 7 = domingo).
--      - diaria:  se apunta UNA VEZ POR SEMANA, el domingo, con el importe
--                 por los días de esa semana (`dia` = 7, no se usa).
--    · inicio (fecha): desde cuándo cuenta. ultimo_apunte (fecha): el último
--      apunte hecho; el siguiente es el del periodo que viene después.
--      Sustituyen a `desde`/`ultimo_mes` (meses), que se quedan para las
--      versiones antiguas de la app (ver el punto 2).
--    · necesidad: 'esencial' o 'prescindible' (solo gastos; opcional).
-- 2. Compatibilidad con la app antigua (la que aún no se ha actualizado en
--    algún dispositivo): solo entiende fijos mensuales y solo escribe
--    `desde`/`ultimo_mes`. El trigger compatibilidad_fijos rellena `inicio` y
--    `ultimo_apunte` a partir de ellos cuando es esa app la que escribe. La app
--    nueva guarda en los fijos no mensuales desde = '9999-12' para que la
--    antigua nunca los apunte como si fueran de cada mes.
-- 3. movimientos:
--    · necesidad: igual que en los fijos.
--    · fijo_id: el fijo que lo apuntó (null = apuntado a mano). Es solo una
--      marca de origen, SIN clave foránea: al borrar un fijo, lo que ya
--      apuntó se queda y sigue sabiéndose que fue un gasto fijo. No da acceso
--      a nada: el fijo de otro usuario no se puede leer (RLS).
-- 4. revisiones: la revisión semanal (lunes a domingo) y mensual que la app
--    calcula sola al día siguiente de terminar el periodo (lib/revision.ts).
--    `datos` es la foto de ese momento (jsonb, tamaño limitado). Una por
--    usuario, tipo y periodo (unique): si dos dispositivos la hacen a la vez,
--    se queda la primera. El id es aleatorio (no se puede adivinar).
-- Igual que las demás tablas: user_id = auth.uid(), RLS con 4 políticas,
-- triggers de sincronización, no_revivir_borrado y sin permisos para anon.
-- =============================================================================

-- 1. Fijos ------------------------------------------------------------------
alter table public.movimientos_fijos
  add column frecuencia text not null default 'mensual'
    constraint movimientos_fijos_frecuencia_valida check (frecuencia in ('diaria', 'semanal', 'mensual', 'anual')),
  add column mes smallint
    constraint movimientos_fijos_mes_valido check (mes is null or mes between 1 and 12),
  add column inicio date
    constraint movimientos_fijos_inicio_valido check (inicio between date '2000-01-01' and date '2100-12-31'),
  add column ultimo_apunte date
    constraint movimientos_fijos_ultimo_apunte_valido check (ultimo_apunte is null or ultimo_apunte between date '2000-01-01' and date '2100-12-31'),
  add column necesidad text
    constraint movimientos_fijos_necesidad_valida check (necesidad is null or (tipo = 'gasto' and necesidad in ('esencial', 'prescindible'))),
  -- Solo los anuales llevan mes
  add constraint movimientos_fijos_mes_si_anual check ((frecuencia = 'anual') = (mes is not null)),
  -- Semanal (y diaria): día de la semana 1-7
  add constraint movimientos_fijos_dia_semana check (frecuencia not in ('semanal', 'diaria') or dia between 1 and 7),
  -- Anual: un día que exista en ese mes (29 de febrero vale)
  add constraint movimientos_fijos_dia_del_mes check (
    mes is null or dia <= case when mes = 2 then 29 when mes in (4, 6, 9, 11) then 30 else 31 end
  );

-- Fecha del día `dia` en un mes AAAA-MM (o el último día si el mes es más corto)
create or replace function public.fecha_en_mes(mes text, dia integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(
    split_part(mes, '-', 1)::int,
    split_part(mes, '-', 2)::int,
    least(dia, extract(day from (to_date(mes || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day'))::int)
  );
$$;
revoke execute on function public.fecha_en_mes(text, integer) from public, anon;

-- Los fijos que ya había (todos mensuales). El update pasa por antes_de_guardar
-- (sube sync_at), así que los dispositivos bajan las columnas nuevas.
update public.movimientos_fijos
set inicio = to_date(desde || '-01', 'YYYY-MM-DD'),
    ultimo_apunte = case when ultimo_mes is null then null else public.fecha_en_mes(ultimo_mes, dia) end;

-- 2. Compatibilidad con la app antigua
create or replace function public.compatibilidad_fijos()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  mes_valido constant text := '^[0-9]{4}-(0[1-9]|1[0-2])$';
begin
  -- Si `desde` o `ultimo_mes` no tienen forma de mes, no se calcula nada: que
  -- lo rechacen sus propios check (y no un error de fecha aquí).
  if new.inicio is null and new.desde ~ mes_valido then
    new.inicio := to_date(new.desde || '-01', 'YYYY-MM-DD');
  end if;
  if tg_op = 'UPDATE' and new.frecuencia = 'mensual' then
    -- La app antigua reanuda cambiando solo `desde` y apunta cambiando solo `ultimo_mes`
    if new.desde is distinct from old.desde and new.inicio is not distinct from old.inicio and new.desde ~ mes_valido then
      new.inicio := to_date(new.desde || '-01', 'YYYY-MM-DD');
    end if;
    if new.ultimo_mes is distinct from old.ultimo_mes and new.ultimo_apunte is not distinct from old.ultimo_apunte
       and new.ultimo_mes ~ mes_valido then
      new.ultimo_apunte := public.fecha_en_mes(new.ultimo_mes, new.dia);
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.compatibilidad_fijos() from public, anon, authenticated;

create trigger compatibilidad_fijos before insert or update on public.movimientos_fijos
  for each row execute function public.compatibilidad_fijos();

-- NOT NULL se comprueba después de los triggers BEFORE: la app antigua, que no
-- manda `inicio`, sigue pudiendo crear fijos.
alter table public.movimientos_fijos alter column inicio set not null;

-- 3. Movimientos ------------------------------------------------------------
alter table public.movimientos
  add column necesidad text
    constraint movimientos_necesidad_valida check (necesidad is null or (tipo = 'gasto' and necesidad in ('esencial', 'prescindible'))),
  add column fijo_id uuid;

-- 4. Revisiones -------------------------------------------------------------
create table public.revisiones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('semanal', 'mensual')),
  inicio date not null check (inicio between date '2000-01-01' and date '2100-12-31'),
  fin date not null,
  datos jsonb not null check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) <= 32768),
  vista boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now(),
  -- Semana de lunes a domingo; mes del día 1 al último
  constraint revisiones_periodo_valido check (
    (tipo = 'semanal' and extract(isodow from inicio) = 1 and fin = inicio + 6)
    or (tipo = 'mensual' and extract(day from inicio) = 1 and fin = (inicio + interval '1 month - 1 day')::date)
  ),
  constraint revisiones_una_por_periodo unique (user_id, tipo, inicio)
);

create trigger antes_de_guardar before insert or update on public.revisiones
  for each row execute function public.antes_de_guardar();
create trigger despues_de_borrar after delete on public.revisiones
  for each row execute function public.despues_de_borrar();
create trigger no_revivir_borrado before insert on public.revisiones
  for each row execute function public.no_revivir_borrado();
create index revisiones_user_sync_idx on public.revisiones (user_id, sync_at);

alter table public.revisiones enable row level security;
create policy "solo_mis_filas_select" on public.revisiones
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "solo_mis_filas_insert" on public.revisiones
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_update" on public.revisiones
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_delete" on public.revisiones
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.revisiones from anon;
revoke truncate, references, trigger on public.revisiones from authenticated;
