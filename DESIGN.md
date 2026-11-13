---
name: Mi Panel
description: Panel de vida y estudios de 2º SMR; papel de cuadrícula frío, tinta de boli azul y un color apagado por módulo.
colors:
  bg: "#f3f6f9"
  surface: "#fcfdff"
  surface-raised: "#fcfdff"
  surface-sunken: "#eaeef2"
  text: "#1c222b"
  text-2: "#4f565f"
  text-3: "#666c75"
  border: "#dbdee3"
  border-field: "#81878f"
  accent: "#3057a3"
  accent-hover: "#264a8e"
  on-accent: "#fcfdff"
  accent-soft: "#dde8fd"
  accent-ink: "#214487"
  ok: "#397247"
  ok-soft: "#dcf2df"
  ok-ink: "#295935"
  warn: "#aa732b"
  warn-soft: "#fbe9ca"
  warn-ink: "#754a1a"
  danger: "#af3c3a"
  danger-soft: "#ffe4e1"
  danger-ink: "#932b2a"
  info: "#236b8f"
  info-soft: "#dceefa"
  info-ink: "#175675"
  mod-sor: "#5284b7"
  mod-si: "#b2686b"
  mod-sr: "#22928f"
  mod-ao: "#a6753d"
  mod-cnv: "#7f76b5"
  mod-ipe2: "#57905f"
  mod-pi: "#a36a97"
  mod-fe: "#77828a"
  dark-bg: "#0f1318"
  dark-surface: "#181c22"
  dark-surface-raised: "#21262d"
  dark-surface-sunken: "#0a0d12"
  dark-text: "#e7ecf0"
  dark-text-2: "#aeb5bd"
  dark-text-3: "#8f969e"
  dark-border: "#2c3138"
  dark-border-field: "#636a72"
  dark-accent: "#89b3f1"
  dark-accent-soft: "#25334c"
  dark-accent-ink: "#afcdf9"
typography:
  screen:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  section:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.35
  number:
    fontFamily: "ui-monospace, Cascadia Mono, Segoe UI Mono, Roboto Mono, DejaVu Sans Mono, monospace"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
    fontFeature: "tnum, zero"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "10px 12px"
  tag-module:
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  nav-bottom:
    backgroundColor: "{colors.surface}"
    height: "64px"
  sidebar:
    backgroundColor: "{colors.surface-sunken}"
    width: "240px"
---

# Design System: Mi Panel

## Overview

**Creative North Star: "El horario de clase con boli azul"**

La dirección sale del mundo real del usuario, no de las herramientas que maneja: la hoja de cuadrícula del cuaderno, el horario de clase donde cada módulo tiene su color y el boli azul con el que se tacha lo hecho. De ahí salen el fondo de papel frío (gris azulado muy claro, nunca crema), un único acento de **tinta azul** para acciones, selección y casillas marcadas, y una paleta de ocho colores apagados que funcionan como los separadores de colores de una carpeta: uno por módulo de SMR. El "aire informático" que pide el usuario se expresa con orden y precisión (rejilla de 4 px, cifras monoespaciadas alineadas, estados exactos), no con disfraz de consola.

Es una app de uso diario (modo Operate): lo que el usuario ya conoce de Android (barra inferior con indicador en píldora, campos, casillas) se mantiene tal cual. El mundo solo aporta cuatro cosas: tipografía, paleta, densidad y un gesto propio, **la pestaña de separador**: las tarjetas de módulo llevan una pequeña pestaña de color en el borde superior, como el separador de la carpeta, y las etiquetas de módulo llevan su cuadradito de color junto a la abreviatura.

Se rechaza expresamente (ver PRODUCT.md): prompt `~$`, etiquetas `[SOR]`, cuentas atrás `T-3d`, monoespaciada por todas partes, negro con neón y cualquier estética tipo Instagram (degradados vivos, aspecto de red social).

**Key Characteristics:**
- Papel de cuadrícula frío + tinta de boli azul como único acento.
- Ocho colores de módulo apagados, misma luminosidad y croma, tonos repartidos; FE en grafito porque va aparte.
- Pila tipográfica del sistema; monoespaciada solo en números y fechas (`.num`).
- Plano: las tarjetas se separan con borde de 1 px; la sombra queda para lo que flota.
- Movimiento corto (120–220 ms) que solo informa de estado.

## Colors

Restrained con trabajo real: neutros fríos teñidos de azul, un acento de tinta y colores que significan algo (módulo o estado). Todos los valores están en `src/styles/tokens.css` y se verificaron en claro y oscuro (texto ≥ 4.5:1, gráficos y bordes de control ≥ 3:1).

### Primary
- **Tinta de boli azul** (`--accent`): botón principal, elemento activo de la navegación, casillas marcadas, enlaces, anillo de foco. Nada decorativo. Sobre ella, `--on-accent` (6.8:1 en claro, 8.7:1 en oscuro).
- **Tinta suave** (`--accent-soft` + `--accent-ink`): fondo del elemento activo en barra inferior y lateral, filtro seleccionado, selección de texto.

### Neutral
- **Papel frío** (`--bg`): fondo de la app.
- **Hoja** (`--surface`): tarjetas, barra inferior, campos.
- **Hoja hundida** (`--surface-sunken`): barra lateral de PC, pistas de progreso, esqueletos. Segunda capa neutra.
- **Hoja elevada** (`--surface-raised`): menús y hojas inferiores (en oscuro sube un tono para separarse).
- **Texto** (`--text`, `--text-2`, `--text-3`): principal, secundario y pistas/placeholder. Los tres pasan AA en todos los fondos neutros.
- **Líneas** (`--border` decorativa; `--border-field` para campos y casillas, ≥ 3:1).

### Estados
Apagados pero con contraste AA. Cada estado tiene tres tokens: base (gráficos, barras, bordes), `-soft` (fondo de aviso o etiqueta) e `-ink` (texto, ≥ 4.5:1 sobre `-soft` y sobre `--surface`).
- **Correcto** (`--ok*`, verde hoja): RA aprobada, meta cumplida, guardado.
- **Aviso** (`--warn*`, ámbar ocre): tarea para hoy o mañana, faltas cerca del límite.
- **Peligro** (`--danger*`, rojo teja): tarea atrasada, RA por debajo de 5, borrar cuenta. Botón de peligro con `--on-danger`.
- **Info** (`--info*`, azul petróleo): avisos neutros, sin conexión, sincronizando.

### Módulos de 2º SMR
Misma luminosidad y croma; tonos separados ≥ 40°. Cada uno tiene `--mod-x` (sólido, ≥ 3:1 sobre `--surface`: puntos, pestañas, barras), `--mod-x-soft` (fondo de etiqueta) y `--mod-x-ink` (texto, ≥ 6.4:1 sobre su fondo suave).

| Módulo | Token | Claro | Oscuro | Tono |
|---|---|---|---|---|
| SOR · Sistemas Operativos en Red | `--mod-sor` | #5284b7 | #7ba9d8 | azul acero |
| SI · Seguridad Informática | `--mod-si` | #b2686b | #d58f90 | granate rosado |
| SR · Servicios en Red | `--mod-sr` | #22928f | #5eb6b2 | verde azulado |
| AO · Aplicaciones Ofimáticas | `--mod-ao` | #a6753d | #c89b69 | ocre |
| CNV · Computación en la Nube y Virtualización | `--mod-cnv` | #7f76b5 | #a39cd7 | lavanda |
| IPE2 · Itinerario Empleabilidad II | `--mod-ipe2` | #57905f | #80b487 | verde hoja |
| PI · Proyecto Intermodular | `--mod-pi` | #a36a97 | #c691ba | ciruela |
| FE · Formación en Empresa | `--mod-fe` | #77828a | #9ba6af | grafito (va aparte, sin exámenes) |

### Named Rules
**La regla de la tinta única.** El azul de acento solo marca acción, selección o hecho. Si algo azul no se puede pulsar ni está seleccionado, es un error.

**La regla de la doble señal.** Ningún color va solo: un estado lleva palabra ("Atrasada", "Hoy", "Bajo 5") o icono; un módulo lleva su abreviatura (SOR, SI…). Nunca corchetes.

**La regla del rojo escaso.** El rojo es para lo que ya va mal (atrasado, suspenso, destructivo). Lo que puede ir mal es ámbar.

## Typography

**Body Font:** pila del sistema (`--font-ui`): Roboto en Android, Segoe UI en Windows, Noto Sans/Cantarell en Linux.
**Label/Mono Font:** `--font-num` (`ui-monospace`, Cascadia Mono, Roboto Mono, DejaVu Sans Mono…), solo con la clase `.num`.

**Character:** una sola familia de interfaz, sobria y nativa en cada equipo; la monoespaciada aparece únicamente donde hay cifras para que columnas, notas, importes y fechas queden alineados.

### Hierarchy
- **Pantalla** (600, 1.375rem, 1.2, `.t-screen`): un título por vista.
- **Sección** (600, 1.125rem, 1.35, `.t-section`): título de tarjeta.
- **Cuerpo** (400, 1rem, 1.5): texto, campos (16 px fijos en inputs para que el móvil no haga zoom).
- **Etiqueta** (500, 0.875rem, `.t-label`): nombre de dato, etiqueta de campo, texto secundario.
- **Mini** (500–600, 0.75rem): etiquetas de la barra inferior y `.tag`. Nunca menos de 12 px.
- **Cifra destacada** (`.num.num--xl`, 600, 1.75rem, monoespaciada): 2/3 hábitos, 125,40 €, racha. Unidad con `.num--unit`.

Escala fija en `rem` (razón ≈ 1.2), sin tamaños fluidos.

### Named Rules
**La regla de la cifra.** Monoespaciada solo para números, fechas, horas, notas e importes (`.num`). Nunca en títulos, botones ni etiquetas.

**Sin antetítulos.** No se ponen etiquetas pequeñas en mayúsculas encima de los títulos.

## Layout

- **Rejilla de 4 px** (`--sp-1` … `--sp-12`). Grupos apretados (8–12 px), separación generosa entre bloques (24–32 px).
- **Margen lateral** `--gutter`: 16 px en móvil, 24 px en PC, más `env(safe-area-inset-*)`.
- **Punto de corte: 900 px.** Por debajo, barra inferior fija (`.nav-bottom`, 64 px + safe-area) con 5 destinos: Inicio, Hábitos, Tareas, Estudios, Más. Desde 900 px, barra lateral fija (`.sidebar`, 240 px) con todos los destinos (Inicio, Hábitos, Tareas, Estudios · Dinero, Negocio · Cuenta al pie) y la barra inferior desaparece.
- **Contenido** centrado con `--content-max` (68rem). Formularios y textos largos a `--reading-max` (40rem).
- **Inicio**: `.grid-cards` (columnas automáticas de 18rem mínimo: 1 en móvil, 2–3 en PC).
- Nada desborda a 360 px: textos largos con `.truncate` o ajuste de línea, importes con `white-space: nowrap`.
- Altura de app con `100dvh`, nunca `100vh`.

## Elevation & Depth

Plano por defecto. Las tarjetas se separan del fondo por el cambio de tono (papel → hoja) y un borde de 1 px (`--border`), sin sombra. La sombra (`--shadow-float`, con desplazamiento y desenfoque suave) solo aparece en lo que flota sobre el contenido: menús, hojas inferiores, avisos emergentes. La barra inferior usa una línea superior (`--shadow-nav`), no sombra.

### Named Rules
**La regla de una sola elevación.** Borde o sombra, nunca los dos en el mismo elemento.

## Shapes

Esquinas suaves y constantes: 6 px en etiquetas, 10 px en botones, campos y casillas, 14 px en tarjetas y hojas. Píldora solo para barras de progreso y el indicador activo de la barra inferior. La forma propia es la **pestaña de separador**: 36 × 5 px, esquinas inferiores redondeadas, pegada al borde superior de la tarjeta de módulo, en `--mod`.

## Components

Todas las clases están en `src/styles/base.css`. Los `:hover` van dentro de `@media (hover: hover) and (pointer: fine)`; en táctil la respuesta está en `:active`.

### Contexto de módulo
Clases `.mod-sor`, `.mod-si`, `.mod-sr`, `.mod-ao`, `.mod-cnv`, `.mod-ipe2`, `.mod-pi`, `.mod-fe`: definen `--mod`, `--mod-soft` y `--mod-ink` para todo lo que haya dentro (`.tag--mod`, `.card--mod`, `.dot`, `.progress--mod`).

### Cards / Containers
- **`.card`**: `--surface`, borde 1 px `--border`, radio 14 px, relleno 16 px. Partes: `.card__head`, `.card__foot`. Si toda la tarjeta es pulsable, que sea `<a class="card">` o `<button class="card">` (se hunde a 0.99 al pulsar). Nunca tarjetas dentro de tarjetas.
- **`.card--mod`** + `.mod-x`: añade la pestaña de separador del módulo.

### Buttons
- **Forma:** 44 px de alto mínimo, radio 10 px, 600, 16 px. Al pulsar `scale(0.97)` en 120 ms.
- **`.btn--primary`**: tinta azul. Una por pantalla.
- **`.btn--secondary`**: hoja con borde de campo.
- **`.btn--danger`**: rojo teja, solo para acciones destructivas confirmadas (borrar cuenta).
- **`.btn--ghost`**: sin fondo, texto azul; `.btn--ghost.btn--danger-text` para "Quitar hechas".
- **Variantes:** `.btn--sm` (36 px, solo PC o junto a otro objetivo grande), `.btn--block`. Cargando: `aria-busy="true"` (mantiene el ancho y muestra un giro). Deshabilitado: `disabled` o `aria-disabled="true"`.
- **`.icon-btn`**: 44 × 44, siempre con `aria-label`.

### Inputs / Fields
- **`.field`** agrupa `<label class="field__label">`, `.input`, `.field__hint` y `.field__error`.
- **`.input`** (input, select, textarea): 44 px, borde `--border-field` (≥ 3:1), radio 10 px, 16 px de letra. Fechas e importes salen en monoespaciada automáticamente (`type="date"`, `inputmode="decimal"|"numeric"`).
- **Foco:** borde azul + halo de 3 px `--accent-soft`. **Error:** `aria-invalid="true"` (borde rojo) y mensaje en `.field__error` enlazado con `aria-describedby`.

### Casilla de hábito (componente propio)
- **`.check`**: `<button aria-pressed>` de 44 × 44 con caja visible de 36 px y tic dibujado. Marcada: tinta azul con tic claro (aparece en 160 ms). `.check--today` resalta la columna de hoy; `.check--lg` (52 px) para Inicio; `disabled` para días futuros.
- **`.week`**: rejilla de 7 columnas iguales; `.week__day` para la cabecera (L M X J V S D + número en `.num`, `aria-current="date"` en hoy). En Hábitos van en una `.list` (no dentro de tarjeta) para que cada celda mida ≥ 44 px a 360 px.
- `aria-label` completo: "Gimnasio, lunes 10/11/2026: hecho".

### Chips / Etiquetas
- **`.tag`**: 24 px, radio 6 px, 12 px semibold. Neutra por defecto.
- **`.tag--mod`** + `.mod-x`: fondo suave del módulo, texto tinta y cuadradito de color. Texto: la abreviatura (SOR, SI, SR, AO, CNV, IPE2, PI, FE), sin corchetes.
- **`.tag--ok|warn|danger|info`**: estado con palabra y, si cabe, icono de 14 px. Texto de estado suelto: `.text-ok|warn|danger|info`.

### Barra de progreso
- **`.progress`**: 8 px (12 px con `.progress--lg`), píldora, pista hundida, relleno en `--progress-color` (acento por defecto; `.progress--mod`, `--ok`, `--warn`, `--danger`). Valor con `style="--p: 60%"` y `role="progressbar"` + `aria-valuenow`. Siempre acompañada de la cifra en `.num`.

### Navigation
- **Barra inferior móvil (`.nav-bottom`, < 900 px):** fija abajo, 64 px + safe-area, fondo hoja, línea superior. 5 `.nav-bottom__item` con icono de 22 px dentro de `.nav-bottom__icon` y etiqueta de 12 px. Activo (`aria-current="page"`): píldora `--accent-soft` de 56 × 30 detrás del icono y texto `--accent-ink` semibold. "Más" abre la lista de Dinero, Negocio y Cuenta.
- **Barra lateral PC (`.sidebar`, ≥ 900 px):** 240 px, fija en altura (`sticky`), fondo hundido, borde derecho. `.sidebar__brand` (icono + "Mi Panel"), `.sidebar__item` de 40 px con icono de 20 px, `.sidebar__group` para el segundo bloque y `.sidebar__foot` para Cuenta. Activo igual que en móvil.
- **Iconos:** SVG propios en línea, trazo 1.75 sobre 24 px, extremos redondeados, `currentColor`. Nada de emojis ni fuentes de iconos.

### Estados vacío, carga y error
- **Vacío (`.empty`):** icono de 40 px en `--text-3`, `.empty__title` que dice qué falta y un texto que enseña qué hacer ("Añade tu primer hábito para empezar la racha"), con un botón de acción.
- **Carga:** `.skeleton` con la forma del contenido (`--w`, `--h`), brillo lento que se apaga con movimiento reducido. `.spinner` solo dentro de botones o acciones puntuales, nunca en mitad de la pantalla.
- **Error / aviso (`.alert`, `.alert--ok|warn|danger`):** fondo suave del estado, icono de 20 px, `.alert__title` y texto con el problema y cómo arreglarlo. Sin barra lateral de color.

### Superficies flotantes
`.float` (menú, aviso emergente) y `.sheet` (hoja inferior móvil con safe-area): `--surface-raised` + `--shadow-float`.

### Movimiento
- Duraciones: `--dur-press` 120 ms (pulsar), `--dur-fast` 160 ms (color, casilla), `--dur-base` 220 ms (menús, avisos, progreso), `--dur-slow` 320 ms (hojas inferiores; tope).
- Curvas: `--ease-out` cubic-bezier(0.23, 1, 0.32, 1) para casi todo; `--ease-in-out` para lo que se mueve dentro de la pantalla; `--ease-sheet` cubic-bezier(0.32, 0.72, 0, 1) para hojas. Nunca `ease-in`.
- Sin animaciones de entrada de página ni coreografías: la app abre directamente en la tarea. Solo se anima lo que cambia de estado.
- `prefers-reduced-motion: reduce`: transiciones y animaciones a 0; los esqueletos quedan quietos; los giros de carga siguen, más lentos, porque informan.

## Do's and Don'ts

### Do:
- **Do** sacar todo color, espacio, radio y tipo de `tokens.css`; si falta un token, se añade allí y se documenta aquí.
- **Do** usar `.num` en toda cifra y fecha (`10/11/2026`, `7,5`, `125,40 €`, `3/5`).
- **Do** acompañar cada estado de una palabra o un icono y cada color de módulo de su abreviatura.
- **Do** mantener 44 px de objetivo táctil y foco visible (`:focus-visible`, 2 px `--focus`).
- **Do** probar en el móvil real a pleno sol y en oscuro, y a 360 px de ancho.

### Don't:
- **Don't** usar prompt `~$`, corchetes `[SOR]`, cuentas atrás `T-3d`, cursores parpadeantes ni monoespaciada en texto corrido.
- **Don't** usar degradados, neón, fondos negros puros con brillo, glassmorphism ni aspecto de red social.
- **Don't** poner bordes laterales de color de más de 1 px en tarjetas, filas o avisos; el módulo va en la pestaña superior o en la etiqueta.
- **Don't** usar el azul de acento como decoración ni el rojo para algo que aún no ha fallado.
- **Don't** enlazar fuentes ni iconos desde un CDN.
- **Don't** usar `:hover` fuera de `(hover: hover) and (pointer: fine)`.
