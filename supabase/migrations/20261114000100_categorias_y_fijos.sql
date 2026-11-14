-- =============================================================================
-- Categorías de gastos y movimientos fijos (cada mes)
--
-- 1. movimientos.categoria: opcional y SOLO en gastos (los ingresos no llevan).
--    Lista cerrada: la misma que CATEGORIAS en src/lib/dinero.ts.
-- 2. movimientos_fijos: gastos (o ingresos) que se repiten cada mes el mismo
--    día. La app apunta el movimiento de cada mes ella sola (lib/fijos.ts),
--    con un id DETERMINISTA (fijo + mes) para que dos dispositivos no lo
--    apunten dos veces. `ultimo_mes` es el último mes ya apuntado.
--    Igual que las demás tablas: user_id = auth.uid(), RLS con 4 políticas,
--    triggers de sincronización y sin permisos para anon.
-- =============================================================================

alter table public.movimientos
  add column categoria text
  constraint movimientos_categoria_valida check (
    categoria is null
    or (tipo = 'gasto' and categoria in
      ('comida', 'transporte', 'ocio', 'compras', 'casa', 'suscripciones', 'estudios', 'salud', 'otros'))
  );

create table public.movimientos_fijos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  concepto text not null check (length(concepto) between 1 and 120),
  importe_centimos bigint not null check (importe_centimos > 0 and importe_centimos < 100000000000),
  categoria text check (
    categoria is null
    or (tipo = 'gasto' and categoria in
      ('comida', 'transporte', 'ocio', 'compras', 'casa', 'suscripciones', 'estudios', 'salud', 'otros'))
  ),
  -- Día del mes (si el mes es más corto, el último día: 31 → 28 de febrero)
  dia smallint not null check (dia between 1 and 31),
  -- Meses AAAA-MM: desde cuándo se apunta y el último ya apuntado
  desde text not null check (desde ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ultimo_mes text check (ultimo_mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now()
);

create trigger antes_de_guardar before insert or update on public.movimientos_fijos
  for each row execute function public.antes_de_guardar();
create trigger despues_de_borrar after delete on public.movimientos_fijos
  for each row execute function public.despues_de_borrar();
create index movimientos_fijos_user_sync_idx on public.movimientos_fijos (user_id, sync_at);

alter table public.movimientos_fijos enable row level security;

create policy "solo_mis_filas_select" on public.movimientos_fijos
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "solo_mis_filas_insert" on public.movimientos_fijos
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_update" on public.movimientos_fijos
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "solo_mis_filas_delete" on public.movimientos_fijos
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.movimientos_fijos from anon;
-- Por si los privilegios por defecto no se aplicaron (mínimo privilegio, B2)
revoke truncate, references, trigger on public.movimientos_fijos from authenticated;

-- 3. Un movimiento borrado no vuelve. El apunte de un fijo tiene un id fijo
--    (fijo + mes): si un dispositivo sin conexión lo apunta después de que
--    otro lo haya apuntado y el usuario lo haya borrado, al subirlo lo
--    volvería a crear. Este trigger lo ignora en silencio (no es un error:
--    el dispositivo baja el borrado justo después y quita su copia).
--    Los ids aleatorios (v4) nunca se repiten, así que no afecta a nada más.
create index borrados_user_tabla_fila_idx on public.borrados (user_id, tabla, fila_id);

create or replace function public.no_revivir_borrado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.borrados b
    where b.user_id = new.user_id and b.tabla = tg_table_name and b.fila_id = new.id
  ) then
    return null;
  end if;
  return new;
end;
$$;
revoke execute on function public.no_revivir_borrado() from public, anon, authenticated;

create trigger no_revivir_borrado before insert on public.movimientos
  for each row execute function public.no_revivir_borrado();
