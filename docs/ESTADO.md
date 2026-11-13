# Mi Panel: estado del proyecto

Actualizado el 13/11/2026, tras el commit `77d5896`. Fase 3 hecha en código; pendiente de la reauditoría de seguridad y de probarla en navegador con el Supabase real.

## Resumen

| Fase | Qué es | Estado |
|---|---|---|
| 1 | Proyecto base, login con Google, PWA | Cerrada |
| 2 | Esquema de base de datos y RLS | Cerrada (aprobada por seguridad y tester) |
| 3 | Inicio, Hábitos, Tareas | **Hecha en código** (tester: aprobado; seguridad: reauditando tras los arreglos). Falta probarla en navegador real |
| 4 | Estudios sin IA | Sin empezar |
| 5 | Dinero y Negocio web | Sin empezar (las tablas ya existen) |
| 6 | Examen IA y borrar cuenta | Sin empezar |
| 7 | Despliegue | Sin empezar |

Comprobaciones ahora mismo: `npm test -- --run` 273/273, `npm run test:sql` 40/40, `npm run lint`, `npm run typecheck` y `npm run build` sin errores.

**Aviso importante:** todo está probado en simulación (Postgres dentro de Node, IndexedDB falso, servidor falso). Nada de las fases 2 y 3 se ha probado todavía contra el Supabase real ni en un navegador real.

## Qué tienes que hacer tú

1. **Aplicar las migraciones nuevas** en Supabase siguiendo [MIGRAR.md](MIGRAR.md). Son los seis archivos `supabase/migrations/20261113*.sql`, en orden. Sin esto la app no tiene tablas de hábitos ni tareas con las que sincronizar.
2. Si aún no lo has hecho, añadir `http://localhost:5173` a las URL de vuelta de Supabase ([SUPABASE.md](SUPABASE.md)) para que el login funcione en local.
3. Añadir los emails de tus compañeros a la tabla `emails_permitidos` cuando quieras que entren.

## Qué está hecho

### Fase 1: base, login y PWA
- Proyecto Vite + React + TypeScript estricto, con oxlint y Vitest.
- Login con Google mediante Supabase Auth. Solo entran los emails de `emails_permitidos`.
- Navegación inferior en el móvil y barra lateral en el PC. Las pantallas de Hábitos, Tareas, Estudios, Dinero y Negocio existen, pero vacías.
- PWA instalable. El service worker guarda solo la app (HTML, JS, CSS, iconos) y nunca respuestas de la API.
- Sistema visual «horario con boli azul»: papel de cuadrícula frío, tinta azul, un color apagado por módulo, claro y oscuro según el sistema. Está en `src/styles/tokens.css` y documentado en `DESIGN.md`.

### Fase 2: base de datos
- Se reutiliza el proyecto de Supabase de la app de exámenes anterior. Lo nuevo va en migraciones nuevas; las antiguas no se tocan.
- Tablas nuevas: `habitos`, `habito_marcas`, `tareas`, `movimientos` y `clientes_web`.
- Columnas nuevas en `perfiles` (meta de ahorro, semanas de curso) y en `modulos` (límite de faltas, con o sin exámenes).
- Función `inicializar_cuenta()`: la primera vez crea Gimnasio, Leer 20 min y Dormir 8 h, y los 8 módulos de 2º SMR si la cuenta no tenía ninguno.
- Arreglo del borrado de cuenta: antes fallaba al borrar el usuario por el registro de borrados.
- Migración `20261113000600`: quita a los usuarios permisos que no usan (TRUNCATE, REFERENCES, TRIGGER).
- Banco de pruebas SQL (`npm run test:sql`): 40 casos que aplican todas las migraciones y comprueban que el usuario B no puede ver, editar ni borrar nada del usuario A.

### Fase 3, primera mitad: cimientos
- `src/lib/fechas.ts`: «hoy» en hora de Madrid, sumar y restar días, formato español.
- `src/lib/habitos.ts`: racha actual, porcentaje de hoy y datos de la cuadrícula de 7 días.
- `src/lib/tareas.ts`: orden de la lista y urgencia (atrasada, hoy o mañana, normal).
- `src/sync/`: copia local en IndexedDB, cola de cambios pendientes, descarga de lo nuevo y subida al recuperar la conexión.
- `src/repos/`: repositorios de hábitos y tareas, y hooks de React (`useHabitos`, `useMarcas`, `useTareas`, `useEstadoSync`). Es lo único que usarán las pantallas.
- Cierre de sesión: borra la sesión y la copia local aunque no haya conexión, y avisa si quedaban cambios sin subir. La pantalla Cuenta ya lo usa.

### Fase 3, segunda mitad: pantallas
- **Hábitos:** resumen de hoy (x/y y %), cuadrícula de los últimos 7 días para marcar y corregir, racha de cada hábito. Botón «Editar» para cambiar el nombre, el orden y archivar; los archivados se recuperan o se borran (con confirmación).
- **Tareas:** alta con fecha límite opcional, editar, marcar hecha y borrar (con confirmación). Atrasadas en rojo y las de hoy o mañana en ámbar («Vence hoy», «Vence mañana»). «Quitar las hechas» con confirmación.
- **Inicio:** tarjeta de hábitos de hoy (se marcan desde ahí) y de tareas pendientes. Examen, ahorro y negocio se añaden en sus fases.
- **Sincronización:** indicador («Todo guardado», «2 cambios por subir», «Sin conexión») en la barra lateral y en Cuenta; aviso con «Reintentar» si falla y aviso si el servidor rechaza algún cambio.
- **Arreglos de seguridad:** cerrar sesión borra la sesión guardada al instante aunque no haya red; una pestaña no puede escribir en la copia local si en otra ha entrado otra cuenta.

## Qué falta

### Para cerrar la fase 3
1. Veredicto de seguridad tras los arreglos.
2. Prueba en navegador real con Supabase real (necesita las migraciones aplicadas): crear sin conexión y ver que sube al volver, dos dispositivos a la vez, arrancar sin conexión con la sesión caducada y cerrar sesión sin red. Revisar a 360 px en claro y oscuro (sobre todo la semana de Hábitos y el campo de fecha en Android).

### Fases siguientes
- **Fase 4, Estudios:** módulos con color, exámenes y actividades, notas por RA con pesos y aviso por debajo de 5, faltas con límite por módulo. Hay que portar `js/notas.js` de la app anterior.
- **Fase 5, Dinero y Negocio:** ingresos y gastos en céntimos, ahorro del mes, gráfica de 6 meses, meta de ahorro; clientes por estado, facturado y en curso.
- **Fase 6, Examen IA y cuenta:** subida de PDF a Storage, Edge Function `examen-ia` con Gemini, corrección e historial; activar «Borrar mi cuenta».
- **Fase 7, despliegue:** en Netlify con dominio propio, no en GitHub Pages.

### Pendientes de seguridad ya anotados
- **Sincronización (menores):** un error permanente que no es de datos (p. ej. una migración sin aplicar) bloquea la cola hasta que se arregla (se reintenta cada minuto y se avisa); los borrados que el servidor rechaza no se cuentan en el aviso de rechazados.
- **Fase 6, antes de activar «Borrar mi cuenta»:**
  - si falla el borrado del usuario, sus archivos ya se han eliminado y el mensaje debe decirlo;
  - probar el borrado con un usuario de prueba en el Supabase real;
  - valorar exigir un inicio de sesión reciente.
- **Fase 7:** cambiar los orígenes permitidos de `borrar-cuenta` al dominio nuevo, dejar `localhost` solo en desarrollo y añadir una política CSP.
- `npm audit` da 6 avisos (2 bajos, 4 moderados) en herramientas de compilación, no en lo que se envía al navegador. El arreglo automático cambia de versión mayor `vite-plugin-pwa`; queda para revisar antes del despliegue.

## Cómo se ha hecho

### Forma de trabajar
- Un equipo de cinco agentes en `.claude/agents/`: frontend, supabase, diseno-ui, seguridad y tester. Yo planifico, reparto, lanzo en paralelo lo que no depende entre sí e integro.
- Ninguna fase se cierra sin `VEREDICTO: APROBADO` de seguridad y de tester.
- Commits pequeños con prefijo (`feat:`, `db:`, `test:`…).

### Decisiones que conviene entender
- **RLS en todas las tablas.** Cada fila lleva `user_id` y cuatro políticas que solo dejan pasar al dueño. La clave pública del frontend no da acceso a nada por sí sola: la seguridad está en la base de datos, no en la app.
- **FK compuesta `(id, user_id)` en las tablas hijas.** Así una marca no se puede colgar del hábito de otra persona aunque se conozca su id.
- **Dinero en céntimos enteros.** Con decimales, 0,1 + 0,2 no da 0,3; con enteros no hay errores de redondeo.
- **Fechas de día como texto `AAAA-MM-DD`** y «hoy» calculado en hora de Madrid. Evita que un hábito marcado a las 00:30 caiga en el día anterior por la zona horaria.
- **Lógica pura en `src/lib/`**, sin React ni Supabase. Se prueba con Vitest sin navegador ni base de datos.
- **Offline primero.** Las pantallas leen y escriben en la copia local (IndexedDB) y la respuesta es inmediata. Cada cambio se apunta en una cola que se sube cuando hay conexión. Si dos dispositivos cambian lo mismo, gana el cambio más reciente (`updated_at`).
- **Ids generados en el dispositivo** (UUID), para poder crear cosas sin conexión.
- **Marcas de hábito con id calculado** a partir del hábito y la fecha: marcar el mismo día desde dos dispositivos da la misma fila, no dos.
- **Borrados registrados en una tabla `borrados`**, para que los demás dispositivos sepan qué quitar de su copia.
- **Copia local por usuario.** Si entra otra cuenta en el mismo navegador, la copia se vacía antes de usarse. Pensado para el PC de clase compartido.
- **Tests SQL con PGlite** (Postgres compilado para Node): prueban las migraciones y el RLS de verdad sin instalar Docker ni Postgres.
- **Tests que no pasan en vacío.** Seguridad y tester rompieron el esquema a propósito (22 variantes) para comprobar que algún test falla en cada caso.

### Dependencias añadidas, solo de desarrollo
- `@electric-sql/pglite`: Postgres para los tests SQL.
- `fake-indexeddb`: IndexedDB para probar el motor de sincronización en Node.

Ninguna de las dos llega al navegador.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Especificación original | `PROMPT.md` |
| Convenciones | `CLAUDE.md` |
| Diseño | `DESIGN.md`, `PRODUCT.md`, `src/styles/tokens.css` |
| Migraciones | `supabase/migrations/` |
| Función de borrar cuenta | `supabase/functions/borrar-cuenta/` |
| Tests de RLS | `tests/rls.sql`, `tests/rls-extra.sql`, `tests/sql.test.ts` |
| Lógica pura | `src/lib/` |
| Sincronización | `src/sync/` (añadir una tabla es declararla en `tablas.ts`) |
| Repositorios y hooks | `src/repos/` |
| Pantallas | `src/pages/` |
| Guías para ti | `docs/SUPABASE.md`, `docs/MIGRAR.md` |
