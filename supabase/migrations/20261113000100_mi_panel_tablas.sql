-- =============================================================================
-- Fase 2 (Mi Panel) · Tablas del panel de vida: hábitos, tareas, dinero y
-- negocio web.
--
-- Mismas convenciones que 20261110000100_tablas.sql:
--   id          uuid generado en el cliente (permite crear registros sin conexión)
--   user_id     dueño de la fila; por defecto, el usuario de la sesión
--   created_at  cuándo se creó
--   updated_at  cuándo se modificó EN EL DISPOSITIVO (gana el más reciente)
--   sync_at     cuándo llegó el cambio AL SERVIDOR
-- Las tablas hijas usan FK compuesta (id, user_id) para que nadie pueda colgar
-- una fila suya de una fila de otro usuario.
-- =============================================================================

-- Hábitos (al empezar: Gimnasio, Leer 20 min, Dormir 8 h; ver inicializar_cuenta)
create table public.habitos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null check (length(nombre) between 1 and 60),
  orden integer not null default 0,
  archivado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now(),
  unique (id, user_id)
);

-- Marcas de los hábitos: una fila por hábito y día.
--
-- IMPORTANTE (sincronización sin conexión): la cola de cambios sube las filas
-- con upsert por `id` y gana el `updated_at` más reciente. Para que dos
-- dispositivos que marcan el mismo hábito el mismo día escriban LA MISMA fila
-- (y no choquen con el unique (habito_id, fecha)), el cliente genera el id de
-- forma DETERMINISTA: UUID v5 a partir de habito_id + fecha (AAAA-MM-DD).
-- Desmarcar un día NO borra la fila: pone hecho = false. Así el último cambio
-- gana siempre (un borrado no tiene updated_at con el que compararse).
create table public.habito_marcas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habito_id uuid not null,
  fecha date not null,
  hecho boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now(),
  unique (habito_id, fecha),
  foreign key (habito_id, user_id) references public.habitos (id, user_id) on delete cascade
);

create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  texto text not null check (length(texto) between 1 and 200),
  fecha_limite date,
  hecha boolean not null default false,
  hecha_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now()
);

-- Dinero: importes SIEMPRE en céntimos (enteros) y positivos; el signo lo da `tipo`.
create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  concepto text not null check (length(concepto) between 1 and 120),
  importe_centimos bigint not null check (importe_centimos > 0 and importe_centimos < 100000000000),
  fecha date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now()
);

-- Negocio de páginas web: clientes/proyectos en un tablero por estado.
create table public.clientes_web (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null check (length(nombre) between 1 and 120),
  precio_centimos bigint not null default 0 check (precio_centimos >= 0 and precio_centimos < 100000000000),
  notas text not null default '' check (length(notas) <= 2000),
  estado text not null default 'contacto' check (estado in ('contacto', 'propuesta', 'en_curso', 'entregado')),
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers e índice de sincronización (user_id, sync_at)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['habitos', 'habito_marcas', 'tareas', 'movimientos', 'clientes_web']
  loop
    execute format('create trigger antes_de_guardar before insert or update on public.%I
                    for each row execute function public.antes_de_guardar()', t);
    execute format('create trigger despues_de_borrar after delete on public.%I
                    for each row execute function public.despues_de_borrar()', t);
    execute format('create index %I on public.%I (user_id, sync_at)', t || '_user_sync_idx', t);
  end loop;
end;
$$;

-- Índices de las consultas más habituales
-- (habito_marcas.habito_id ya está cubierto por el unique (habito_id, fecha))
create index habito_marcas_user_fecha_idx on public.habito_marcas (user_id, fecha);
create index tareas_user_hecha_fecha_idx on public.tareas (user_id, hecha, fecha_limite);
create index movimientos_user_fecha_idx on public.movimientos (user_id, fecha);
