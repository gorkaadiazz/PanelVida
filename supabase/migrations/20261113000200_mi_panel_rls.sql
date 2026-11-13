-- =============================================================================
-- Fase 2 (Mi Panel) · Row Level Security de las tablas nuevas
--
-- Igual que 20261110000200_rls.sql: RLS activado y cuatro políticas
-- (select, insert, update, delete) para `authenticated` que solo dejan tocar
-- las filas propias. `anon` no tiene ningún permiso.
-- (El `revoke ... from anon` de aquella migración solo cubrió las tablas que
-- existían entonces; por eso se repite aquí para las nuevas.)
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array['habitos', 'habito_marcas', 'tareas', 'movimientos', 'clientes_web']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('create policy "solo_mis_filas_select" on public.%I
      for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "solo_mis_filas_insert" on public.%I
      for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "solo_mis_filas_update" on public.%I
      for update to authenticated using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "solo_mis_filas_delete" on public.%I
      for delete to authenticated using ((select auth.uid()) = user_id)', t);

    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;
