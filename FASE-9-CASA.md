# Fase 9: Casa (puente, mando del PC, red y lista de la compra)

Añade estas secciones a Mi Panel siguiendo las mismas reglas del proyecto (PROMPT.md, CLAUDE.md, PRODUCT.md y DESIGN.md): RLS en todas las tablas nuevas, el mismo sistema visual, lógica pura en `src/lib/` con sus tests, tests SQL de RLS en `tests/` y visto bueno de **seguridad** y **tester** (y de **diseno-ui** en las pantallas) antes de cerrar cada sección. Antes de programar, enséñame el plan (tablas, políticas, pantallas, dónde va cada cosa en la navegación y cómo se autentica el agente del PC) y espera mi OK. Explícame las decisiones importantes, que quiero aprender de esto para clase.

## Quién ve qué
- **Puente, Mando del PC y Red** son solo míos (cada usuario ve solo lo suyo, como el resto de la app). Nadie de mi familia los ve.
- **Lista de la compra** tiene dos partes: **Mi lista** (privada) y **Lista de casa** (compartida con los miembros de mi familia).
- Mi familia entra con su cuenta de Google (sus emails irán en `emails_permitidos`). Un familiar ve **solo** la Lista de la compra: ni hábitos, ni dinero, ni nada de Casa. Proponme cómo marcar a un usuario como «solo lista» (sin tocar tablas que comparta la web de exámenes) y recuerda que ocultar un menú no es seguridad: lo que importa es el RLS.

## 1. Puente móvil ⇄ PC
- Enviar desde cualquier dispositivo **texto, enlaces y archivos**, y que aparezcan al momento en los demás (Supabase Realtime, no hace falta recargar).
- Lista de lo enviado, lo más nuevo arriba, con el dispositivo de origen («Móvil», «PC casa», «PC clase»; nombre editable por dispositivo) y la hora.
- Botones: **copiar** (texto), **abrir** (enlace) y **descargar** (archivo). Fijar y borrar.
- Archivos en un bucket **privado** de Supabase Storage, en la carpeta del usuario (`{user_id}/…`), con políticas de Storage que solo dejen al dueño. Máximo 25 MB por archivo.
- Lo no fijado **caduca a los 7 días** (fila y archivo). Proponme cómo borrarlo en el servidor (cron + Edge Function, por ejemplo) sin dejar archivos huérfanos.
- **Compartir a Mi Panel en Android:** que Mi Panel salga en el menú «Compartir» del móvil (Web Share Target en el manifest) y lo compartido vaya al Puente.
- En el PC con KDE, el agente (sección 3) muestra una notificación cuando llega algo y lo copia al portapapeles si es texto o enlace. Y un comando `mipanel-enviar` que manda al Puente lo que tenga en el portapapeles, para asignarle un atajo de teclado en KDE.
- Revisa que la CSP de `netlify.toml` permita la conexión de Realtime (`wss://`) al proyecto de Supabase y nada más.

## 2. Lista de la compra
- Dos pestañas: **Mi lista** y **Lista de casa**.
- Cada artículo: nombre, cantidad opcional, sección del súper opcional (fruta, carne, limpieza…) y notas. Agrupados por sección.
- Marcar como comprado de un toque; en la de casa se ve quién lo marcó. Botón «Quitar los comprados» con confirmación.
- Sugerencias al escribir con lo que más se ha comprado antes.
- Funciona sin conexión (modo súper sin cobertura) y se sincroniza al volver; en la de casa, los cambios de los demás llegan al momento.
- **Hogar:** yo lo creo y genero un **código de invitación** (aleatorio, caduca en 7 días, de un solo uso). Mi familiar entra en la app, pone el código y queda dentro. Yo puedo ver los miembros y expulsar a alguien (pierde el acceso en ese momento).
- Esto rompe la regla de «solo el dueño ve sus filas»: las filas de la lista de casa las ven todos los miembros del hogar. Diséñalo con cuidado (por ejemplo, una función `es_miembro(hogar_id)` `security definer` con `search_path` fijo) y revisa cómo encaja con la sincronización actual (`sync/`, `borrados`, `no_revivir_borrado`): un miembro tiene que enterarse cuando otro borra o edita un artículo que no es suyo.
- Tests SQL: un miembro ve y edita la lista de casa; alguien de fuera no ve nada; la lista privada no la ve nadie más; un expulsado deja de ver; un familiar no puede leer ninguna otra tabla de Mi Panel; un código caducado o usado no sirve.

## 3. Agente del PC (CachyOS con KDE Plasma)
Un programa pequeño en el PC de casa que hace de puente entre la app y el ordenador. Lo necesitan el Mando, la Red y las notificaciones del Puente.
- En la carpeta `agente/` de este repo. Propón Node con `@supabase/supabase-js` (la misma librería que la app) salvo que veas algo mejor, y pocas dependencias.
- Se instala como **servicio de usuario de systemd** (`systemctl --user`) que arranca al iniciar sesión. Script de instalación y desinstalación y guía paso a paso en `docs/AGENTE.md`, que no lo he hecho nunca.
- **Vincular el PC:** en la app, «Vincular un PC» muestra un código de un solo uso que caduca en 10 minutos; en el PC ejecuto `mipanel-agente vincular CODIGO`. Desde la app puedo ver los PC vinculados y **desvincular** uno (deja de funcionar al momento).
- **Seguridad, lo más importante:**
  - Mínimo privilegio. Si alguien roba las credenciales del agente, no debe poder leer mis hábitos, dinero, tareas ni nada que no sea lo del agente. Mi propuesta: que el agente sea un **usuario de Supabase aparte** (creado por una Edge Function al vincular), enlazado a mi cuenta en una tabla, y que el RLS le deje leer y actualizar solo los comandos y escribir solo el estado y la red de su dueño. Valóralo con el agente seguridad y, si hay algo mejor, explícamelo.
  - Las credenciales se guardan en `~/.config/mipanel/` con permisos 600. Nada de service role en el PC.
  - El agente **nunca ejecuta texto que venga de la base de datos**: solo acciones de una lista fija dentro del propio agente.
- Cada minuto manda un latido: la app muestra «Encendido» o «Apagado (visto hace X)».

## 4. Mando del PC
- Acciones (solo estas): **apagar, reiniciar, suspender, bloquear pantalla**, **volumen** (subir, bajar, silenciar y un control deslizante), **multimedia** (play/pausa, siguiente, anterior) y **abrir apps** de una lista que configuro en el agente (por ejemplo Firefox, Steam, Dolphin), nunca un comando libre.
- En KDE con PipeWire: `wpctl` para el volumen, `playerctl` para multimedia, `loginctl lock-session` para bloquear y `systemctl` para apagar, reiniciar y suspender. Compruébalo y dime qué paquetes tengo que instalar.
- Apagar y reiniciar piden confirmación en la app.
- Cada comando caduca a los 30 segundos: si el PC estaba apagado, al encenderse **no** ejecuta órdenes viejas.
- La app muestra el resultado de cada comando (hecho, error o caducado) y los botones se desactivan si el PC está apagado.
- Encender el PC a distancia (Wake-on-LAN) **no** entra ahora: lo haré más adelante desde el mini PC del homelab.

## 5. Vigilante de la red de casa
- El agente escanea **solo mi red de casa** cada 5 minutos (propón `arp-scan` con las capacidades mínimas o una alternativa sin root, y explícame qué hace cada opción). Si el PC no está en la red de casa (configurada por la MAC del router), no escanea.
- Lista de dispositivos: nombre que yo le pongo, fabricante (por la MAC), IP, MAC, conectado ahora o no, primera vez y última vez visto.
- Marcar cada dispositivo como **conocido** o **desconocido**. Los desconocidos salen arriba y destacados (con texto, no solo color).
- **Aviso** por notificación (reutiliza los recordatorios Web Push que ya existen) cuando aparece un dispositivo que no se había visto nunca. Sin repetir el aviso por el mismo dispositivo.
- Ojo con las MAC aleatorias de los móviles: explícalo en la pantalla con una frase y permite unir un dispositivo nuevo con uno conocido.
- Historial corto (30 días) de cuándo estuvo conectado cada dispositivo; lo antiguo se borra solo.
- Tests de la lógica: leer la salida del escaneo, detectar los nuevos, no repetir avisos y caducidad.

## Navegación e Inicio
- Para mí: un apartado **Casa** dentro de «Más» (y en la barra lateral en el PC) con Puente, Mando del PC y Red, más **Lista de la compra**.
- Para un familiar: solo la Lista de la compra, que se abre directamente al entrar.
- En el Inicio: tarjeta pequeña con el estado del PC y el último elemento del Puente, y aviso si hay un dispositivo desconocido en la red.

## Límites del plan gratuito de Supabase
Tenlos en cuenta y avísame si algo se acerca: 1 GB de Storage, Realtime y Edge Functions del plan gratuito, y la pausa del proyecto tras una semana sin uso.

## Orden
1. Puente (texto y enlaces → archivos → compartir desde Android).
2. Lista de la compra (Mi lista → hogar e invitaciones → Lista de casa).
3. Agente del PC (vincular, latido, notificaciones del Puente y `mipanel-enviar`).
4. Mando del PC.
5. Vigilante de la red.

Un commit por paso y migraciones nuevas (nunca edites una aplicada). Al terminar cada sección dime qué está hecho, cómo probarlo y qué tengo que hacer yo (migraciones, bucket de Storage, Realtime, instalar el agente, añadir los emails de mi familia), paso a paso. Actualiza `docs/ESTADO.md` y `CLAUDE.md`.
