-- =============================================================================
-- Fase 8 · Lista de deseos (wishlist) conectada al ahorro
--
-- Lo que falta para cada artículo lo calcula la app con el ahorro total de
-- Dinero (lib/deseos.ts). Al marcarlo como comprado, la app puede apuntar el
-- gasto en movimientos (preguntando antes) y pasa al historial.
-- Enlace opcional, solo http(s). Precio en céntimos.
-- Igual que las demás tablas: user_id = auth.uid(), RLS con 4 políticas,
-- triggers de sincronización y sin permisos para anon.
-- =============================================================================

create table public.deseos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  articulo text not null check (length(articulo) between 1 and 120),
  precio_centimos bigint not null check (precio_centimos > 0 and precio_centimos < 100000000000),
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  enlace text check (enlace ~* '^https?://[^[:space:]]+$' and length(enlace) <= 2000),
  notas text not null default '' check (length(notas) <= 1000),
  comprado boolean not null default false,
  comprado_en date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now(),
  constraint deseos_comprado_en check (comprado or comprado_en is null)
);

create trigger antes_de_guardar before insert or update on public.deseos
  for each row execute function public.antes_de_guardar();
create trigger despues_de_borrar after delete on public.deseos
  for each row execute function public.despues_de_borrar();
create index deseos_user_sync_idx on public.deseos (user_id, sync_at);

alter table public.deseos enable row level security;
create policy "solo_mis_filas_select" on public.deseos
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "solo_mis_filas_insert" on public.deseos
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_update" on public.deseos
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_delete" on public.deseos
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.deseos from anon;
revoke truncate, references, trigger on public.deseos from authenticated;
