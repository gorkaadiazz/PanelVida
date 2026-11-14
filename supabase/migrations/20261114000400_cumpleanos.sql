-- =============================================================================
-- Fase 8 · Cumpleaños
--
-- Día y mes obligatorios; el año es opcional (si está, se calcula la edad que
-- cumple). El 29 de febrero vale (en años no bisiestos se celebra el 28: lo
-- calcula la app, lib/cumpleanos.ts).
-- Igual que las demás tablas: user_id = auth.uid(), RLS con 4 políticas,
-- triggers de sincronización y sin permisos para anon.
-- =============================================================================

create table public.cumpleanos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null check (length(nombre) between 1 and 80),
  dia smallint not null,
  mes smallint not null check (mes between 1 and 12),
  anio smallint check (anio between 1900 and 2100),
  notas text not null default '' check (length(notas) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now(),
  -- El día tiene que existir en ese mes (el 29 de febrero sí)
  constraint cumpleanos_dia_valido check (
    dia >= 1 and dia <= case mes when 2 then 29 when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30 else 31 end
  ),
  -- Y si hay año, el 29 de febrero solo en un año bisiesto
  constraint cumpleanos_bisiesto check (
    anio is null or not (mes = 2 and dia = 29)
    or (anio % 4 = 0 and (anio % 100 <> 0 or anio % 400 = 0))
  )
);

create trigger antes_de_guardar before insert or update on public.cumpleanos
  for each row execute function public.antes_de_guardar();
create trigger despues_de_borrar after delete on public.cumpleanos
  for each row execute function public.despues_de_borrar();
create index cumpleanos_user_sync_idx on public.cumpleanos (user_id, sync_at);

alter table public.cumpleanos enable row level security;
create policy "solo_mis_filas_select" on public.cumpleanos
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "solo_mis_filas_insert" on public.cumpleanos
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_update" on public.cumpleanos
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_delete" on public.cumpleanos
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.cumpleanos from anon;
revoke truncate, references, trigger on public.cumpleanos from authenticated;
