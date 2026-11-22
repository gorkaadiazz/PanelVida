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
