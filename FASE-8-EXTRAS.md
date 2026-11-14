# Fase 8: Extras personales

Añade estas cuatro secciones a Mi Panel siguiendo las mismas reglas del proyecto (PROMPT.md, CLAUDE.md y DESIGN.md): tablas nuevas con `user_id` y RLS en todas, el mismo sistema visual, tests de la lógica y visto bueno de los agentes **seguridad** y **tester** antes de cerrar. Antes de programar, enséñame el plan (tablas, pantallas y dónde va cada cosa en la navegación) y espera mi OK.

## 1. Cumpleaños
- Persona, fecha (día y mes; el año es opcional y, si lo pongo, calcula la edad que cumple) y notas.
- Lista ordenada por el próximo cumpleaños, con cuenta atrás ("hoy", "mañana", "en 5 días").
- En el Inicio, una tarjeta con los cumpleaños de los próximos 7 días.
- Cuidado con el 29 de febrero en años no bisiestos: cuenta como el 28.

## 2. Planes pendientes
- Título, tipo (sitio, viaje, actividad, comida…), con quién (texto libre), fecha opcional, coste aproximado opcional y notas.
- Estados: Idea → Planeado (con fecha) → Hecho. Al marcar "Hecho" se puede añadir una valoración del 1 al 5 y un comentario.
- Filtros por estado y por tipo. En el Inicio, el próximo plan con fecha.

## 3. Wishlist conectada al ahorro
- Artículo, precio, prioridad (alta, media o baja), enlace opcional y notas.
- Lo que me falta para cada artículo se calcula con el **total ahorrado** de la sección Dinero, en el orden de prioridad: "te llega", "te faltan X €" y una barra de progreso.
- Al marcar un artículo como "Comprado", ofrece crear el gasto automáticamente en Dinero (preguntando antes) y lo mueve a un historial.

## 4. Bandeja rápida de ideas
- Un botón "+" siempre visible (en el móvil, encima de la navegación inferior) que abre un campo para escribir y guardar en un toque, sin elegir nada más.
- La bandeja muestra las ideas sin procesar. Cada una se puede convertir en tarea, plan o artículo de la wishlist (rellenando el resto de datos), archivar o borrar.
- Un contador en el Inicio con las ideas sin procesar.

## Orden
Primero la bandeja de ideas (por el botón global), luego cumpleaños, planes y wishlist. Haz un commit por cada sección y, al terminar, dime cómo probarlo y si tengo que ejecutar alguna migración en Supabase.
