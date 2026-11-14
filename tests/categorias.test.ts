// La lista de categorías de la app (lib/dinero.ts) tiene que ser la misma
// que la del `check` de la base de datos: si no, una categoría nueva solo en
// la app daría error al subir, y una solo en la base no se podría elegir.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATEGORIAS } from '../src/lib/dinero'

const sql = readFileSync(join(import.meta.dirname, '..', 'supabase', 'migrations', '20261114000100_categorias_y_fijos.sql'), 'utf8')

describe('categorías: app y base de datos', () => {
  it('movimientos y movimientos_fijos aceptan exactamente las categorías de la app', () => {
    const listas = [...sql.matchAll(/categoria in\s*\(([^)]*)\)/g)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))
    expect(listas).toHaveLength(2)
    for (const lista of listas) expect(lista).toEqual([...CATEGORIAS])
  })
})
