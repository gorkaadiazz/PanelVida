# Casa (fase 9): qué tienes que hacer tú

Cada sección dice qué aplicar en Supabase, cómo probarlo y qué decisiones
hay detrás. Las migraciones se aplican **antes** de subir la web nueva.

> La historia de migraciones del proyecto está vacía (se aplicaron a mano):
> **no uses `npx supabase db push`**, porque intentaría repetirlas todas.
> Aplica solo la nueva, pegándola en **SQL Editor → New query → Run** o con:
>
> ```
> npx supabase db query --remote -f supabase/migrations/<archivo>.sql
> ```

---

## 1. Puente móvil ⇄ PC

### Qué hace
- Mandas texto, enlaces o archivos (hasta 25 MB) desde un dispositivo y aparecen
  al momento en los demás, sin recargar.
- Cada elemento dice desde qué dispositivo se mandó y a qué hora. El nombre del
  dispositivo se cambia arriba, en el Puente («Este dispositivo: … Cambiar»).
- Copiar (texto), abrir (enlace), descargar (archivo), fijar y borrar.
- Lo que no fijes se borra solo a los 7 días (fila y archivo).
- En Android, Mi Panel sale en el menú **Compartir** (si la tienes instalada
  como app) y lo compartido se abre en el Puente para mandarlo.
- Texto y enlaces se pueden mandar **sin conexión** (suben al volver). Los
  archivos necesitan conexión.

### Pasos
1. **Migración** `supabase/migrations/20261122000100_puente.sql`. Crea:
   - la tabla `puente` con RLS (cada uno solo lo suyo);
   - el bucket **privado** `puente` (25 MB por archivo) y sus políticas;
   - la tabla en Realtime (publicación `supabase_realtime`);
   - el cron de limpieza (cada hora, en el minuto 15).
2. **Comprueba Realtime:** en el panel, **Database → Publications →
   supabase_realtime** tiene que incluir `puente`. Si no (por ejemplo, si la
   publicación no existía), ejecuta:
   `alter publication supabase_realtime add table public.puente;`
3. **Publica la función de limpieza:**
   ```
   npx supabase functions deploy limpiar-puente --no-verify-jwt
   ```
   `--no-verify-jwt` es a propósito: la llama el cron, que no tiene sesión.
   La protege el mismo secreto de Vault que los recordatorios.
4. **Sube la web** (`git push`): Netlify la publica.

### Cómo probarlo
1. Abre el Puente en el móvil y en el PC a la vez. Manda un texto desde el
   móvil: tiene que aparecer en el PC en uno o dos segundos.
2. Manda un enlace (solo la dirección): sale como enlace, con el botón de abrir.
3. Adjunta un archivo pequeño y descárgalo desde el otro dispositivo.
4. Activa el modo avión en el móvil, manda un texto (sale «Por subir»),
   quita el modo avión: sube solo.
5. En Android: instala la app (menú del navegador → Instalar), abre una web
   en Chrome → Compartir → Mi Panel. Se abre el Puente con el enlace listo.
6. Limpieza (opcional): pasada una hora, en **Edge Functions → limpiar-puente
   → Logs**, la llamada del minuto 15 tiene que haber respondido 200.

### Decisiones (para clase)
- **El Puente es una tabla más de la sincronización.** Realtime no trae los
  datos: solo avisa de que algo ha cambiado y la app sincroniza como siempre.
  Así hay un solo camino para los datos (copia local + cola) y funciona sin
  conexión.
- **Primero la fila y después el archivo.** La política de Storage solo deja
  subir a la ruta exacta de una fila tuya que ya exista y que aún no tenga
  archivo.
- **El tope de 300 MB cuenta los bytes reales, no los que dice la app.** La
  primera versión sumaba el tamaño que manda el móvil (`archivo_bytes`), y
  seguridad encontró el agujero: alguien podía declarar 1 byte y subir 25 MB
  en cada fila, hasta llenar el GB de todo el proyecto. Ahora:
  - la política de subida suma lo que mide Storage en tu carpeta
    (`metadata->>'size'`);
  - como mucho puede haber 3 archivos «por subir» a la vez;
  - cada fila recibe un solo archivo en su vida (el archivo solo se puede
    borrar cuando su fila ya no existe);
  - una fila que espera su archivo no se puede borrar hasta pasadas 2 horas
    (si no, borrándola se liberaría el hueco de «por subir» con la subida en
    marcha); la limpieza la quita sola;
  - entre todos los usuarios, como mucho 700 MB en el bucket.

  Seguridad necesitó tres vueltas para cerrarlo: cada arreglo abría otro
  camino. Es normal; por eso cada caso tiene su test SQL.

  Lección: **nunca te fíes de un dato que manda el cliente para una decisión
  de seguridad**; mide en el servidor.
- **La ruta va dentro de tu carpeta y de esa fila** (`{tu id}/{id fila}/nombre`),
  y un check de la base de datos lo obliga. Es importante porque la limpieza
  usa la service role (se salta el RLS): sin ese check, una fila podría
  apuntar al archivo de otra persona y la limpieza lo borraría.
- **La fila manda.** La limpieza borra la fila caducada (solo si sigue sin
  fijar) y después el archivo; cada hora barre también los archivos que se
  hayan quedado sin fila. Un archivo sin fila es basura; una fila sin archivo
  no puede pasar.
- **Descarga con URL firmada de 60 s.** El bucket es privado: no hay enlace
  público a tus archivos.
- **CSP:** `netlify.toml` ya solo permitía conectar a tu proyecto de Supabase
  (`https://` y `wss://`, que es el de Realtime). No ha hecho falta tocarla.

### Cosas a saber
- Si una subida de archivo falla a medias, en tus otros dispositivos puede
  verse ese archivo hasta 3 horas, sin poder descargarse; después la limpieza
  lo quita solo.
- Una web maliciosa podría rellenarte el Puente con un formulario a
  `/compartir` (el filtro de origen se salta). No se manda nada sin que pulses
  «Mandar», así que se acepta.

### Límites del plan gratuito
- Storage: 1 GB para todo el proyecto (también los temarios de la web de
  exámenes). El Puente tiene un tope de 300 MB por usuario y 700 MB entre todos, máximo 25 MB por
  archivo, y lo no fijado se borra a los 7 días.
- Realtime y Edge Functions: muy lejos del límite (una llamada a la limpieza
  a la hora, unas 720 al mes de las 500.000 gratis).

---

## 2. Lista de la compra

### Qué hace
- Dos pestañas: **Mi lista** (solo tuya) y **Lista de casa** (la ve todo el hogar).
- Cada artículo: nombre, cantidad, sección del súper y notas. Se agrupan por
  sección en el orden en que se recorre el súper.
- Marcar como comprado de un toque. En la de casa pone quién lo marcó.
  «Quitar los comprados» pide confirmación.
- Sugerencias al escribir con lo que más has comprado.
- Funciona **sin conexión** (el súper sin cobertura) y se sube al volver. En la
  de casa, lo que cambian los demás llega al momento.
- **Hogar:** lo creas tú, generas un **código de invitación** (dura 7 días y
  sirve una vez), tu familiar lo escribe y entra. Puedes ver los miembros,
  expulsar a alguien (deja de verla al instante) y borrar el hogar.
- **Tu familia** entra con su cuenta de Google y solo ve la Lista de la compra
  (Mi lista y Lista de casa). Nada de hábitos, dinero ni Casa.

### Pasos
1. **Migraciones, en este orden:**
   ```
   supabase/migrations/20261122000200_cuentas_y_mi_lista.sql
   supabase/migrations/20261122000300_hogares.sql
   supabase/migrations/20261122000400_compra_casa.sql
   ```
2. **Comprueba Realtime:** en **Database → Publications → supabase_realtime**
   tienen que estar `compra_casa`, `borrados_hogar`, `hogar_avisos` y `borrados`.
3. **Sube la web** (`git push`).
4. **Añade a tu familia** (SQL Editor), cada email en las DOS tablas, en
   minúsculas:
   ```sql
   insert into public.emails_permitidos (email) values ('familiar@gmail.com');
   insert into public.cuentas_solo_lista (email) values ('familiar@gmail.com');
   ```
   Si solo lo pones en `emails_permitidos`, entrará como una cuenta normal
   (vería un Mi Panel vacío, suyo, como tus compañeros).

### Cómo probarlo
1. En tu cuenta: **Más → Lista de la compra → Lista de casa → Crear hogar**.
2. Abre el panel del hogar → **Crear un código de invitación** y cópialo.
3. Con la cuenta de tu familiar (otro navegador o en privado): entra, se abre
   directamente la lista; **Lista de casa → escribe el código → Entrar**.
4. Apunta algo en un dispositivo: aparece en el otro en un par de segundos.
   Márcalo como comprado: en el otro pone «Marcado por …».
5. Modo avión en el móvil: apunta y marca cosas; al volver la conexión, suben.
6. Expulsa a tu familiar desde el panel: en su dispositivo la Lista de casa
   desaparece y vuelve a pedir un código.
7. Prueba que el familiar no ve nada más: en su navegador, escribe a mano
   `/habitos` o `/dinero` en la dirección: le lleva a la lista.

### Decisiones (para clase)
- **Marcar a la familia sin tocar las tablas de la web de exámenes:** una
  tabla nueva `cuentas_solo_lista` (como `emails_permitidos`) y una función
  `tipo_cuenta()`. Ocultar los menús es solo comodidad; la seguridad es una
  política **RESTRICTIVE** en cada tabla de Mi Panel. Postgres une las
  políticas *permissive* con OR y las *restrictive* con AND, así que se añade
  una condición a todas sin tocar las cuatro que ya había.
- **Dos tablas y no una:** `compra_mia` tiene las 4 políticas de siempre;
  `compra_casa` tiene las del hogar. Un error en las compartidas no puede
  destapar la privada.
- **`es_miembro(hogar_id)` es `security definer` con `search_path` fijo:**
  si las políticas consultaran `hogar_miembros` directamente, las políticas de
  `hogar_miembros` se volverían a consultar a sí mismas. Se escribe como
  `(select public.es_miembro(...))` para que Postgres la calcule una vez por
  consulta y no una por fila.
- **Expulsar es inmediato** porque el permiso se comprueba en cada consulta
  (no hay un «token de hogar» que siga valiendo).
- **Código de invitación:** 10 caracteres sin letras que se confundan
  (sin I, O, 0 ni 1), unos 50 bits de azar. En la base de datos solo se
  guarda su hash: quien lea la tabla no puede usarlo. Como mucho 10 intentos
  fallidos por hora. La función devuelve un texto en vez de dar error para
  que el intento fallido quede apuntado (un error desharía la transacción y
  también el apunte).
- **Cómo encaja con la sincronización:**
  - los borrados de la Lista de casa van a `borrados_hogar`, que leen todos
    los miembros (en `borrados` solo los vería quien creó la fila);
  - si entras en un hogar, sus artículos antiguos tienen un `sync_at` anterior
    a tu última descarga y no llegarían: el motor detecta que tu hogar ha
    cambiado y vuelve a bajar la lista entera. Si te expulsan, la vacía;
  - «quién lo marcó» lo pone el servidor con tu cuenta real: no se puede
    falsear.
- **Realtime y los borrados:** Realtime aplica el RLS a lo nuevo y a lo
  editado, pero **no a los borrados**: a quien escuche le manda la clave de
  cualquier fila borrada, sea de quien sea. Seguridad vio que, escuchando
  `hogar_miembros`, cualquiera sabría quién sale o es expulsado de cada hogar.
  Por eso la app nunca escucha borrados: se entera por los INSERT en
  `borrados_hogar`, en `borrados` (filtrado por tu usuario) y en `hogar_avisos`.
- **El nombre que ven los demás** sale de tu cuenta de Google
  (`auth.identities`), que no puedes cambiar desde la app. El de
  `user_metadata` sí se puede cambiar, y alguien podría hacerse pasar por otro.
- **«Gana el cambio más reciente»** se fía de la hora del dispositivo. En una
  lista compartida, alguien podría mandar una fecha del año 9999 y bloquear un
  artículo para siempre; el servidor la limita a «ahora + 5 minutos».
- **Sugerencias:** «Quitar los comprados» borra los artículos, así que el
  historial vive aparte, en `compra_frecuentes`, que rellena el servidor al
  marcar algo como comprado.

---

## 3. Agente del PC

### Qué hace
- Un programa pequeño en tu PC de casa (servicio de usuario de systemd).
  Guía de instalación paso a paso: [AGENTE.md](AGENTE.md).
- Avisa con una notificación de lo que llega al Puente y copia al
  portapapeles el texto y los enlaces (lo que mande otro PC solo lo avisa).
- `mipanel-enviar` manda al Puente lo que tengas copiado (con un atajo de KDE).
- Cada minuto avisa de que está encendido: en **Mando del PC** y en Inicio
  sale «Encendido» o «Apagado (visto hace X)».
- Vincular desde la app con un código de un solo uso (10 minutos) y
  desvincular al momento.

### Pasos
1. **Migración** `supabase/migrations/20261122000500_agente.sql`.
2. **Supabase → Authentication → Sign In / Providers → Email**: actívalo con
   **Confirm email** activado (el agente entra con email y contraseña; nadie
   más puede darse de alta así).
3. **Edge Functions:**
   ```
   npx supabase functions deploy agentes --no-verify-jwt
   npx supabase functions deploy limpiar-puente --no-verify-jwt
   ```
4. **Subir la web** (con el resto de la fase).
5. **Instalar el agente** en el PC: `bash agente/instalar.sh` y vincularlo
   (ver [AGENTE.md](AGENTE.md)).

### Cómo probarlo
1. Mando del PC → Vincular un PC → copia el comando y pégalo en Konsole.
2. En menos de un minuto el PC sale «Encendido».
3. Manda un texto al Puente desde el móvil: el PC lo notifica y al pegar
   (Ctrl+V) sale el texto.
4. Copia algo en el PC y ejecuta `mipanel-enviar`: aparece en el Puente del móvil.
5. Apaga el servicio (`systemctl --user stop mipanel-agente`): en 2-3 minutos
   sale «Apagado (visto hace …)».
6. Desvincula desde la app: el agente avisa de que se ha desvinculado y se para.

### Decisiones (para clase)
Están explicadas al final de [AGENTE.md](AGENTE.md): usuario aparte con
mínimo privilegio, corte inmediato al desvincular, nunca ejecutar texto de la
base de datos, credenciales 600 y servicio de usuario sin root. Lo que más
merece la pena contar: **seguridad encontró que la cuenta del agente, aunque
no podía ver nada tuyo, seguía siendo una cuenta para todo lo demás** (la web
de exámenes, Storage, Gemini), y **que un token sigue valiendo una hora
aunque se borre el usuario**. Mínimo privilegio no es solo «no ve mis datos»:
es «no puede hacer nada que no necesite».

---

## 4. Mando del PC

### Qué hace
- En **Mando del PC**, cada PC encendido tiene botones: bloquear, suspender,
  reiniciar y apagar (estos dos con confirmación), volumen (botones y control
  deslizante con el volumen real), música (anterior, play/pausa, siguiente) y
  abrir las apps de tu `config.json`.
- Se ve el resultado de las últimas órdenes: hecho, error o caducado.
- Con el PC apagado, los botones se desactivan.

### Pasos
1. Migración `supabase/migrations/20261122000600_mando.sql`.
2. Reinstalar el agente: `bash agente/instalar.sh` (y poner las apps en
   `config.json`, ver [AGENTE.md](AGENTE.md)).

### Decisiones (para clase)
- **Lista fija dos veces:** el `check` de la tabla solo admite 12 acciones, y
  el agente vuelve a traducir cada una con SU tabla. De la base de datos solo
  llega el nombre de la acción, nunca un comando.
- **Caducidad de 30 s con la hora del servidor** (no la del móvil), y el
  agente «coge» cada orden con una función que la marca: aunque le llegue dos
  veces (reconexión), se ejecuta una sola vez.
- **Apagar y reiniciar cuentan el resultado antes de ejecutarse:** después
  ya no hay PC que conteste.

## 5. Vigilante de la red de casa

### Qué hace
- Cada 5 minutos, si el PC está en casa (MAC del router), el agente mira qué
  aparatos hay y lo manda. En **Red de casa**: nombre, fabricante, IP, MAC,
  conectado o no, primera y última vez; los **desconocidos arriba** con la
  etiqueta «Desconocido».
- Notificación (los mismos avisos que los recordatorios) cuando aparece un
  aparato que no se había visto nunca, una sola vez por aparato.
- Unir una MAC aleatoria nueva con un aparato conocido.
- Historial de los últimos 30 días (lo viejo se borra solo).
- Aviso en Inicio si hay algún desconocido conectado.

### Pasos
1. Migración `supabase/migrations/20261122000700_red.sql`.
2. Edge Function: `npx supabase functions deploy aviso-red --no-verify-jwt`.
3. En el PC: `mipanel-agente red` y poner `macRouter` en `config.json`.
4. Para recibir el aviso: Cuenta → Recordatorios activados en el móvil.

### Decisiones (para clase)
- **Escaneo sin privilegios** (UDP + tabla de vecinos) en vez de `arp-scan`
  con `setcap` (ver [AGENTE.md](AGENTE.md)).
- **Solo en casa:** primero se pregunta solo por el router; si su MAC no es la
  tuya, no se barre ninguna red ajena (la de clase, un bar…).
- **Historial por intervalos** (desde-hasta) y no una fila cada 5 minutos:
  con 15 aparatos serían más de 4.000 filas al día.
- **Avisar una sola vez:** el aparato nuevo llega con `avisado = false`; la
  Edge Function lo marca **antes** de enviar (si se llamara dos veces a la
  vez, la segunda ya no lo encuentra).
- **MAC aleatorias:** los móviles cambian de MAC por privacidad (el «bit
  local» del primer byte lo delata). Por eso un móvil conocido puede salir como
  nuevo y se puede unir con el conocido.
