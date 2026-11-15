-- =============================================================================
-- Traspasos entre tarjeta y efectivo (sacar del cajero / ingresar en el banco)
--
-- Un traspaso NO es ni ingreso ni gasto: no cambia el ahorro total, solo
-- dónde está el dinero. Por eso va en su propia tabla y no en movimientos
-- (así las sumas, revisiones y previsión de movimientos no cambian).
--   sacar    = de la tarjeta al efectivo (cajero)
--   ingresar = del efectivo a la tarjeta (ingresar en el banco)
-- Igual que las demás tablas: user_id = auth.uid(), RLS con 4 políticas,
-- triggers de sincronización, no revivir lo borrado y sin permisos para anon.
-- =============================================================================

create table public.traspasos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sentido text not null check (sentido in ('sacar', 'ingresar')),
  importe_centimos bigint not null check (importe_centimos > 0 and importe_centimos < 100000000000),
  fecha date not null check (fecha between date '2000-01-01' and date '2100-12-31'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now()
);

create trigger antes_de_guardar before insert or update on public.traspasos
  for each row execute function public.antes_de_guardar();
create trigger despues_de_borrar after delete on public.traspasos
  for each row execute function public.despues_de_borrar();
create trigger no_revivir_borrado before insert on public.traspasos
  for each row execute function public.no_revivir_borrado();
create index traspasos_user_sync_idx on public.traspasos (user_id, sync_at);
create index traspasos_user_fecha_idx on public.traspasos (user_id, fecha);

alter table public.traspasos enable row level security;
create policy "solo_mis_filas_select" on public.traspasos
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "solo_mis_filas_insert" on public.traspasos
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_update" on public.traspasos
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_delete" on public.traspasos
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.traspasos from anon;
revoke truncate, references, trigger on public.traspasos from authenticated;
