# Publicar Mi Panel en Netlify

La configuración ya está en `netlify.toml` (cómo se compila, que cualquier ruta
cargue la app y las cabeceras de seguridad). Solo hay que conectarlo.

**No uses GitHub Pages.** `gorkaadiazz.github.io` es el mismo origen que la web
de exámenes: las dos podrían leer la sesión guardada de la otra. Además, Pages
sirve el código sin compilar y la página sale en blanco.

## Antes
- Migraciones aplicadas en Supabase (`docs/MIGRAR.md`). Sin ellas la web abre pero no guarda nada.

## Pasos
1. Entra en https://app.netlify.com y regístrate con GitHub.
2. **Add new site → Import an existing project → GitHub → PanelVida.**
   Netlify lee `netlify.toml`: no cambies el comando ni la carpeta.
3. **Environment variables** (en esa misma pantalla o luego en
   *Site configuration → Environment variables*), con los valores de tu `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (la clave pública; **nunca** la service role)
4. **Deploy.** Si cambias las variables después, hay que volver a publicar
   (*Deploys → Trigger deploy*), porque se meten en la app al compilar.
5. Cambia el nombre del sitio si quieres (*Site configuration → Change site name*),
   por ejemplo `mi-panel-gorka` → `https://mi-panel-gorka.netlify.app`.
6. En Supabase → **Authentication → URL Configuration**:
   - **Redirect URLs:** añade `https://TU-SITIO.netlify.app/**`
   - Deja también `http://localhost:5173/**` para probar en tu ordenador.
   - No cambies el **Site URL** si la web de exámenes depende de él.
   - **Nunca** pongas un comodín como `https://*.netlify.app/**`: cualquier
     sitio de Netlify de otra persona podría recibir tu inicio de sesión.
     Por eso las vistas previas de Netlify (`deploy-preview-N--…`) no pueden
     iniciar sesión; es lo esperado.

Cada `git push` a `main` vuelve a publicar la web sola.

## Si cambias de proyecto de Supabase
La CSP de `netlify.toml` solo deja conectar con el proyecto actual
(`connect-src`). Cambia ahí la dirección o la app no podrá hablar con Supabase.

## Si sale en blanco
- Abre la consola del navegador (F12). «Faltan VITE_SUPABASE_URL…» → faltan las
  variables del paso 3 (y volver a publicar).
- «Refused to connect… Content Security Policy» → la dirección de Supabase de la
  variable no coincide con la de `netlify.toml`.
