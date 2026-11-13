-- =============================================================================
-- Fase 2 (Mi Panel) · Columnas nuevas en perfiles y modulos
-- =============================================================================

-- ---------------------------------------------------------------------------
-- perfiles
-- ---------------------------------------------------------------------------

-- Meta de ahorro (en céntimos). NULL = sin meta.
alter table public.perfiles
  add column meta_ahorro_centimos bigint
    check (meta_ahorro_centimos is null or (meta_ahorro_centimos >= 0 and meta_ahorro_centimos < 100000000000));

-- Semanas de clase del curso. Sirven para el límite de faltas de cada módulo:
--   horas que se pueden faltar = horas_semanales × semanas_curso × límite % / 100
-- En la app vieja estaba dentro de `preferencias` (clave semanas_curso, 30 por
-- defecto); ahora es una columna con su comprobación de rango.
alter table public.perfiles
  add column semanas_curso integer not null default 30 check (semanas_curso between 1 and 52);

-- Se copia el valor que ya tuviera cada usuario en sus preferencias.
update public.perfiles
set semanas_curso = round((preferencias ->> 'semanas_curso')::numeric)::integer
where jsonb_typeof(preferencias -> 'semanas_curso') = 'number'
  and (preferencias ->> 'semanas_curso')::numeric between 1 and 52;

-- Marca de "ya se han creado los datos iniciales de Mi Panel" (ver inicializar_cuenta).
alter table public.perfiles
  add column mi_panel_inicializado boolean not null default false;

-- Tema: Mi Panel sigue al sistema por defecto. Solo cambia el valor por
-- defecto; los perfiles existentes conservan lo que eligieron.
alter table public.perfiles alter column tema set default 'auto';

-- ---------------------------------------------------------------------------
-- modulos
-- ---------------------------------------------------------------------------

-- Límite de faltas propio del módulo (%). NULL = se usa perfiles.limite_faltas.
alter table public.modulos
  add column limite_faltas numeric(5, 2) check (limite_faltas between 0 and 100);

-- ¿El módulo tiene exámenes/notas? La Formación en Empresa (FE) no.
alter table public.modulos
  add column con_examenes boolean not null default true;

-- Módulos FE que ya existían (creados con la app vieja). El trigger
-- antes_de_guardar actualiza updated_at/sync_at, así que los dispositivos
-- se enteran del cambio en la siguiente sincronización.
update public.modulos set con_examenes = false where upper(abreviatura) = 'FE';
