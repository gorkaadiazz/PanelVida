-- =============================================================================
-- Menos privilegios para los usuarios con sesión (hallazgo B2 de seguridad)
--
-- Supabase da por defecto TODOS los privilegios de tabla a `authenticated`,
-- también TRUNCATE, REFERENCES y TRIGGER. La app solo necesita select, insert,
-- update y delete (y RLS decide sobre qué filas). TRUNCATE es el peligroso:
-- vacía la tabla entera SIN pasar por RLS. Hoy la API (PostgREST) no lo expone,
-- pero el principio de mínimo privilegio dice que no hay que tener lo que no
-- se usa.
-- =============================================================================

revoke truncate, references, trigger on all tables in schema public from authenticated, anon;

-- Y que las tablas que se creen en migraciones futuras nazcan ya sin ellos.
alter default privileges in schema public
  revoke truncate, references, trigger on tables from authenticated, anon;
