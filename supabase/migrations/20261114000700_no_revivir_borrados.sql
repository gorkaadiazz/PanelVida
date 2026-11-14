-- =============================================================================
-- Ninguna fila borrada vuelve a aparecer
--
-- El trigger no_revivir_borrado (20261114000100) solo estaba en movimientos.
-- Pasa lo mismo en el resto de tablas de Mi Panel: si un dispositivo borra una
-- fila y otro, sin conexión, la edita después, al subir su cambio (upsert) la
-- volvería a crear en el servidor: una fila «zombi» que nadie ve y que
-- reaparece al entrar en un dispositivo nuevo. Con el trigger, el servidor
-- ignora ese insert (sin error) y el dispositivo baja el borrado justo después.
-- Las tablas de la web de exámenes no se tocan (modulos, evaluaciones…).
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array['habitos', 'habito_marcas', 'tareas', 'clientes_web', 'movimientos_fijos', 'ideas', 'cumpleanos', 'planes', 'deseos']
  loop
    execute format('create trigger no_revivir_borrado before insert on public.%I
                    for each row execute function public.no_revivir_borrado()', t);
  end loop;
end;
$$;
