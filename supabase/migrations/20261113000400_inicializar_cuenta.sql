-- =============================================================================
-- Fase 2 (Mi Panel) · Datos iniciales de la cuenta
--
-- La app llama a `inicializar_cuenta()` justo después de iniciar sesión.
-- Es idempotente: se puede llamar todas las veces que se quiera.
--   1. Asegura que existe la fila de `perfiles` del usuario.
--   2. Si el perfil aún no tiene la marca `mi_panel_inicializado`:
--        - crea los 3 hábitos iniciales (Gimnasio, Leer 20 min, Dormir 8 h);
--        - SOLO si el usuario no tiene ningún módulo (cuenta nueva, no viene
--          de la app vieja), crea los 8 módulos de 2º SMR;
--        - pone la marca.
-- Devuelve true si en esta llamada se han creado datos (la app puede entonces
-- descargar los cambios), false si ya estaba inicializada.
--
-- SECURITY INVOKER: se ejecuta con los permisos del usuario, así que pasa por
-- las políticas RLS y solo puede tocar sus propias filas.
-- =============================================================================

create or replace function public.inicializar_cuenta()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inicializado boolean;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '42501';
  end if;

  -- 1. Perfil
  insert into public.perfiles (id, user_id)
  values (v_uid, v_uid)
  on conflict (id) do nothing;

  -- Se bloquea la fila del perfil: si dos dispositivos llaman a la vez, el
  -- segundo espera al primero y ya ve la marca puesta (no duplica hábitos).
  select mi_panel_inicializado into v_inicializado
  from public.perfiles
  where id = v_uid
  for update;

  if v_inicializado then
    return false;
  end if;

  -- 2. Hábitos iniciales
  insert into public.habitos (user_id, nombre, orden)
  values
    (v_uid, 'Gimnasio', 0),
    (v_uid, 'Leer 20 min', 1),
    (v_uid, 'Dormir 8 h', 2);

  -- 3. Módulos de 2º SMR, solo en cuentas sin módulos.
  --    Colores: valor del modo claro de los tokens --mod-* (src/styles/tokens.css).
  if not exists (select 1 from public.modulos where user_id = v_uid) then
    insert into public.modulos (user_id, abreviatura, nombre, color, imagen, orden, con_examenes)
    values
      (v_uid, 'SOR',  'Sistemas Operativos en Red',                         '#5284b7', 'sistemas',  0, true),
      (v_uid, 'SI',   'Seguridad Informática',                              '#b2686b', 'candado',   1, true),
      (v_uid, 'SR',   'Servicios en Red',                                   '#22928f', 'red',       2, true),
      (v_uid, 'AO',   'Aplicaciones Ofimáticas',                            '#a6753d', 'documento', 3, true),
      (v_uid, 'CNV',  'Computación en la Nube y Virtualización (optativa)', '#7f76b5', 'nube',      4, true),
      (v_uid, 'IPE2', 'Itinerario Personal para la Empleabilidad II',       '#57905f', 'maletin',   5, true),
      (v_uid, 'PI',   'Proyecto Intermodular',                              '#a36a97', 'cohete',    6, true),
      (v_uid, 'FE',   'Formación en Empresa',                               '#77828a', 'empresa',   7, false);
  end if;

  -- 4. Marca
  update public.perfiles set mi_panel_inicializado = true where id = v_uid;
  return true;
end;
$$;

-- Solo usuarios con sesión.
revoke all on function public.inicializar_cuenta() from public, anon;
grant execute on function public.inicializar_cuenta() to authenticated;
