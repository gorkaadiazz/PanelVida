-- =============================================================================
-- Fase 2 (Mi Panel) · Arreglo: borrar la cuenta fallaba
--
-- Problema: la Edge Function `borrar-cuenta` llama a auth.admin.deleteUser.
-- Al borrar la fila de auth.users, el `on delete cascade` borra todas las
-- filas del usuario, y el trigger despues_de_borrar de cada una intentaba
-- apuntarla en `borrados`. Pero `borrados.user_id` referencia a auth.users,
-- y ese usuario ya no existe: la comprobación de la clave foránea fallaba y
-- se deshacía TODO el borrado de la cuenta.
--
-- Solución: solo se apunta el borrado si el usuario sigue existiendo.
-- ¿Funciona dentro del cascade? Sí. Los borrados en cascada los ejecutan
-- triggers de clave foránea que se disparan DESPUÉS de borrar la fila de
-- auth.users, en la misma transacción, y los triggers ven los cambios hechos
-- por la sentencia que los dispara. Así que en ese momento
--   exists (select 1 from auth.users where id = old.user_id)
-- devuelve false y no se inserta nada. (Además, apuntar el borrado no sirve
-- de nada: no quedan dispositivos de ese usuario a los que avisar, y sus
-- filas de `borrados` también se están borrando en cascada.)
-- En un borrado normal desde la app, el usuario existe y todo sigue igual.
-- =============================================================================

create or replace function public.despues_de_borrar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from auth.users where id = old.user_id) then
    insert into public.borrados (user_id, tabla, fila_id)
    values (old.user_id, tg_table_name, old.id);
  end if;
  return old;
end;
$$;
