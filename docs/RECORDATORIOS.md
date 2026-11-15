# Activar las novedades en Supabase (categorías, fijos, recordatorios y fase 8)

Las categorías, los gastos fijos y los recordatorios necesitan dos migraciones
nuevas. Los recordatorios necesitan además una Edge Function y sus claves.
Hasta que lo hagas, la web sigue funcionando: solo fallará al guardar una
categoría o un fijo, y los recordatorios dirán que no se han podido guardar.

## 1. Migraciones (en este orden)

```
supabase/migrations/20261114000100_categorias_y_fijos.sql
supabase/migrations/20261114000200_recordatorios.sql
supabase/migrations/20261114000300_ideas.sql
supabase/migrations/20261114000400_cumpleanos.sql
supabase/migrations/20261114000500_planes.sql
supabase/migrations/20261114000600_deseos.sql
supabase/migrations/20261114000700_no_revivir_borrados.sql
supabase/migrations/20261114000800_frecuencia_y_revisiones.sql
supabase/migrations/20261115000100_medio_de_pago.sql
```

De la 000300 a la 000600 son de la fase 8 (ideas, cumpleaños, planes y lista de
deseos): sin ellas esas pantallas abren pero no pueden guardar en la nube.
La 000700 impide que una fila borrada en un dispositivo vuelva a aparecer
si otro la edita sin conexión.

La 000800 es de las secciones 5 y 6 de la fase 8 (fijos cada día, semana, mes o
año; esencial/prescindible; revisiones de ahorro). **Aplícala ANTES de subir la
web nueva**: la app nueva guarda columnas que solo existen con ella y, sin la
migración, no sincroniza (no pierde nada: lo reintenta hasta que la apliques).
Los fijos que ya tenías se convierten solos en «cada mes» y siguen igual.

La 20261115000100 añade «tarjeta o efectivo» a movimientos y fijos. También
**antes de subir la web nueva**. Lo que ya tenías queda como «tarjeta».

Igual que en `docs/MIGRAR.md`: o pegando cada archivo en **SQL Editor → New
query → Run**, o con la CLI:

```
npx supabase db push
```

La segunda activa `pg_cron` y `pg_net`, guarda un secreto aleatorio en Vault y
programa el aviso cada hora (minuto 5). No tienes que copiar ningún secreto.

## 2. Claves de los recordatorios

Ya están generadas: la pública va en la app y la **privada** está en
`supabase/functions/.env`, que **no se sube a GitHub** (no lo compartas).

1. Abre `supabase/functions/.env` y cambia la línea
   `VAPID_SUBJECT=https://TU-SITIO.netlify.app` por la dirección de tu web.
2. Súbelas a Supabase como secretos:

```
npx supabase secrets set --env-file supabase/functions/.env
```

(Si alguna vez generas claves nuevas con `node scripts/claves-recordatorios.mjs`,
hay que volver a activar los recordatorios en cada dispositivo.)

## 3. Publicar la función

```
npx supabase functions deploy recordatorios --no-verify-jwt
```

`--no-verify-jwt` es a propósito: la llama el cron, que no tiene sesión. La
protege el secreto de Vault (solo el cron lo conoce).

## 4. Probarlo

1. En tu web (Netlify), **Cuenta → Recordatorios → Activar** y acepta el permiso.
   En iPhone primero hay que añadir la web a la pantalla de inicio y abrirla desde ahí.
2. Elige una hora que esté al caer y deja algún hábito sin marcar.
3. Al minuto 5 de esa hora llega el aviso. Si no llega: Supabase → **Edge
   Functions → recordatorios → Logs**, y en **Database → Cron Jobs** el
   historial de `recordatorios`.

## Si cambias de proyecto de Supabase

La dirección de la función está escrita en la migración del cron y en la CSP
de `netlify.toml`: cámbiala en los dos sitios.
