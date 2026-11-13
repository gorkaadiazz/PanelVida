import { describe, expect, it } from 'vitest'
import {
  claveCola,
  datosDeError,
  decidirDescarga,
  desdeConMargen,
  esErrorDeDatos,
  esErrorDeRed,
  esLaMismaVersion,
  limpiarFila,
  masReciente,
  planDeSubida,
  trocear,
  type EntradaCola,
} from './reglas'
import { TABLAS, definicion, esTabla, hijasDe, indicesDe, type DefTabla } from './tablas'

let n = 0
function entrada(tabla: string, op: 'upsert' | 'delete', id: string, fecha?: string): EntradaCola {
  n += 1
  return { clave: claveCola(tabla, id), tabla, op, id, fecha: fecha ?? `2026-11-13T10:00:${String(n).padStart(2, '0')}.000Z`, rev: `r${n}` }
}

describe('tablas declaradas', () => {
  it('los padres van antes que sus hijas', () => {
    const nombres = TABLAS.map((t) => t.nombre as string)
    for (const t of TABLAS as readonly DefTabla[]) {
      if (t.padre) expect(nombres.indexOf(t.padre.tabla)).toBeLessThan(nombres.indexOf(t.nombre))
    }
  })

  it('ninguna tabla sube user_id ni sync_at (los pone el servidor)', () => {
    for (const t of TABLAS) {
      expect(t.columnas).not.toContain('user_id')
      expect(t.columnas).not.toContain('sync_at')
    }
  })

  it('hijasDe, indicesDe, esTabla y definicion', () => {
    expect(hijasDe('habitos')).toEqual([{ tabla: 'habito_marcas', columna: 'habito_id' }])
    expect(hijasDe('tareas')).toEqual([])
    expect(indicesDe(definicion('habito_marcas'))).toEqual(['habito_id', 'fecha'])
    expect(indicesDe({ nombre: 'x', columnas: [], padre: { tabla: 'y', columna: 'y_id' } })).toEqual(['y_id'])
    expect(esTabla('tareas')).toBe(true)
    expect(esTabla('borrados')).toBe(false)
    expect(() => definicion('no_existe')).toThrow()
  })
})

describe('limpiarFila', () => {
  it('deja solo las columnas que se suben', () => {
    const fila = {
      id: 'a',
      user_id: 'OTRO-USUARIO',
      texto: 'Hola',
      fecha_limite: null,
      hecha: false,
      hecha_en: null,
      created_at: 'c',
      updated_at: 'u',
      sync_at: 's',
      inventada: 1,
    }
    expect(limpiarFila(definicion('tareas'), fila)).toEqual({
      id: 'a',
      created_at: 'c',
      updated_at: 'u',
      texto: 'Hola',
      fecha_limite: null,
      hecha: false,
      hecha_en: null,
    })
  })

  it('conserva los null y omite lo que no está definido', () => {
    expect(limpiarFila(definicion('habitos'), { id: 'a', nombre: 'Leer', orden: undefined })).toEqual({ id: 'a', nombre: 'Leer' })
  })
})

describe('planDeSubida', () => {
  it('guarda padres antes que hijas y borra hijas antes que padres', () => {
    const cola = [
      entrada('habito_marcas', 'upsert', 'm1'),
      entrada('tareas', 'delete', 't1'),
      entrada('habitos', 'delete', 'h2'),
      entrada('habitos', 'upsert', 'h1'),
      entrada('habito_marcas', 'delete', 'm2'),
      entrada('tareas', 'upsert', 't2'),
    ]
    const plan = planDeSubida(cola, TABLAS)
    expect(plan.guardar.map((l) => [l.tabla, l.entradas.map((e) => e.id)])).toEqual([
      ['habitos', ['h1']],
      ['habito_marcas', ['m1']],
      ['tareas', ['t2']],
    ])
    expect(plan.borrar.map((l) => [l.tabla, l.entradas.map((e) => e.id)])).toEqual([
      ['tareas', ['t1']],
      ['habito_marcas', ['m2']],
      ['habitos', ['h2']],
    ])
    expect(plan.descartar).toEqual([])
  })

  it('dentro de una tabla, del cambio más antiguo al más nuevo', () => {
    const cola = [
      entrada('tareas', 'upsert', 'c', '2026-11-13T12:00:00.000Z'),
      entrada('tareas', 'upsert', 'a', '2026-11-13T10:00:00.000Z'),
      entrada('tareas', 'upsert', 'b', '2026-11-13T11:00:00.000Z'),
    ]
    expect(planDeSubida(cola, TABLAS).guardar[0].entradas.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('parte los lotes grandes en trozos', () => {
    const cola = Array.from({ length: 5 }, (_, i) => entrada('tareas', 'upsert', `t${i}`))
    expect(planDeSubida(cola, TABLAS, 2).guardar.map((l) => l.entradas.length)).toEqual([2, 2, 1])
  })

  it('descarta las tablas desconocidas y las de solo lectura', () => {
    const tablas: DefTabla[] = [
      { nombre: 'tareas', columnas: [] },
      { nombre: 'uso_ia', columnas: [], soloLectura: true },
    ]
    const cola = [entrada('uso_ia', 'upsert', 'x'), entrada('fantasma', 'delete', 'y'), entrada('tareas', 'upsert', 'z')]
    const plan = planDeSubida(cola, tablas)
    expect(plan.descartar.map((e) => e.tabla).sort()).toEqual(['fantasma', 'uso_ia'])
    expect(plan.guardar).toHaveLength(1)
    expect(plan.borrar).toEqual([])
  })

  it('cola vacía', () => {
    expect(planDeSubida([], TABLAS)).toEqual({ guardar: [], borrar: [], descartar: [] })
  })

  it('trocear', () => {
    expect(trocear([1, 2, 3], 2)).toEqual([[1, 2], [3]])
    expect(trocear([], 2)).toEqual([])
  })
})

describe('decidirDescarga', () => {
  const vieja = { updated_at: '2026-11-13T10:00:00.000Z' }
  const nueva = { updated_at: '2026-11-13T11:00:00+00:00' }

  it('sin cambio local pendiente manda el servidor (aunque su fecha sea más antigua)', () => {
    expect(decidirDescarga(undefined, undefined, vieja)).toBe('aplicar')
    expect(decidirDescarga(nueva, undefined, vieja)).toBe('aplicar')
  })

  it('si aquí se borró, se ignora lo que llega (se subirá el borrado)', () => {
    expect(decidirDescarga(undefined, { op: 'delete' }, nueva)).toBe('ignorar')
  })

  it('si los dos han cambiado, gana el updated_at más reciente', () => {
    expect(decidirDescarga(vieja, { op: 'upsert' }, nueva)).toBe('aplicar')
    expect(decidirDescarga(nueva, { op: 'upsert' }, vieja)).toBe('ignorar')
  })

  it('en un empate se queda el cambio local', () => {
    expect(decidirDescarga(vieja, { op: 'upsert' }, { updated_at: '2026-11-13T11:00:00+01:00' })).toBe('ignorar')
  })

  it('compara instantes, no texto', () => {
    // 12:30+02:00 son las 10:30 UTC: anterior a las 11:00 UTC aunque "12" > "11"
    expect(decidirDescarga(nueva, { op: 'upsert' }, { updated_at: '2026-11-13T12:30:00+02:00' })).toBe('ignorar')
  })

  it('pendiente de guardar pero sin fila local: se aplica', () => {
    expect(decidirDescarga(undefined, { op: 'upsert' }, vieja)).toBe('aplicar')
  })
})

describe('esLaMismaVersion', () => {
  const remota = { updated_at: '2026-11-13T10:00:00+00:00', sync_at: '2026-11-13T10:00:01+00:00' }

  it('compara updated_at y sync_at como instantes', () => {
    expect(esLaMismaVersion({ updated_at: '2026-11-13T10:00:00.000Z', sync_at: '2026-11-13T10:00:01.000Z' }, remota)).toBe(true)
    expect(esLaMismaVersion({ updated_at: '2026-11-13T10:00:00.000Z', sync_at: '2026-11-13T10:00:02.000Z' }, remota)).toBe(false)
  })

  it('una fila que aún no ha pasado por el servidor nunca es la misma versión', () => {
    expect(esLaMismaVersion({ updated_at: '2026-11-13T10:00:00.000Z' }, remota)).toBe(false)
    expect(esLaMismaVersion(undefined, remota)).toBe(false)
  })
})

describe('marcas de tiempo de la descarga', () => {
  it('masReciente', () => {
    expect(masReciente(null, null)).toBeNull()
    expect(masReciente(null, 'a')).toBe('a')
    expect(masReciente('2026-11-13T10:00:00Z', undefined)).toBe('2026-11-13T10:00:00Z')
    expect(masReciente('2026-11-13T10:00:00Z', '2026-11-13T09:00:00Z')).toBe('2026-11-13T10:00:00Z')
    expect(masReciente('2026-11-13T10:00:00Z', '2026-11-13T12:30:00+02:00')).toBe('2026-11-13T12:30:00+02:00')
  })

  it('desdeConMargen resta un minuto; sin descarga previa pide todo', () => {
    expect(desdeConMargen(null)).toBeNull()
    expect(desdeConMargen('2026-11-13T10:00:30.000Z')).toBe('2026-11-13T09:59:30.000Z')
    expect(desdeConMargen('2026-11-13T10:00:30+00:00', 0)).toBe('2026-11-13T10:00:30.000Z')
    expect(desdeConMargen('basura')).toBeNull()
  })
})

describe('clasificación de errores', () => {
  it('errores de red', () => {
    expect(esErrorDeRed(new TypeError('Failed to fetch'))).toBe(true)
    expect(esErrorDeRed({ message: 'TypeError: NetworkError when attempting to fetch resource.' })).toBe(true)
    expect(esErrorDeRed({ message: 'Load failed' })).toBe(true)
    expect(esErrorDeRed({ message: '', details: 'TypeError: fetch failed' })).toBe(true)
    expect(esErrorDeRed({ message: 'Failed to fetch', code: '23505' })).toBe(false)
    expect(esErrorDeRed({ message: 'JWT expired', code: 'PGRST301' })).toBe(false)
    expect(esErrorDeRed(null)).toBe(false)
  })

  it('errores de datos: restricciones, tipos y RLS sobre la fila', () => {
    expect(esErrorDeDatos({ code: '23514', message: 'check constraint' })).toBe(true)
    expect(esErrorDeDatos({ code: '23503', message: 'foreign key' })).toBe(true)
    expect(esErrorDeDatos({ code: '22P02', message: 'invalid input syntax for type uuid' })).toBe(true)
    expect(esErrorDeDatos({ code: '42501', message: 'new row violates row-level security policy for table "tareas"' })).toBe(true)
  })

  it('NO son errores de datos: sin permiso sobre la tabla (sesión perdida), JWT caducado, 500, red', () => {
    expect(esErrorDeDatos({ code: '42501', message: 'permission denied for table tareas' })).toBe(false)
    expect(esErrorDeDatos({ code: 'PGRST301', message: 'JWT expired' })).toBe(false)
    expect(esErrorDeDatos({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
    expect(esErrorDeDatos(new TypeError('Failed to fetch'))).toBe(false)
    expect(esErrorDeDatos(undefined)).toBe(false)
  })

  it('datosDeError tolera cualquier cosa', () => {
    expect(datosDeError('texto')).toEqual({ message: 'texto' })
    expect(datosDeError(42)).toEqual({ message: undefined })
    expect(datosDeError({ message: 1, code: '', status: 500 })).toEqual({ message: undefined, code: undefined, details: undefined, status: 500 })
  })
})
