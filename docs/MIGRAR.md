# Aplicar los cambios de la base de datos (fase 2)

Mi Panel añade tablas nuevas (hábitos, tareas, dinero y negocio web), columnas
nuevas en `perfiles` y `modulos`, la función `inicializar_cuenta()` y un arreglo
para que **borrar la cuenta** funcione. Todo está en estos archivos, que hay que
aplicar **en este orden**:

```
supabase/migrations/20261113000100_mi_panel_tablas.sql
supabase/migrations/20261113000200_mi_panel_rls.sql
supabase/migrations/20261113000300_perfiles_modulos.sql
supabase/migrations/20261113000400_inicializar_cuenta.sql
supabase/migrations/20261113000500_arreglo_borrado_cuenta.sql
supabase/migrations/20261113000600_menos_privilegios.sql
```

Las migraciones antiguas (`20261110000100` … `20261110000500`) **ya están
aplicadas**: no las vuelvas a ejecutar.

La app vieja (Examenes-2SMR) sigue funcionando después de esto: solo se añaden
cosas, no se quita nada.

Elige **una** de las dos formas: A (sin instalar nada) o B (con la CLI).

---

## Antes de empezar: copia de seguridad (recomendado)

1. Entra en <https://supabase.com/dashboard> y abre el proyecto.
2. Si pone **Paused**, pulsa **Restore project** y espera a que esté activo.
3. En el plan gratuito no hay copias automáticas que puedas descargar. Si
   tienes datos importantes, en la app vieja usa la opción de exportar antes
   de seguir.

---

## Forma A · Sin la CLI (SQL Editor del panel)

1. En el proyecto, menú de la izquierda: **SQL Editor**.
2. Pulsa **New query**.
3. Abre en tu editor el primer archivo
   (`20261113000100_mi_panel_tablas.sql`), selecciona **todo** el contenido,
   cópialo y pégalo en el SQL Editor.
4. Pulsa **Run** (o Ctrl+Enter). Debe poner **Success. No rows returned**.
   - Si sale un error, **para** y no sigas con el siguiente archivo. Copia el
     mensaje de error y pásalo.
5. Borra el contenido del editor (o abre otra **New query**) y repite los
   pasos 3 y 4 con el segundo archivo, luego el tercero, el cuarto, el quinto y el sexto.
   **Siempre en orden.**

Comprobación final (pega y ejecuta en una query nueva):

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('habitos', 'habito_marcas', 'tareas', 'movimientos', 'clientes_web');
```

Deben salir las 5 tablas.

> Ojo: si más adelante quieres usar la CLI (forma B), las migraciones que
> aplicaste a mano **no estarán registradas** para ella. Mira el apartado
> "Si la CLI quiere volver a aplicar migraciones" más abajo.

---

## Forma B · Con la CLI de Supabase

No hace falta instalar nada: `npx` la descarga sola. Ejecuta los comandos en
una terminal **dentro de la carpeta del proyecto** (`panel-vida`).

### 1. Iniciar sesión

```bash
npx supabase login
```

Se abre el navegador; acepta. Vuelve a la terminal.

### 2. Enlazar el proyecto

```bash
npx supabase link --project-ref pmcacougksqimitapiqr
```

Te pedirá la **contraseña de la base de datos** (la que pusiste al crear el
proyecto). Si no la recuerdas: panel → **Project Settings → Database →
Reset database password**. (Cambiarla no afecta a la app.)

### 3. Ver qué migraciones cree la CLI que faltan

```bash
npx supabase migration list
```

Salen dos columnas: **Local** (archivos de la carpeta) y **Remote** (las que
la base de datos tiene apuntadas como aplicadas).

- Si las 5 antiguas (`20261110…`) aparecen en **las dos** columnas, perfecto:
  ve al paso 4.
- Si las antiguas aparecen **solo en Local** (con Remote vacío), es porque en
  su día se aplicaron a mano desde el SQL Editor y la CLI no lo sabe. Si haces
  `db push` así, intentará crearlas otra vez y fallará ("already exists").
  Antes, márcalas como aplicadas (esto **no** ejecuta nada, solo las apunta):

  ```bash
  npx supabase migration repair --status applied 20261110000100
  npx supabase migration repair --status applied 20261110000200
  npx supabase migration repair --status applied 20261110000300
  npx supabase migration repair --status applied 20261110000400
  npx supabase migration repair --status applied 20261110000500
  ```

  Vuelve a ejecutar `npx supabase migration list`: ahora las antiguas deben
  salir en las dos columnas y solo las `20261113…` en Local.

### 4. Aplicar las nuevas

```bash
npx supabase db push
```

La CLI compara las dos columnas, te enseña la lista de migraciones que va a
aplicar (deben ser solo las 5 `20261113…`) y pregunta si seguir. Responde
`Y`. Si una falla, se deshace esa migración y se para.

### Si la CLI quiere volver a aplicar migraciones

Si aplicaste las nuevas a mano con la forma A y luego usas la CLI, márcalas
también como aplicadas:

```bash
npx supabase migration repair --status applied 20261113000100
npx supabase migration repair --status applied 20261113000200
npx supabase migration repair --status applied 20261113000300
npx supabase migration repair --status applied 20261113000400
npx supabase migration repair --status applied 20261113000500
npx supabase migration repair --status applied 20261113000600
```

---

## Desplegar la función `borrar-cuenta`

La función ha cambiado (borra los archivos de cualquier subcarpeta y no
enseña detalles internos si falla). Hace falta la CLI (pasos 1 y 2 de la
forma B):

```bash
npx supabase functions deploy borrar-cuenta
```

**No** añadas `--no-verify-jwt`: la función debe exigir sesión.
Las claves que usa (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) las pone Supabase solo; no hay que configurar
nada.

---

## Qué cambia para ti

- Al entrar en Mi Panel por primera vez se crean 3 hábitos (Gimnasio, Leer
  20 min, Dormir 8 h). Como ya tienes módulos de la app vieja, **no** se crean
  módulos nuevos.
- Tu módulo FE (Formación en Empresa) queda marcado como "sin exámenes".
- Las semanas de clase que tenías en la app vieja pasan a una columna propia
  (`perfiles.semanas_curso`); si no las cambiaste, son 30.
- El tema por defecto para cuentas nuevas pasa a "auto" (según el sistema).
  Tu elección actual no cambia.
