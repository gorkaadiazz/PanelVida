Quiero que construyas desde cero, en esta carpeta, una web app llamada **Mi Panel**: mi panel de vida personal con mis estudios de 2º SMR integrados. Trabaja como jefe de un equipo de agentes: primero crea los agentes, luego planifica, reparte el trabajo y revisa antes de darlo por bueno.

## Quién soy y para qué es
Tengo 19 años y estudio 2º de SMR en el IES Ribera del Tajo (Talavera). Quiero una sola app, instalable en Android y en el PC, sincronizada entre el móvil, el PC de casa y el PC de clase. Tiene que reunir:
1. Mi **panel de vida**: hábitos, tareas, dinero y mi negocio de páginas web.
2. Mi **app de exámenes**: exámenes, actividades, notas por RA, faltas y un examen de práctica generado con IA desde mis PDF.

Si en `~/Escritorio/Proyectos` o en otra carpeta que te indique ya existe una app de exámenes empezada, pregúntame antes de empezar y aprovecha su código y su base de datos. Si no existe, constrúyela dentro de esta app.

## Paso 1: crea el equipo de agentes
Crea estos subagentes en `.claude/agents/`, cada uno con una descripción clara de cuándo usarlo y solo las herramientas que necesite:
- **frontend**: pantallas, componentes, estado, PWA (manifest, service worker, modo offline básico).
- **supabase**: esquema SQL, migraciones, políticas RLS, Edge Functions y cliente de Supabase en la app.
- **diseno-ui**: sistema visual, responsive y accesibilidad. Revisa cada pantalla que haga frontend.
- **seguridad**: revisa RLS, claves, autenticación y que ningún usuario pueda leer datos de otro. Tiene que dar el visto bueno antes de cerrar cada fase.
- **tester**: escribe y pasa tests (Vitest para la lógica: rachas, cálculos de dinero, notas por RA, fechas) y prueba los flujos principales.

Tú eres el jefe: planificas, repartes, lanzas en paralelo lo que no dependa entre sí, integras y me informas. No des una fase por terminada hasta que seguridad y tester la aprueben.

## Stack
- Vite + React + TypeScript, con `vite-plugin-pwa`.
- Supabase: login con Google, Postgres con RLS en **todas** las tablas (`user_id = auth.uid()`) y Edge Functions.
- Gemini (plan gratuito) solo desde una Edge Function. La clave va en los secretos de Supabase, nunca en el frontend. En el frontend solo va la anon key.
- Despliegue gratis en Vercel o Netlify. Explícame los pasos cuando llegue el momento.
- Usa versiones estables y mantén pocas dependencias.

## Funciones

**Inicio (resumen de hoy)**: tarjetas con hábitos hechos hoy (x/y), tareas pendientes y atrasadas, próximo examen con cuenta atrás, ahorro del mes y proyectos del negocio en curso.

**Hábitos**: lista editable (al empezar: Gimnasio, Leer 20 min, Dormir 8 h). Cuadrícula de los últimos 7 días donde se puede marcar y corregir cada día, con racha actual por hábito y porcentaje de hoy.

**Tareas**: texto, fecha límite opcional y hecha/no hecha. Primero las pendientes ordenadas por fecha; las atrasadas en rojo y las de hoy o mañana en ámbar. Botón para quitar las hechas.

**Estudios (2º SMR)**
- Módulos, cada uno con su color: SOR, Seguridad Informática, Servicios en Red, Aplicaciones Ofimáticas, Computación en la Nube y Virtualización, Itinerario Empleabilidad II, Proyecto Intermodular. Formación en Empresa aparte, sin exámenes.
- Exámenes y actividades: módulo, título o RA, fecha, tipo y nota.
- Notas por RA: cada módulo tiene sus RA con su peso; calcula la media de cada RA y la del módulo, y avisa si alguna RA está por debajo de 5.
- Faltas por módulo, con aviso cuando me acerque al límite (que se pueda configurar por módulo).
- Examen IA: subo un PDF de apuntes (Supabase Storage, privado por usuario), la Edge Function extrae el texto y pide a Gemini preguntas cortas; respondo y la app me corrige. Guarda el historial de intentos.

**Dinero**: ingresos y gastos con concepto, importe y fecha. Ahorro del mes, total, gráfica de los últimos 6 meses y meta de ahorro con barra de progreso.

**Negocio web**: clientes con nombre, precio, notas y estado (Contacto → Propuesta → En curso → Entregado). Cuántos hay en cada estado, lo facturado (entregados) y lo que está en curso.

**Cuenta**: login con Google, cerrar sesión y **borrar mi cuenta y todos mis datos** (Edge Function con service role). La app es multiusuario: mis compañeros pueden usarla y cada uno ve solo lo suyo.

## Diseño
Minimalista, con aire informático y colores apagados, nada chillón. Un color por módulo de SMR. Tipografía de interfaz limpia más una monoespaciada para números y fechas. Modo claro y oscuro según el sistema. En el móvil, navegación inferior (Inicio, Hábitos, Tareas, Estudios, Más). En el PC, barra lateral. Todo en español y con fechas en formato español.

## Forma de trabajar
1. Antes de escribir código, enséñame el plan: fases, esquema de tablas y qué hace cada agente. Espera mi OK.
2. Fases: (1) proyecto base + login + PWA, (2) esquema y RLS, (3) Inicio + Hábitos + Tareas, (4) Estudios sin IA, (5) Dinero + Negocio, (6) Examen IA, (7) despliegue.
3. Al terminar cada fase, dime qué está hecho, cómo probarlo y qué tengo que hacer yo (crear el proyecto en Supabase, configurar Google OAuth, poner la clave de Gemini…). Para esos pasos dame instrucciones paso a paso, porque no lo he hecho nunca.
4. Haz commits pequeños con git y escribe un `README.md` y un `CLAUDE.md` con las convenciones del proyecto.
5. Nunca subas claves al repositorio: usa `.env.local` y añádelo a `.gitignore`.
6. Explícame brevemente las decisiones importantes, porque quiero aprender de esto para clase.
