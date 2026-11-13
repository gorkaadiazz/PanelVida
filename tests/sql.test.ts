// Banco de pruebas SQL: migraciones + RLS en un Postgres de verdad (PGlite,
// Postgres compilado a WASM) dentro de Node. Sin Docker ni binarios.
//
//   npm run test:sql
//
// 1. Arranca una PGlite en memoria.
// 2. Carga tests/supabase-simulado.sql (roles anon/authenticated/service_role,
//    auth.uid() leyendo request.jwt.claims, esquemas auth y storage).
// 3. Aplica en orden TODAS las migraciones de supabase/migrations/*.sql
//    (las nuevas se recogen solas).
// 4. Ejecuta tests/rls.sql entero (como en el SQL Editor de Supabase).
// 5. Ejecuta cada `-- @caso:` de tests/rls-*.sql como un test independiente:
//    preámbulo del archivo + caso, dentro de una transacción que se deshace.
//
// Alternativa con Postgres instalado: bash tests/probar-sql.sh
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const RAIZ = join(import.meta.dirname, '..')
const DIR_MIGRACIONES = join(RAIZ, 'supabase', 'migrations')
const DIR_TESTS = join(RAIZ, 'tests')

const leer = (ruta: string) => readFileSync(ruta, 'utf8')
const migraciones = readdirSync(DIR_MIGRACIONES).filter((f) => f.endsWith('.sql')).sort()
const archivosCasos = readdirSync(DIR_TESTS).filter((f) => /^rls-.+\.sql$/.test(f)).sort()

// Casos que se sabe que fallan con el esquema actual (bug pendiente de una
// migración). `it.fails` hace que el test pase MIENTRAS falle: cuando se
// arregle, Vitest avisará y habrá que quitarlo de aquí.
const CASOS_QUE_FALLAN = new Set<string>([])

interface Caso {
  nombre: string
  sql: string
}

// Separa un archivo en preámbulo y casos (`-- @caso: nombre` … `-- @fin`).
function partirEnCasos(sql: string): { preambulo: string; casos: Caso[] } {
  const sinFinal = sql.split(/^-- @fin\b.*$/m)[0]
  const trozos = sinFinal.split(/^-- @caso:\s*(.+)$/m)
  const casos: Caso[] = []
  for (let i = 1; i < trozos.length; i += 2) {
    casos.push({ nombre: trozos[i].trim(), sql: trozos[i + 1] })
  }
  return { preambulo: trozos[0], casos }
}

let db: PGlite
const avisos: string[] = []
const recogerAvisos = { onNotice: (n: { message?: string }) => void avisos.push(n.message ?? '') }

// Ejecuta SQL que abre su propia transacción. Si falla, la deshace para que la
// base quede limpia para el siguiente caso, y relanza el error con su texto.
async function ejecutarEnTransaccion(sql: string): Promise<void> {
  try {
    await db.exec(sql, recogerAvisos)
  } catch (error) {
    await db.exec('rollback')
    throw new Error((error as Error).message, { cause: error })
  }
}

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(leer(join(DIR_TESTS, 'supabase-simulado.sql')))
})

afterAll(async () => {
  await db?.close()
})

describe('migraciones', () => {
  it.each(migraciones)('se aplica %s', async (archivo) => {
    await db.exec(leer(join(DIR_MIGRACIONES, archivo)))
  })
})

describe('tests/rls.sql', () => {
  it('pasa entero (A y B aislados, anon sin acceso, borrados, uso_ia)', async () => {
    avisos.length = 0
    await ejecutarEnTransaccion(leer(join(DIR_TESTS, 'rls.sql')))
    expect(avisos.some((a) => a.startsWith('RLS OK'))).toBe(true)
  })
})

for (const archivo of archivosCasos) {
  const { preambulo, casos } = partirEnCasos(leer(join(DIR_TESTS, archivo)))
  describe(`tests/${archivo}`, () => {
    for (const caso of casos) {
      const prueba = CASOS_QUE_FALLAN.has(caso.nombre) ? it.fails : it
      prueba(caso.nombre, async () => {
        await ejecutarEnTransaccion(`${preambulo}\n${caso.sql}\nrollback;`)
      })
    }
  })
}
