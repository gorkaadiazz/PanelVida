# Mi Panel: convenciones del proyecto

Panel de vida personal (hábitos, tareas, dinero, negocio web). Los estudios de 2º SMR se llevan en la web de exámenes (`src/lib/enlaces.ts`), que comparte proyecto de Supabase y cuenta: Mi Panel solo LEE sus tablas `modulos` y `evaluaciones` (tablas `soloLectura` en `sync/tablas.ts`) y nunca escribe en ellas. Las fases 4 (Estudios) y 6 (Examen IA y borrar cuenta) no se hacen.
Lo usan el autor y sus compañeros: **multiusuario, cada uno ve solo lo suyo**.
La especificación original está en `PROMPT.md`.

## Stack
- Vite + React + TypeScript (`strict`), `react-router-dom`, `vite-plugin-pwa`.
- Supabase: Auth con Google, Postgres con RLS, Storage y Edge Functions (Deno).
- Tests: Vitest (`npm test`). Lint: oxlint (`npm run lint`).
- Pocas dependencias: antes de añadir un paquete, justificar por qué no basta la plataforma.

## Estructura
```
src/
  main.tsx, App.tsx      arranque y rutas
  auth/                  sesión (AuthProvider, useSesion) y pantalla de login
  components/            piezas reutilizables (Layout, navegación, tarjetas…)
  pages/                 una carpeta o archivo por pantalla
  lib/                   lógica PURA (sin React ni Supabase) + supabase.ts
  sync/                  copia local en IndexedDB y cola de cambios (offline)
  styles/                tokens.css (diseño) y base.css
supabase/
  migrations/            SQL versionado: nunca editar una migración ya aplicada
  functions/             Edge Functions
tests/                   test de RLS en SQL
```

## Reglas
- **Idioma:** interfaz, nombres de dominio y comentarios en español. Fechas con `Intl` `es-ES` (dd/mm/aaaa), zona `Europe/Madrid`. Importes en euros con `Intl.NumberFormat('es-ES')`.
- **Dinero en céntimos** (enteros). Nunca `float` para importes.
- **Fechas de día** (`date`, cadena `AAAA-MM-DD`) para hábitos, tareas, faltas y movimientos. "Hoy" se calcula en hora de Madrid con `lib/fechas.ts`.
- **Lógica pura en `src/lib/`** con su `*.test.ts` al lado.
- **Datos:** las pantallas no llaman a Supabase directamente, sino a los repositorios y la capa `sync/`.
- **Claves:** en el frontend solo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (en `.env.local`, que no se sube). La service role solo como secreto de Supabase.
- **Base de datos:** todas las tablas tienen `user_id default auth.uid()`, RLS activado y 4 políticas `(select auth.uid()) = user_id` para `authenticated`. Las tablas hijas usan FK compuesta `(id, user_id)`. Las tablas sincronizables llevan `updated_at`, `sync_at` y los triggers `antes_de_guardar` y `despues_de_borrar`.
- **Acceso:** solo los emails de `emails_permitidos` pueden registrarse.
- **PWA:** el service worker precachea solo la app (HTML/JS/CSS/iconos). **Nunca** cachea respuestas de la API. Al cerrar sesión se borra la copia local (IndexedDB).
- **Diseño:** los colores, espacios y tipos salen de `src/styles/tokens.css`. Están documentados en `DESIGN.md`. Claro y oscuro según el sistema.

## Equipo (`.claude/agents/`)
frontend, supabase, diseno-ui, seguridad y tester. Ninguna fase se cierra sin `VEREDICTO: APROBADO` de **seguridad** y **tester**.

## Git
Commits pequeños con prefijo: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `db:`, `style:`.

## Comandos
- `npm run dev`: servidor local en http://localhost:5173
- `npm test -- --run`, `npm run lint`, `npm run build`
- `npx supabase db push`: aplicar migraciones (requiere `npx supabase link`)
