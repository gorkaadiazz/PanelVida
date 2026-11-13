# Mi Panel

Panel de vida personal: hábitos, tareas, dinero y negocio de páginas web. Los estudios de 2º SMR se llevan en la web de exámenes, que usa la misma cuenta; Mi Panel enlaza a ella y enseña el próximo examen en Inicio.
Se instala como app (PWA) en Android y en el PC, y los datos se sincronizan entre dispositivos con Supabase. Es multiusuario: cada persona ve solo sus datos.

> Estado: **en construcción** (fase 3 de 7). Las convenciones del proyecto están en [CLAUDE.md](CLAUDE.md).

## Requisitos
- Node.js 20 o superior y npm.
- Acceso al proyecto de Supabase (es el mismo que usaba la app anterior, `Examenes-2SMR`).

## Puesta en marcha en local
```bash
npm install
cp .env.example .env.local   # y rellena la URL y la clave pública de Supabase
npm run dev                  # http://localhost:5173
```
Para que el login con Google funcione en local, sigue [docs/SUPABASE.md](docs/SUPABASE.md).

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test -- --run` | Tests de la lógica (Vitest) |
| `npm run lint` | Revisión del código (oxlint) |
| `npm run build` | Comprueba los tipos y compila en `dist/` |
| `npm run preview` | Sirve la versión compilada (para probar la PWA) |
| `npm run test:sql` | Migraciones + test de RLS en un Postgres temporal |

## Seguridad
- En el frontend solo van la URL y la clave **pública** (anon/publishable) de Supabase. La seguridad la ponen las políticas **RLS** de `supabase/migrations/`.
- La service role solo existe como **secretos de Supabase**. Nunca van en este repositorio ni en `.env.local`.
- `.env.local` está en `.gitignore`.

## Estructura
Mira la sección «Estructura» de [CLAUDE.md](CLAUDE.md).
