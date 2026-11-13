# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

PWA instalable (Vite + React + TypeScript, `vite-plugin-pwa`). Se usa como app instalada en Android y en navegador/instalada en el PC de casa y el de clase.

## Users

- **Usuario principal:** el autor, 19 años, estudiante de 2º de SMR en el IES Ribera del Tajo (Talavera de la Reina). Usa un móvil Android a diario y dos PC (casa y clase).
- **Otros usuarios:** sus compañeros de clase, por invitación (lista `emails_permitidos`). Cada uno ve solo sus datos.
- **Tarea:** abrir la app varias veces al día unos segundos para marcar hábitos, ver qué tareas y exámenes vienen, apuntar un gasto o una nota; y, con más calma en el PC, revisar notas por RA, faltas, dinero y clientes.

## Product Purpose

Una sola app que reúne el panel de vida (hábitos, tareas, dinero y el negocio de páginas web) con los estudios de 2º SMR (exámenes, actividades, notas por RA, faltas y examen de práctica con IA). El éxito es que la abra cada día sin pereza, que responda al momento y que sepa de un vistazo qué le toca hoy y qué va mal (tarea atrasada, RA por debajo de 5, faltas cerca del límite).

## Positioning

No es una agenda genérica ni una app de estudio genérica: entiende la estructura real de la FP (módulos de SMR, RA con peso, límite de faltas por módulo, FE sin exámenes) y la junta con la vida diaria de un estudiante que además tiene un pequeño negocio.

## Operating Context

- Móvil Android en la mano, muchas veces de pie, en el pasillo o en el bus, a veces a pleno sol: lectura rápida, objetivos táctiles grandes, contraste alto.
- PC de clase (pantallas de aula, posiblemente iluminación fuerte y monitores modestos) y PC de casa: barra lateral y más densidad.
- Sesiones muy cortas y frecuentes (modo Operate). Funciona sin conexión y sincroniza después.
- Todo en español; fechas `dd/mm/aaaa` en hora de Madrid; importes en euros con formato `es-ES`.

## Capabilities and Constraints

- Secciones: Inicio (resumen de hoy), Hábitos (cuadrícula de 7 días, racha, % de hoy), Tareas (fecha límite opcional; atrasadas en rojo, hoy/mañana en ámbar), Estudios (8 módulos: SOR, SI, SR, AO, CNV, IPE2, PI y FE aparte), Dinero, Negocio web y Cuenta.
- Navegación: móvil con barra inferior (Inicio, Hábitos, Tareas, Estudios, Más); PC con barra lateral.
- Claro y oscuro según el sistema.
- Pocas dependencias: nada de frameworks CSS ni librerías de componentes sin aprobación.
- Privacidad: nada de fuentes ni recursos de CDN de terceros.

## Brand Commitments

- Nombre: **Mi Panel**.
- Carácter pedido: minimalista, colores apagados (nada chillón), un color por módulo de SMR, tipografía de interfaz limpia y monoespaciada **solo** para números y fechas.
- **Rechazado por el usuario (no volver a proponer):**
  - Estilo "terminal / informático disfrazado": prompt `~$`, etiquetas entre corchetes tipo `[SOR]`, cuentas atrás tipo `T-3d`, monoespaciada por todas partes, fondos negros con acento neón.
  - Estilo tipo Instagram: degradados vivos, aspecto de red social, tarjetas de foto, iconos de colores saturados.
- Quiere "algo nuevo y bonito": el aire informático se expresa con orden, precisión y cifras alineadas, no con disfraz de consola.

## Evidence on Hand

- Especificación en `PROMPT.md`; convenciones en `CLAUDE.md`.
- Datos iniciales reales: hábitos Gimnasio, Leer 20 min, Dormir 8 h; los 8 módulos de 2º SMR.
- No hay capturas, logotipo previo aprovechable ni testimonios. El icono anterior (`>_`) queda descartado por el rechazo al estilo terminal.

## Product Principles

1. **Hoy primero.** Cada pantalla responde antes a "¿qué me toca hoy?" que a "¿qué hay guardado?".
2. **Un toque, una acción.** Marcar un hábito o una tarea no pide confirmación ni abre otra pantalla.
3. **Avisar sin agobiar.** Lo atrasado y lo que está en riesgo se ve claro, siempre con texto, pero sin alarmas ni rojo por todas partes.
4. **Lo mismo en todos los sitios.** Móvil, PC de casa y PC de clase muestran lo mismo con la disposición adecuada a cada pantalla.
5. **Lo suyo es suyo.** Cada usuario ve solo sus datos; nada sale a terceros salvo lo imprescindible (Supabase, Gemini para el examen IA).

## Accessibility & Inclusion

- WCAG 2.2 AA: contraste 4.5:1 en texto y 3:1 en gráficos y bordes de controles, en claro y en oscuro.
- Objetivos táctiles de 44 px como mínimo; foco visible con teclado.
- El color nunca es la única señal (estado = texto o icono + color; módulo = abreviatura + color).
- Respeta `prefers-reduced-motion` y el tamaño de letra del sistema (unidades `rem`).
