-- =============================================================================
-- Fase 8 · Planes pendientes
--
-- Estados: idea → planeado (con fecha) → hecho. Al marcar «hecho» se puede
-- añadir una valoración (1-5) y un comentario. Coste aproximado en céntimos.
-- Igual que las demás tablas: user_id = auth.uid(), RLS con 4 políticas,
-- triggers de sincronización y sin permisos para anon.
-- =============================================================================

create table public.planes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null check (length(titulo) between 1 and 120),
  tipo text not null default 'otro' check (tipo in ('sitio', 'viaje', 'actividad', 'comida', 'otro')),
  con_quien text not null default '' check (length(con_quien) <= 120),
  fecha date,
  coste_centimos bigint check (coste_centimos >= 0 and coste_centimos < 100000000000),
  notas text not null default '' check (length(notas) <= 1000),
  estado text not null default 'idea' check (estado in ('idea', 'planeado', 'hecho')),
  valoracion smallint check (valoracion between 1 and 5),
  comentario text not null default '' check (length(comentario) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now(),
  constraint planes_planeado_con_fecha check (estado <> 'planeado' or fecha is not null),
  constraint planes_valoracion_si_hecho check (valoracion is null or estado = 'hecho')
);

create trigger antes_de_guardar before insert or update on public.planes
  for each row execute function public.antes_de_guardar();
create trigger despues_de_borrar after delete on public.planes
  for each row execute function public.despues_de_borrar();
create index planes_user_sync_idx on public.planes (user_id, sync_at);

alter table public.planes enable row level security;
create policy "solo_mis_filas_select" on public.planes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "solo_mis_filas_insert" on public.planes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_update" on public.planes
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_delete" on public.planes
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.planes from anon;
revoke truncate, references, trigger on public.planes from authenticated;
