# Mi Panel: estado del proyecto

Actualizado el 13/11/2026, tras el commit `77d5896`. Fase 3 aprobada por seguridad y tester; falta probarla en navegador con el Supabase real.

## Resumen

| Fase | Qué es | Estado |
|---|---|---|
| 1 | Proyecto base, login con Google, PWA | Cerrada |
| 2 | Esquema de base de datos y RLS | Cerrada (aprobada por seguridad y tester) |
| 3 | Inicio, Hábitos, Tareas | **Aprobada** por seguridad y tester. Falta probarla en navegador real con el Supabase real |
| 4 | Estudios sin IA | **No se hace**: los estudios están en la web de exámenes. Mi Panel enlaza a ella y lee el próximo examen |
| 5 | Dinero y Negocio web | **Aprobada** por seguridad y tester (revisada por diseño). Falta probarla en navegador real |
| 6 | Examen IA y borrar cuenta | **No se hace**: el examen IA está en la web de exámenes; «Borrar mi cuenta» se ha quitado (borraría también los datos de esa web) |
| 7 | Despliegue | Hecho: publicada en Netlify (14/11/2026) |

Comprobaciones ahora mismo: `npm test -- --run` 473/473, `npm run test:sql` 41/41, `npm run lint`, `npm run typecheck` y `npm run build` sin errores.

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
1. ~~Veredictos de seguridad y tester~~: aprobados.
2. Prueba en navegador real con Supabase real (necesita las migraciones aplicadas): crear sin conexión y ver que sube al volver, dos dispositivos a la vez, arrancar sin conexión con la sesión caducada y cerrar sesión sin red. Revisar a 360 px en claro y oscuro (sobre todo la semana de Hábitos y el campo de fecha en Android).

### Fase 5: Dinero y Negocio
- **Dinero:** ingresos y gastos (concepto, importe, fecha), siempre en céntimos. El importe se lee del texto sin pasar por decimales («12,50», «1.234,56»). Ahorro del mes con navegación por meses, ahorro total, gráfica del ahorro de los últimos 6 meses y meta de ahorro con barra de progreso. Editar y borrar con confirmación.
- **Meta de ahorro:** se guarda en `perfiles` (la fila que comparte la web de exámenes). Mi Panel solo baja y sube esa columna y la web de exámenes nunca la envía, así que ninguna pisa las columnas de la otra.
  - **Límite conocido:** el servidor decide «gana el último cambio» por la fila entera. Si cambias la meta SIN CONEXIÓN y, antes de que se suba, cambias el perfil en la web de exámenes (tema, nombre…), al subir la meta el servidor la descarta y vuelve la anterior, sin aviso. Al revés también: un cambio hecho sin conexión en la web de exámenes se pierde si Mi Panel sube antes una meta más reciente. Con conexión no pasa.
- **Negocio:** clientes con nombre, precio y notas, que pasan de Contacto → Propuesta → En curso → Entregado. Cuántos hay en cada estado, lo facturado (entregados) y lo que está en curso.
- **Inicio:** tarjetas de ahorro del mes (con la meta) y de negocio.
- **Sincronización:** si una tabla falla en el servidor (p. ej. una migración sin aplicar), las demás siguen subiendo y bajando y los cambios de esa tabla esperan en la cola sin perderse. Un borrado que el servidor rechaza se cuenta y se deshace.

### Cambio de alcance (13/11/2026)
- Las fases 4 y 6 no se hacen: ya existen en tu web de exámenes (https://gorkaadiazz.github.io/SPEC_Examenes/), que usa el mismo proyecto de Supabase y la misma cuenta.
- «Estudios» en la navegación abre esa web en otra pestaña.
- Inicio tiene la tarjeta **Próximo examen**: lee en solo lectura las tablas `modulos` y `evaluaciones` de la web de exámenes (solo las columnas que hacen falta). Mi Panel nunca escribe en ellas.
- Se ha quitado «Borrar mi cuenta» de Cuenta: como la cuenta es la misma, borraría también todo lo de la web de exámenes. La Edge Function `borrar-cuenta` sigue desplegada porque la usa la web de exámenes (`js/auth.js`): borrar la cuenta desde allí borra también los datos de Mi Panel.
- Aprobado por seguridad y tester (321 tests).
- La sincronización guarda ahora qué tablas ha bajado enteras: una tabla nueva (estas, y las de la fase 5) se baja completa aunque el dispositivo ya estuviera al día.

### Mejoras tras el despliegue (14/11/2026)
- Negocio: lista «Mover a…» en vez de flechas.
- Carga más rápida: cada pantalla se descarga aparte; React y supabase-js en archivos propios.
- Dinero: categorías de gastos con resumen «En qué gastas» y movimientos fijos que se apuntan solos cada mes (id determinista por fijo y mes; `ultimo_mes` evita que reaparezca un mes borrado).
- Inicio: tarjeta «Esta semana» frente a los mismos días de la semana pasada.
- Recordatorios diarios por notificación (Web Push), con cifrado y VAPID propios y cron en la base de datos. Pasos para activarlos: `docs/RECORDATORIOS.md`.
- Un apunte de un fijo borrado no reaparece aunque otro dispositivo lo apunte sin conexión: el trigger `no_revivir_borrado` ignora en el servidor un movimiento cuyo id ya está en `borrados`.
- Seguridad (14/11): tope de 10 dispositivos con recordatorios por usuario, el cron se comprueba antes que nada y cada activación crea una suscripción nueva (un navegador compartido no recibe avisos de otra cuenta).

### Fase 8: extras personales (14/11/2026)
- Bandeja rápida de ideas: botón «+» siempre visible (encima de la barra inferior en el móvil), bandeja, convertir en tarea, plan o deseo (se crea y la idea se borra en la misma operación), archivar y contador en Inicio.
- Cumpleaños: lista por el próximo con cuenta atrás y edad; el 29 de febrero se celebra el 28 en años no bisiestos; tarjeta de los próximos 7 días en Inicio.
- Planes: idea → planeado (con fecha) → hecho (valoración 1-5 y comentario), filtros por estado y tipo; próximo plan en Inicio.
- Lista de deseos: el ahorro total de Dinero se reparte en orden de prioridad («te llega» / «te faltan X €»); al comprar se ofrece apuntar el gasto (misma operación) y pasa al historial.
- En el menú, dentro de «Más» (y en la barra lateral en PC): Ideas, Cumpleaños, Planes y Lista de deseos.
- Migraciones 20261114000300 a 20261114000700 (ver `docs/RECORDATORIOS.md`). La 000700 extiende `no_revivir_borrado` a todas las tablas de Mi Panel (una fila borrada en un dispositivo no vuelve aunque otro la edite sin conexión).
- Revisión: seguridad, tester y diseño APROBADO. Pendiente de decidir: deshacer «hecho» en un plan que no tenía fecha lo deja como «planeado» con la fecha del día en que se marcó.

### Fase 8, secciones 5 y 6: gastos fijos, revisión y previsión de ahorro (14/11/2026)
- Dinero en pestañas: Movimientos · Fijos · Revisiones · Previsión (`/dinero?ver=…`).
- Fijos cada día, semana, mes o año. Los diarios se apuntan una vez por semana (el domingo) con el importe de los días de esa semana. Cada uno dice lo que cuesta al día, a la semana, al mes y al año; arriba, el total fijo al mes. Pausar o dar de baja.
- Esencial / prescindible (opcional) en fijos y movimientos. Los apuntes de un fijo llevan `fijo_id`.
- Revisión semanal (el lunes, de la semana anterior) y mensual (el día 1, del mes anterior), sin IA: gasto por categoría frente al periodo anterior, fijos, prescindibles, meta y deseos, y sugerencias por reglas (prescindibles, fijos caros, categorías que suben, suscripciones solapadas) con el ahorro al mes y cuánto antes llegas a la meta. Se guarda en `revisiones` (una por periodo: unique por usuario, tipo e inicio; se generan solo con conexión y recién sincronizado). Tarjeta «Revisión nueva» en Inicio.
- Previsión: ritmo real (media de lo apuntado a mano en 1, 3 o 6 meses + fijos activos), «¿cuánto tendré en…?», «¿cuándo llego a…?» (meta, deseo o cantidad), escenarios actual / con recortes / a mano y gráfica real + prevista. Con ritmo cero o negativo no da fecha: dice cuánto habría que ahorrar al mes para llegar en 3, 6 o 12 meses. Línea «A este ritmo llegas a tu meta el …» en Inicio.
- Cambiar la frecuencia de un fijo cuenta desde hoy con la nueva (el tester encontró que se saltaba el siguiente apunte).
- Revisión: seguridad, tester y diseño APROBADO. Seguridad: id de la revisión aleatorio (uno calculable con el id del usuario se podía «ocupar»).
- Fijo diario pausado o dado de baja a mitad de semana: en ese momento se apuntan los días que estuvo activo esa semana hasta ayer (apunte propio, con id distinto del de la semana completa); si se reanuda, el domingo se apunta lo de después.
- Escenario «con recortes»: de una categoría que sube solo se suma lo que no cubren ya los gastos prescindibles de esa categoría (las sugerencias guardan su categoría).
- Migración 20261114000800 (antes de desplegar; ver `docs/RECORDATORIOS.md`). Compatibilidad: la app sin actualizar sigue apuntando bien los mensuales (trigger `compatibilidad_fijos`) y nunca apunta los demás (`desde = '9999-12'`).

### Fases siguientes
- **Fase 7, despliegue:** en Netlify (origen propio), no en GitHub Pages. Pasos en `docs/DESPLEGAR.md`.

### Pendientes de seguridad ya anotados
- ~~Fase 6, antes de activar «Borrar mi cuenta»~~ (ya no aplica: se ha quitado):
  - si falla el borrado del usuario, sus archivos ya se han eliminado y el mensaje debe decirlo;
  - probar el borrado con un usuario de prueba en el Supabase real;
  - valorar exigir un inicio de sesión reciente.
- ~~Fase 7: CSP~~ hecho: cabeceras de seguridad y CSP en `netlify.toml` (solo el propio origen y el proyecto de Supabase).
- Orígenes de `borrar-cuenta`: no cambian. Mi Panel ya no llama a esa función; solo la usa la web de exámenes, que sigue en `gorkaadiazz.github.io`.
- `npm audit`: 0 avisos en lo que se envía al navegador (`npm audit --omit=dev`). Los 6 avisos (2 bajos, 4 moderados) están en `glob`/`minimatch`, que solo usa `vite-plugin-pwa` al compilar con nuestros propios archivos; el «arreglo» automático bajaría a `vite-plugin-pwa` 1.x. Se deja así y se revisa cuando salga una versión nueva.

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
