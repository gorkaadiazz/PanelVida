# Fase 8: Extras personales

Añade estas secciones a Mi Panel siguiendo las mismas reglas del proyecto (PROMPT.md, CLAUDE.md y DESIGN.md): tablas nuevas con `user_id` y RLS en todas, el mismo sistema visual, tests de la lógica y visto bueno de los agentes **seguridad** y **tester** antes de cerrar. Antes de programar, enséñame el plan (tablas, pantallas y dónde va cada cosa en la navegación) y espera mi OK.

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

## 5. Gastos fijos y consejos de ahorro (en la sección Dinero)
- Gastos fijos (suscripciones, móvil, gimnasio, transporte…) con concepto, importe, categoría y **frecuencia: diaria, semanal, mensual o anual**, más el día de cobro cuando aplique.
- Cada gasto fijo se apunta solo como movimiento cuando le toca (sin duplicados si abro la app varias veces o desde varios dispositivos) y se puede pausar o dar de baja.
- Muestra el coste equivalente de cada uno al día, a la semana, al mes y al año (por ejemplo, 1,50 €/día = ~45 €/mes = ~547 €/año) y el total fijo mensual.
- Categoría y marca "esencial / prescindible" en gastos fijos y normales.

**Revisión semanal y mensual (sin IA)**
- Nada de IA: todo con reglas y cálculos en el propio código, sin llamadas a Gemini ni a ninguna API externa.
- Al terminar la semana (domingo) y el mes (último día), genera una revisión: gasto por categoría comparado con el periodo anterior (subidas y bajadas en € y %), total de gastos fijos y de prescindibles, y cuánto me falta para la meta de ahorro y para cada artículo de la wishlist.
- Sugerencias de recorte calculadas con reglas, cada una con su impacto en € y en tiempo hasta la meta:
  - gastos marcados como prescindibles, de mayor a menor;
  - gastos fijos más caros en su equivalente mensual y anual;
  - categorías que han subido mucho respecto a la media de las últimas semanas o meses;
  - suscripciones de la misma categoría que se solapan (por ejemplo, dos de streaming).
  Ejemplo de texto: "Si quitas X ahorras 9,99 €/mes y llegas a la meta 3 semanas antes".
- Guarda cada revisión para poder verlas después y muestra una tarjeta en el Inicio cuando haya una nueva.
- El tono: directo y útil, sin sermones. Las decisiones son mías; la app solo sugiere.
- Tests de las reglas y de los cálculos (equivalencias de frecuencia, comparaciones, impacto en la meta).

## 6. Previsión de ahorro (en la sección Dinero, sin IA)
- Calcula mi ritmo de ahorro real: ingresos menos gastos de los últimos 3 meses (configurable: 1, 3 o 6 meses), más los gastos fijos que vienen según su frecuencia. Si llevo menos de un mes de datos, avísalo y usa lo que haya.
- **"¿Cuánto tendré en…?":** elijo un plazo (1, 3, 6 o 12 meses, o una fecha) y me dice cuánto tendría ahorrado a ese ritmo.
- **"¿Cuándo llego a…?":** elijo una cantidad, la meta de ahorro o un artículo de la wishlist y me dice cuánto tardaría y en qué fecha llegaría.
- Tres escenarios: ritmo actual, ritmo con los recortes sugeridos en la revisión (sección 5) y uno ajustable donde muevo un control de "ahorrar X € más o menos al mes".
- Gráfica con la evolución real hasta hoy y la proyección futura (línea discontinua), marcando la meta.
- Si el ritmo es cero o negativo, no inventes una fecha: dime claramente que a este ritmo no llego y cuánto tendría que ahorrar al mes para llegar en 3, 6 o 12 meses.
- En el Inicio, una línea del tipo "A este ritmo llegas a tu meta el 15 de mayo".
- Tests de los cálculos: ritmo medio, proyección por plazo, fecha de llegada, ritmo negativo o cero y datos insuficientes.

## Orden
Primero la bandeja de ideas (por el botón global), luego cumpleaños, planes, wishlist, gastos fijos con la revisión de ahorro y por último la previsión de ahorro. Haz un commit por cada sección y, al terminar, dime cómo probarlo y si tengo que ejecutar alguna migración en Supabase.
