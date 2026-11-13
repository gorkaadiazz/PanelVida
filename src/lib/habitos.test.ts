import { describe, expect, it } from 'vitest'
import {
  ErrorDeValidacion,
  cuadricula,
  diasHechosPorHabito,
  habitosActivos,
  porcentajeHoy,
  rachaActual,
  resumenHoy,
  siguienteOrden,
  validarNombreHabito,
  type HabitoBasico,
  type MarcaBasica,
} from './habitos'

const HOY = '2026-11-13'

const habito = (id: string, orden: number, extra: Partial<HabitoBasico> = {}): HabitoBasico => ({
  id,
  nombre: id,
  orden,
  archivado: false,
  ...extra,
})
const marca = (habito_id: string, fecha: string, hecho = true): MarcaBasica => ({ habito_id, fecha, hecho })

describe('rachaActual', () => {
  it('sin marcas es 0', () => {
    expect(rachaActual([], HOY)).toBe(0)
  })

  it('cuenta los días seguidos acabando hoy', () => {
    expect(rachaActual(['2026-11-13'], HOY)).toBe(1)
    expect(rachaActual(['2026-11-11', '2026-11-12', '2026-11-13'], HOY)).toBe(3)
  })

  it('si hoy aún no está marcado, cuenta hasta ayer y no se rompe', () => {
    expect(rachaActual(['2026-11-10', '2026-11-11', '2026-11-12'], HOY)).toBe(3)
  })

  it('se rompe si ni hoy ni ayer están hechos', () => {
    expect(rachaActual(['2026-11-09', '2026-11-10', '2026-11-11'], HOY)).toBe(0)
  })

  it('un hueco corta la racha', () => {
    expect(rachaActual(['2026-11-08', '2026-11-09', '2026-11-11', '2026-11-12', '2026-11-13'], HOY)).toBe(3)
  })

  it('cruza meses, años y cambios de hora', () => {
    expect(rachaActual(['2026-12-30', '2026-12-31', '2027-01-01'], '2027-01-01')).toBe(3)
    expect(rachaActual(['2026-10-24', '2026-10-25', '2026-10-26'], '2026-10-26')).toBe(3)
    expect(rachaActual(['2026-03-28', '2026-03-29', '2026-03-30'], '2026-03-30')).toBe(3)
  })

  it('ignora días futuros y acepta un Set', () => {
    expect(rachaActual(new Set(['2026-11-13', '2026-11-14', '2026-11-15']), HOY)).toBe(1)
  })
})

describe('diasHechosPorHabito', () => {
  it('agrupa por hábito y descarta las marcas desmarcadas (hecho = false)', () => {
    const mapa = diasHechosPorHabito([marca('a', '2026-11-12'), marca('a', '2026-11-13', false), marca('b', '2026-11-13')])
    expect([...(mapa.get('a') ?? [])]).toEqual(['2026-11-12'])
    expect([...(mapa.get('b') ?? [])]).toEqual(['2026-11-13'])
  })
})

describe('habitosActivos y siguienteOrden', () => {
  it('quita los archivados y ordena por orden y nombre', () => {
    const lista = [habito('c', 2), habito('z', 1), habito('a', 1), habito('x', 0, { archivado: true })]
    expect(habitosActivos(lista).map((h) => h.id)).toEqual(['a', 'z', 'c'])
  })

  it('no modifica la lista original', () => {
    const lista = [habito('b', 1), habito('a', 0)]
    habitosActivos(lista)
    expect(lista.map((h) => h.id)).toEqual(['b', 'a'])
  })

  it('siguienteOrden va detrás del mayor (contando archivados)', () => {
    expect(siguienteOrden([])).toBe(0)
    expect(siguienteOrden([habito('a', 0), habito('b', 5, { archivado: true })])).toBe(6)
  })
})

describe('resumenHoy y porcentajeHoy', () => {
  const habitos = [habito('gim', 0), habito('leer', 1), habito('dormir', 2)]

  it('sin hábitos es 0/0 y 0 %', () => {
    expect(resumenHoy([], [], HOY)).toEqual({ hechos: 0, total: 0, porcentaje: 0 })
  })

  it('cuenta solo las marcas hechas de hoy', () => {
    const marcas = [marca('gim', HOY), marca('leer', '2026-11-12'), marca('dormir', HOY, false)]
    expect(resumenHoy(habitos, marcas, HOY)).toEqual({ hechos: 1, total: 3, porcentaje: 33 })
  })

  it('redondea el porcentaje', () => {
    expect(porcentajeHoy(habitos, [marca('gim', HOY), marca('leer', HOY)], HOY)).toBe(67)
    expect(porcentajeHoy(habitos, [marca('gim', HOY), marca('leer', HOY), marca('dormir', HOY)], HOY)).toBe(100)
  })

  it('no cuenta hábitos archivados ni marcas de hábitos que ya no existen', () => {
    const lista = [habito('gim', 0), habito('viejo', 1, { archivado: true })]
    const marcas = [marca('viejo', HOY), marca('borrado', HOY)]
    expect(resumenHoy(lista, marcas, HOY)).toEqual({ hechos: 0, total: 1, porcentaje: 0 })
  })
})

describe('cuadricula', () => {
  const habitos = [habito('leer', 1), habito('gim', 0), habito('viejo', 2, { archivado: true })]
  const marcas = [
    marca('gim', '2026-11-05'), // fuera de la semana, pero cuenta para la racha
    marca('gim', '2026-11-06'),
    marca('gim', '2026-11-07'),
    marca('gim', '2026-11-08'),
    marca('gim', '2026-11-09'),
    marca('gim', '2026-11-10'),
    marca('gim', '2026-11-11'),
    marca('gim', '2026-11-12'),
    marca('leer', '2026-11-13'),
    marca('leer', '2026-11-11'),
    marca('leer', '2026-11-12', false),
  ]

  it('tiene 7 columnas que acaban hoy', () => {
    const c = cuadricula(habitos, marcas, HOY)
    expect(c.dias).toHaveLength(7)
    expect(c.dias[0]).toBe('2026-11-07')
    expect(c.dias[6]).toBe(HOY)
  })

  it('una fila por hábito activo, en orden, con sus celdas y su racha', () => {
    const c = cuadricula(habitos, marcas, HOY)
    expect(c.filas.map((f) => f.habito.id)).toEqual(['gim', 'leer'])

    const gim = c.filas[0]
    expect(gim.dias.map((d) => d.hecho)).toEqual([true, true, true, true, true, true, false])
    expect(gim.racha).toBe(8) // hoy sin marcar: cuenta hasta ayer, incluidos días de fuera de la cuadrícula

    const leer = c.filas[1]
    expect(leer.dias.map((d) => d.hecho)).toEqual([false, false, false, false, true, false, true])
    expect(leer.racha).toBe(1)
  })

  it('marca cuál es la celda de hoy', () => {
    const c = cuadricula(habitos, marcas, HOY)
    expect(c.filas[0].dias.map((d) => d.esHoy)).toEqual([false, false, false, false, false, false, true])
  })

  it('incluye el resumen de hoy', () => {
    expect(cuadricula(habitos, marcas, HOY).resumen).toEqual({ hechos: 1, total: 2, porcentaje: 50 })
  })

  it('admite otro número de días', () => {
    expect(cuadricula(habitos, marcas, HOY, 3).dias).toEqual(['2026-11-11', '2026-11-12', '2026-11-13'])
  })
})

describe('validarNombreHabito', () => {
  it('recorta espacios', () => {
    expect(validarNombreHabito('  Leer   20 min ')).toBe('Leer 20 min')
  })

  it('rechaza vacío y más de 60 caracteres', () => {
    expect(() => validarNombreHabito('   ')).toThrow(ErrorDeValidacion)
    expect(() => validarNombreHabito('a'.repeat(61))).toThrow(ErrorDeValidacion)
    expect(validarNombreHabito('a'.repeat(60))).toHaveLength(60)
  })
})
