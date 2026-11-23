// Las rutas de App.tsx: cada pantalla del menú existe para la cuenta normal, y
// la app de la familia («solo lista») solo tiene la lista y su cuenta.
// (Se lee el código: un fallo así ya pasó, con Mando y Red metidos en la de la familia.)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = join(import.meta.dirname, '..')
const app = readFileSync(join(RAIZ, 'src', 'App.tsx'), 'utf8')
const familia = app.slice(app.indexOf('<LayoutFamilia />'), app.indexOf('</Routes>', app.indexOf('<LayoutFamilia />')))
const normal = app.slice(app.indexOf('<Layout />'))
const rutas = (bloque: string) => [...bloque.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1])

describe('rutas de la app', () => {
  it('la familia solo tiene la lista, su cuenta y la redirección', () => {
    expect(rutas(familia).sort()).toEqual(['*', 'compra', 'cuenta'])
  })

  it('todo lo que enlazan Más y la barra lateral existe para la cuenta normal', () => {
    const enlaces = new Set<string>()
    for (const archivo of ['src/pages/Mas.tsx', 'src/components/Layout.tsx']) {
      const codigo = readFileSync(join(RAIZ, archivo), 'utf8')
      for (const m of codigo.matchAll(/ruta: '\/([^']+)'/g)) enlaces.add(m[1])
    }
    const existentes = new Set(rutas(normal))
    const faltan = [...enlaces].filter((r) => !existentes.has(r))
    expect(faltan).toEqual([])
    expect(existentes.has('casa/mando') && existentes.has('casa/red') && existentes.has('casa/puente')).toBe(true)
  })
})
