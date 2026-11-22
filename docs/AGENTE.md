# El agente del PC: instalarlo paso a paso

El agente es un programa pequeño que se queda funcionando en tu PC de casa
(CachyOS con KDE Plasma). Hace de puente entre Mi Panel y el ordenador:

- **Puente:** cuando mandas algo desde el móvil, el PC te avisa con una
  notificación y, si es texto o un enlace, lo copia al portapapeles.
  `mipanel-enviar` manda al Puente lo que tengas copiado.
- **Encendido / apagado:** cada minuto avisa de que está vivo.
- **Mando del PC** (sección 4) y **vigilante de la red** (sección 5): más
  adelante.

Nunca hace falta `sudo` y no se guarda ninguna clave importante en el PC: el
agente tiene **su propia cuenta**, que solo puede hacer lo del agente.

---

## 1. Lo que necesitas (una sola vez)

Abre una terminal (Konsole) y comprueba que tienes Node 23.6 o más nuevo:

```
node -v
```

Si no lo tienes, o es más viejo:

```
sudo pacman -S --needed nodejs npm
```

Recomendado, para el portapapeles en Wayland (si no, se usa Klipper de KDE):

```
sudo pacman -S --needed wl-clipboard
```

`notify-send` (notificaciones) ya viene con KDE (`libnotify`).

## 1 bis. En Supabase (una sola vez)

El agente entra con su propia cuenta de **email y contraseña** (no con
Google), así que ese método tiene que estar activado:

1. Panel de Supabase → **Authentication → Sign In / Providers → Email**:
   actívalo y deja **Confirm email** activado.
2. No hace falta nada más: un trigger de la base de datos
   (`solo_google_o_agentes`) impide que nadie se dé de alta con email y
   contraseña salvo los agentes que crea la Edge Function. Tus compañeros y tu
   familia siguen entrando solo con Google.
3. Publica la Edge Function del agente:
   ```
   npx supabase functions deploy agentes --no-verify-jwt
   ```

## 2. Instalar

Desde la carpeta del proyecto:

```
bash agente/instalar.sh
```

Esto, sin tocar nada fuera de tu usuario:

1. copia el agente a `~/.local/share/mipanel-agente` e instala su única
   dependencia (`@supabase/supabase-js`, la misma librería que usa la app);
2. crea los comandos `mipanel-agente` y `mipanel-enviar` en `~/.local/bin`;
3. crea `~/.config/mipanel/config.json` de ejemplo (carpeta con permisos 700);
4. instala el **servicio de usuario de systemd** `mipanel-agente.service`,
   que arranca solo al iniciar sesión en el escritorio.

Si te dice que añadas `~/.local/bin` al PATH: en CachyOS con fish ya suele
estar; si no, `fish_add_path ~/.local/bin`.

## 3. Vincular el PC

1. En la app: **Más → Mando del PC → Vincular un PC**. Te enseña un código
   (dura 10 minutos y sirve una vez) y el comando listo para copiar.
2. En el PC, pégalo en la terminal:
   ```
   mipanel-agente vincular ABCD-EFGH "PC casa"
   ```
3. Guarda las credenciales del agente en `~/.config/mipanel/credenciales.json`
   con permisos **600** (solo tú las puedes leer) y arranca el servicio.
4. En la app, el PC sale como **Encendido** en menos de un minuto.

Comprobar que va:

```
mipanel-agente estado
systemctl --user status mipanel-agente
journalctl --user -u mipanel-agente -f      # el registro en directo (Ctrl+C para salir)
```

## 4. Atajo de teclado para `mipanel-enviar`

1. **Preferencias del sistema → Teclado → Atajos de teclado → Añadir nuevo →
   Orden o script**.
2. Orden: `mipanel-enviar` (o la ruta completa `~/.local/bin/mipanel-enviar`).
3. Ponle un atajo, por ejemplo **Meta + Mayús + C**.
4. Copia un texto, pulsa el atajo y te sale «Mandado al Puente».

## 5. Desvincular o desinstalar

- **Desde la app:** Mando del PC → Desvincular. Deja de funcionar al momento.
- **Desde el PC:** `mipanel-agente desvincular` (avisa al servidor y borra las
  credenciales).
- **Desinstalar del todo:** `bash agente/desinstalar.sh` (desvincula, para el
  servicio y borra el agente y, si quieres, la configuración).

## Problemas comunes

| Síntoma | Qué hacer |
|---|---|
| «El código no vale» | Ha caducado (10 min) o ya se usó: pide otro en la app. |
| En la app sale «Apagado» | `systemctl --user status mipanel-agente`; mira el registro con `journalctl --user -u mipanel-agente -n 50`. |
| No copia al portapapeles | Instala `wl-clipboard` y reinicia: `systemctl --user restart mipanel-agente`. |
| «Este PC ya no está vinculado» | Lo desvinculaste desde la app: vuelve a vincularlo (paso 3). |

---

## Decisiones (para clase)

- **Un usuario de Supabase aparte para el agente.** Lo crea la Edge Function
  `agentes` al vincular, con una contraseña aleatoria de 32 bytes y la marca
  `app_metadata.tipo = 'agente'` (solo el servidor puede escribirla). Con esa
  cuenta las políticas RLS le cierran todas tus tablas: si alguien robara
  `credenciales.json`, podría leer tu Puente de los últimos 7 días y poco más,
  nunca tus hábitos, dinero o tareas. Mucho mejor que guardar la service role
  en el PC, que se salta todo el RLS.
- **Desvincular corta al momento.** Los tokens (JWT) de Supabase siguen siendo
  válidos hasta una hora aunque se borre el usuario. Por eso todas las
  políticas del agente preguntan en cada consulta si existe su fila en
  `agentes`: al borrarla, deja de ver y de hacer nada aunque su token siga vivo.
- **El agente nunca ejecuta texto de la base de datos.** Usa `execFile` con
  un programa fijo y una lista de argumentos (sin shell), y el texto del
  Puente va por la entrada estándar. Aunque alguien mandara
  `$(rm -rf ~)` al Puente, solo se copiaría ese texto al portapapeles.
- **Las notificaciones escapan el HTML del cuerpo** (`<`, `>`, `&`): KDE
  interpreta algo de HTML ahí y un texto podría colar un enlace. El título es
  texto plano y va tal cual.
- **Lo que manda otro PC no se copia solo.** Si un PC estuviera comprometido,
  podría mandar `curl … | sh` al Puente para que lo pegaras en una terminal de
  otro PC. Lo que llega de otro agente solo se avisa.
- **El agente no es una cuenta de nada más.** Con sus credenciales se puede
  iniciar sesión como cualquier usuario, así que seguridad pidió cerrarle
  también las tablas de la web de exámenes, Storage y Gemini (una política
  restrictiva en todas las tablas y en `storage.objects`). Y como un token
  (JWT) sigue valiendo hasta una hora aunque se borre el usuario,
  `tipo_cuenta()` mira primero lo que dice el propio token.
- **Solo Google (y los agentes) pueden crear cuentas.** Activar email y
  contraseña para el agente abriría la puerta a darse de alta con el email de
  un compañero que aún no ha entrado y quedarse con su cuenta cuando entre con
  Google. El trigger `solo_google_o_agentes` lo impide.
- **Topes en systemd:** como mucho 200 MB de RAM y el 20 % de un núcleo
  (normalmente usa unos 80 MB y casi nada de CPU).
- **Credenciales con permisos 600** dentro de una carpeta 700, creadas ya con
  esos permisos (no se escriben primero y se cambian después).
- **Node 24+ ejecuta TypeScript sin compilar** (quita los tipos al cargar),
  así que el agente no tiene paso de compilación ni más dependencias.
- **Servicio de usuario de systemd** ligado a `graphical-session.target`:
  necesita tu sesión de escritorio para el portapapeles, las notificaciones y
  el volumen, y no necesita ser root.
