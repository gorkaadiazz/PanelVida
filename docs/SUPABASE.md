# Supabase: qué hacer para que el login funcione en local

Mi Panel reutiliza el proyecto de Supabase de la app de exámenes anterior
(`pmcacougksqimitapiqr`). Las tablas, el login con Google y la lista de emails
permitidos ya existen. Solo hay que decirle a Supabase que también acepte la
dirección de desarrollo `http://localhost:5173`.

Tardas unos 5 minutos.

## 0. Antes de empezar

- Comprueba que existe el archivo `.env.local` en la raíz del proyecto con
  `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Si no está, copia
  `.env.example` como `.env.local` y pon los valores de
  Supabase → **Project Settings → API**.
- **Nunca** pongas ahí la `service_role` key: esa no puede llegar al navegador.

## 1. Si el proyecto está pausado, reactívalo

En el plan gratuito, Supabase **pausa el proyecto tras ~1 semana sin uso**.
Mientras está pausado el login y los datos no funcionan (verás errores de red).

1. Entra en <https://supabase.com/dashboard> con tu cuenta.
2. Abre el proyecto. Si pone **Paused**, pulsa **Restore project**
   (o "Resume").
3. Espera unos minutos hasta que aparezca como activo. Los datos no se pierden.

## 2. Añadir `localhost:5173` a las URL de vuelta

Cuando entras con Google, Supabase te devuelve a la app. Por seguridad, solo
devuelve a direcciones que estén en una lista.

1. En el proyecto, menú de la izquierda: **Authentication**.
2. Entra en **URL Configuration**.
3. En **Redirect URLs** pulsa **Add URL** y escribe exactamente:

   ```
   http://localhost:5173/**
   ```

4. Guarda (**Save URLs**).
5. **No borres** las URL que ya había (las de la app vieja, p. ej. la de
   GitHub Pages): la app anterior las sigue necesitando.
6. Deja el **Site URL** como está.

> Más adelante, cuando despleguemos Mi Panel (fase 7), añadiremos aquí también
> su dirección pública.

## 3. Comprobar que tu email está en la lista

Solo pueden registrarse los emails de la tabla `emails_permitidos` (lo
comprueba un trigger de la base de datos). Si tu email no está, al entrar verás
"Este email no tiene acceso a la app".

1. Menú de la izquierda: **SQL Editor** → **New query**.
2. Pega esto y pulsa **Run**:

   ```sql
   select * from public.emails_permitidos;
   ```

3. Tu email de Google debería aparecer, en minúsculas.

### Añadir a un compañero

En el mismo SQL Editor (cambia el email por el suyo):

```sql
insert into public.emails_permitidos (email) values (lower('compa@gmail.com'));
```

El `lower(...)` es importante: la tabla solo admite emails en minúsculas.
Cada compañero verá **solo sus propios datos** (lo garantizan las políticas RLS).

Para quitar a alguien de la lista:

```sql
delete from public.emails_permitidos where email = lower('compa@gmail.com');
```

(Esto impide que se registre de nuevo, pero no borra una cuenta que ya exista.)

## 4. Google Cloud: no hay que tocar nada

En Google Cloud Console, el "URI de redirección autorizado" del cliente OAuth
es el **callback de Supabase** (`https://pmcacougksqimitapiqr.supabase.co/auth/v1/callback`),
no la dirección de la app. Ese ya está configurado desde la app anterior.

El recorrido es: app → Google → **Supabase** → app. Google solo habla con
Supabase, y Supabase decide a qué app volver usando la lista del paso 2.
Por eso basta con el paso 2.

## 5. Probar

1. `npm run dev`
2. Abre <http://localhost:5173> y pulsa "Entrar con Google".
3. Elige tu cuenta. Deberías volver a la app con la sesión iniciada.

### Si algo falla

| Lo que ves | Causa probable |
| --- | --- |
| Vuelves a otra dirección (la de la app vieja) | Falta `http://localhost:5173/**` en Redirect URLs (paso 2). |
| "Este email no tiene acceso a la app" | Tu email no está en `emails_permitidos` (paso 3). |
| Error de red o la página de Supabase no carga | El proyecto está pausado (paso 1). |
| "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY" | Falta `.env.local` (paso 0). Tras crearlo, reinicia `npm run dev`. |
