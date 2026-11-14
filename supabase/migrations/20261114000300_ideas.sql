-- =============================================================================
-- Fase 8 · Bandeja rápida de ideas
--
-- Lo que se apunta con el botón «+» global, sin elegir nada más. Desde la
-- bandeja se convierte en tarea, plan o artículo de la lista de deseos (y
-- entonces se borra), se archiva o se borra.
-- Igual que las demás tablas: user_id = auth.uid(), RLS con 4 políticas,
-- triggers de sincronización y sin permisos para anon.
-- =============================================================================

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  texto text not null check (length(texto) between 1 and 500),
  archivada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now()
);

create trigger antes_de_guardar before insert or update on public.ideas
  for each row execute function public.antes_de_guardar();
create trigger despues_de_borrar after delete on public.ideas
  for each row execute function public.despues_de_borrar();
create index ideas_user_sync_idx on public.ideas (user_id, sync_at);

alter table public.ideas enable row level security;
create policy "solo_mis_filas_select" on public.ideas
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "solo_mis_filas_insert" on public.ideas
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_update" on public.ideas
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_delete" on public.ideas
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.ideas from anon;
revoke truncate, references, trigger on public.ideas from authenticated;
