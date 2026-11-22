-- =============================================================================
-- Fase 9 · Lista de la compra (3/3): la Lista de casa (compartida)
--
-- Las filas las ven y las tocan TODOS los miembros del hogar
-- (es_miembro(hogar_id)), no solo quien las creó. Cómo encaja con la
-- sincronización (sync/):
--   · Descargar: igual que siempre (sync_at > última descarga); el RLS
--     decide qué filas llegan.
--   · Borrados: `borrados` guarda el user_id de quien CREÓ la fila y solo él
--     la lee, así que los demás no se enterarían. Por eso esta tabla tiene
--     los suyos en `borrados_hogar`, que leen todos los miembros.
--   · No revivir: si alguien edita sin conexión algo que otro ha borrado, el
--     servidor ignora el insert (mira borrados_hogar).
--   · Entrar en un hogar con filas antiguas o ser expulsado: lo resuelve la
--     app (sync/motor.ts), que vuelve a bajar la tabla entera o la vacía
--     cuando cambia el hogar.
--   · «Quién lo marcó» (marcado_por) lo pone el servidor con auth.uid():
--     la app no lo puede falsear.
-- =============================================================================

create table public.compra_casa (
  id uuid primary key default gen_random_uuid(),
  -- Quien lo apuntó (no cambia aunque lo edite otro)
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  cantidad text check (cantidad is null or length(cantidad) between 1 and 30),
  seccion text check (seccion is null or seccion in (
    'fruta_verdura', 'carne_pescado', 'lacteos', 'panaderia', 'despensa',
    'congelados', 'bebidas', 'limpieza', 'higiene', 'otros')),
  notas text not null default '' check (length(notas) <= 300),
  comprado boolean not null default false,
  comprado_en timestamptz,
  marcado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now(),
  check (comprado or comprado_en is null)
);
create index compra_casa_hogar_sync_idx on public.compra_casa (hogar_id, sync_at);
create index compra_casa_user_idx on public.compra_casa (user_id);

-- Borrados de las tablas compartidas, por hogar (los leen todos sus miembros).
-- Sin clave foránea al hogar: si el hogar se borra, se limpian aparte.
create table public.borrados_hogar (
  id bigint generated always as identity primary key,
  hogar_id uuid not null,
  tabla text not null,
  fila_id uuid not null,
  sync_at timestamptz not null default clock_timestamp()
);
create index borrados_hogar_sync_idx on public.borrados_hogar (hogar_id, sync_at);
create index borrados_hogar_fila_idx on public.borrados_hogar (tabla, fila_id);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

create trigger antes_de_guardar before insert or update on public.compra_casa
  for each row execute function public.antes_de_guardar();

-- El hogar no cambia; marcado_por lo pone el servidor
create or replace function public.casa_antes_de_guardar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.hogar_id := old.hogar_id;
    if new.comprado and old.comprado then
      new.marcado_por := old.marcado_por;
      new.comprado_en := coalesce(new.comprado_en, old.comprado_en);
    end if;
  end if;
  if new.comprado and (tg_op = 'INSERT' or not old.comprado) then
    new.marcado_por := auth.uid();
    new.comprado_en := coalesce(new.comprado_en, now());
  elsif not new.comprado then
    new.marcado_por := null;
    new.comprado_en := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.casa_antes_de_guardar() from public, anon, authenticated;
-- «casa_…» va después de «antes_de_guardar» (orden alfabético): si el servidor
-- se queda con la versión que tenía, aquí no cambia nada.
create trigger casa_antes_de_guardar before insert or update on public.compra_casa
  for each row execute function public.casa_antes_de_guardar();

create or replace function public.despues_de_borrar_hogar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Si se está borrando el hogar entero (cascada), no hace falta avisar a nadie
  if exists (select 1 from public.hogares h where h.id = old.hogar_id) then
    insert into public.borrados_hogar (hogar_id, tabla, fila_id) values (old.hogar_id, tg_table_name, old.id);
  end if;
  return old;
end;
$$;
revoke execute on function public.despues_de_borrar_hogar() from public, anon, authenticated;
create trigger despues_de_borrar_hogar after delete on public.compra_casa
  for each row execute function public.despues_de_borrar_hogar();

create or replace function public.no_revivir_borrado_hogar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.borrados_hogar b where b.tabla = tg_table_name and b.fila_id = new.id) then
    return null;
  end if;
  return new;
end;
$$;
revoke execute on function public.no_revivir_borrado_hogar() from public, anon, authenticated;
create trigger no_revivir_borrado_hogar before insert on public.compra_casa
  for each row execute function public.no_revivir_borrado_hogar();

-- Como mucho 1.000 artículos por hogar
create or replace function public.tope_compra_casa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.compra_casa where id = new.id) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('compra_casa:' || new.hogar_id::text));
  if (select count(*) from public.compra_casa where hogar_id = new.hogar_id) >= 1000 then
    raise exception 'La lista está llena: quitad los comprados' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.tope_compra_casa() from public, anon, authenticated;
create trigger tope_compra_casa before insert on public.compra_casa
  for each row execute function public.tope_compra_casa();

-- Lo más comprado, a nombre de quien lo marca (misma función que Mi lista)
create trigger apuntar_frecuente after insert or update of comprado on public.compra_casa
  for each row execute function public.apuntar_frecuente();

-- Al borrar un hogar, sus borrados ya no sirven a nadie
create or replace function public.limpiar_borrados_de_hogar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.borrados_hogar where hogar_id = old.id;
  return null;
end;
$$;
revoke execute on function public.limpiar_borrados_de_hogar() from public, anon, authenticated;
create trigger limpiar_borrados_de_hogar after delete on public.hogares
  for each row execute function public.limpiar_borrados_de_hogar();

-- -----------------------------------------------------------------------------
-- RLS: todos los miembros del hogar
-- -----------------------------------------------------------------------------

alter table public.compra_casa enable row level security;
create policy "miembros_select" on public.compra_casa
  for select to authenticated using ((select public.es_miembro(hogar_id)));
create policy "miembros_insert" on public.compra_casa
  for insert to authenticated with check ((select auth.uid()) = user_id and (select public.es_miembro(hogar_id)));
create policy "miembros_update" on public.compra_casa
  for update to authenticated using ((select public.es_miembro(hogar_id))) with check ((select public.es_miembro(hogar_id)));
create policy "miembros_delete" on public.compra_casa
  for delete to authenticated using ((select public.es_miembro(hogar_id)));

alter table public.borrados_hogar enable row level security;
create policy "miembros_select" on public.borrados_hogar
  for select to authenticated using ((select public.es_miembro(hogar_id)));

revoke all on public.compra_casa, public.borrados_hogar from anon;
revoke truncate, references, trigger on public.compra_casa from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.borrados_hogar from authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: los cambios de los demás llegan al momento (Realtime aplica RLS)
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.compra_casa, public.borrados_hogar, public.hogar_miembros';
  end if;
end;
$$;
