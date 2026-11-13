import { describe, expect, it } from 'vitest'
import {
  ErrorDeValidacion,
  ordenarTareas,
  recuentoTareas,
  textoFechaLimite,
  urgencia,
  validarFechaLimite,
  validarTextoTarea,
  type TareaBasica,
} from './tareas'

const HOY = '2026-11-13'

let contador = 0
function tarea(extra: Partial<TareaBasica> = {}): TareaBasica {
  contador += 1
  return {
    id: `t${String(contador).padStart(3, '0')}`,
    texto: 'Tarea',
    fecha_limite: null,
    hecha: false,
    hecha_en: null,
    created_at: '2026-11-01T10:00:00.000Z',
    ...extra,
  }
}

describe('urgencia', () => {
  it('atrasada si la fecha límite ya pasó', () => {
    expect(urgencia(tarea({ fecha_limite: '2026-11-12' }), HOY)).toBe('atrasada')
    expect(urgencia(tarea({ fecha_limite: '2025-12-31' }), HOY)).toBe('atrasada')
  })

  it('próxima si vence hoy o mañana', () => {
    expect(urgencia(tarea({ fecha_limite: '2026-11-13' }), HOY)).toBe('proxima')
    expect(urgencia(tarea({ fecha_limite: '2026-11-14' }), HOY)).toBe('proxima')
  })

  it('normal si vence pasado mañana o más tarde, o no tiene fecha', () => {
    expect(urgencia(tarea({ fecha_limite: '2026-11-15' }), HOY)).toBe('normal')
    expect(urgencia(tarea(), HOY)).toBe('normal')
  })

  it('una tarea hecha nunca es urgente', () => {
    expect(urgencia(tarea({ fecha_limite: '2026-11-01', hecha: true }), HOY)).toBe('normal')
    expect(urgencia(tarea({ fecha_limite: HOY, hecha: true }), HOY)).toBe('normal')
  })

  it('"mañana" cruza el fin de mes y de año', () => {
    expect(urgencia(tarea({ fecha_limite: '2026-12-01' }), '2026-11-30')).toBe('proxima')
    expect(urgencia(tarea({ fecha_limite: '2027-01-01' }), '2026-12-31')).toBe('proxima')
    expect(urgencia(tarea({ fecha_limite: '2027-01-02' }), '2026-12-31')).toBe('normal')
  })
})

describe('ordenarTareas', () => {
  it('pendientes por fecha límite, sin fecha al final, y las hechas después', () => {
    const sinFecha = tarea({ texto: 'sin fecha' })
    const lejana = tarea({ texto: 'lejana', fecha_limite: '2026-12-20' })
    const atrasada = tarea({ texto: 'atrasada', fecha_limite: '2026-11-01' })
    const hoy = tarea({ texto: 'hoy', fecha_limite: HOY })
    const hecha = tarea({ texto: 'hecha', fecha_limite: '2026-10-01', hecha: true, hecha_en: '2026-11-02T08:00:00Z' })

    const orden = ordenarTareas([sinFecha, hecha, lejana, hoy, atrasada]).map((t) => t.texto)
    expect(orden).toEqual(['atrasada', 'hoy', 'lejana', 'sin fecha', 'hecha'])
  })

  it('a igual fecha, la creada antes va primero', () => {
    const b = tarea({ texto: 'b', fecha_limite: HOY, created_at: '2026-11-02T10:00:00Z' })
    const a = tarea({ texto: 'a', fecha_limite: HOY, created_at: '2026-11-01T10:00:00Z' })
    const sinFechaNueva = tarea({ texto: 'd', created_at: '2026-11-05T10:00:00Z' })
    const sinFechaVieja = tarea({ texto: 'c', created_at: '2026-11-04T10:00:00Z' })
    expect(ordenarTareas([sinFechaNueva, b, sinFechaVieja, a]).map((t) => t.texto)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('las hechas van de la más reciente a la más antigua', () => {
    const vieja = tarea({ texto: 'vieja', hecha: true, hecha_en: '2026-11-01T08:00:00Z' })
    const nueva = tarea({ texto: 'nueva', hecha: true, hecha_en: '2026-11-12T08:00:00+00:00' })
    const sinDato = tarea({ texto: 'sin dato', hecha: true })
    expect(ordenarTareas([vieja, sinDato, nueva]).map((t) => t.texto)).toEqual(['nueva', 'vieja', 'sin dato'])
  })

  it('compara instantes, no texto (formatos ISO distintos)', () => {
    const a = tarea({ texto: 'a', created_at: '2026-11-01T10:00:00.000Z' })
    const b = tarea({ texto: 'b', created_at: '2026-11-01T11:30:00+02:00' }) // 09:30 UTC
    expect(ordenarTareas([a, b]).map((t) => t.texto)).toEqual(['b', 'a'])
  })

  it('no modifica la lista original', () => {
    const lista = [tarea({ fecha_limite: '2026-12-01' }), tarea({ fecha_limite: '2026-11-01' })]
    const copia = [...lista]
    ordenarTareas(lista)
    expect(lista).toEqual(copia)
  })
})

describe('recuentoTareas', () => {
  it('lista vacía', () => {
    expect(recuentoTareas([], HOY)).toEqual({ pendientes: 0, atrasadas: 0, proximas: 0, hechas: 0 })
  })

  it('cuenta pendientes, atrasadas, próximas y hechas', () => {
    const lista = [
      tarea(),
      tarea({ fecha_limite: '2026-11-10' }),
      tarea({ fecha_limite: '2026-11-12' }),
      tarea({ fecha_limite: HOY }),
      tarea({ fecha_limite: '2026-11-14' }),
      tarea({ fecha_limite: '2026-11-30' }),
      tarea({ fecha_limite: '2026-11-01', hecha: true }),
    ]
    expect(recuentoTareas(lista, HOY)).toEqual({ pendientes: 6, atrasadas: 2, proximas: 2, hechas: 1 })
  })
})

describe('validaciones', () => {
  it('validarTextoTarea recorta y limita a 200', () => {
    expect(validarTextoTarea('  Entregar   la práctica ')).toBe('Entregar la práctica')
    expect(() => validarTextoTarea(' ')).toThrow(ErrorDeValidacion)
    expect(() => validarTextoTarea('a'.repeat(201))).toThrow(ErrorDeValidacion)
    expect(validarTextoTarea('a'.repeat(200))).toHaveLength(200)
  })

  it('validarFechaLimite acepta vacío como "sin fecha" y rechaza fechas imposibles', () => {
    expect(validarFechaLimite('')).toBeNull()
    expect(validarFechaLimite(null)).toBeNull()
    expect(validarFechaLimite(undefined)).toBeNull()
    expect(validarFechaLimite('2026-11-13')).toBe('2026-11-13')
    expect(() => validarFechaLimite('2026-02-30')).toThrow(ErrorDeValidacion)
    expect(() => validarFechaLimite('13/11/2026')).toThrow(ErrorDeValidacion)
  })
})

describe('textoFechaLimite', () => {
  it('sin fecha', () => {
    expect(textoFechaLimite(null, HOY)).toBeNull()
  })
  it('días cercanos con palabras', () => {
    expect(textoFechaLimite('2026-11-13', HOY)).toBe('Hoy')
    expect(textoFechaLimite('2026-11-14', HOY)).toBe('Mañana')
    expect(textoFechaLimite('2026-11-12', HOY)).toBe('Ayer')
    expect(textoFechaLimite('2026-11-10', HOY)).toBe('Hace 3 días')
    expect(textoFechaLimite('2026-11-07', HOY)).toBe('Hace 6 días')
  })
  it('el resto, con la fecha en español', () => {
    expect(textoFechaLimite('2026-11-06', HOY)).toBe('06/11/2026')
    expect(textoFechaLimite('2026-11-15', HOY)).toBe('15/11/2026')
    expect(textoFechaLimite('2027-01-02', HOY)).toBe('02/01/2027')
  })
  it('cruza el cambio de año y de hora', () => {
    expect(textoFechaLimite('2027-01-01', '2026-12-31')).toBe('Mañana')
    expect(textoFechaLimite('2026-10-25', '2026-10-26')).toBe('Ayer')
  })
})

describe('casos límite añadidos por tester', () => {
  it('textoFechaLimite: el límite de "Hace N días" está en 6; con 7 sale la fecha', () => {
    expect(textoFechaLimite('2026-11-06', HOY)).toBe('06/11/2026')
    expect(textoFechaLimite('2026-11-11', HOY)).toBe('Hace 2 días')
  })

  it('textoFechaLimite: "Mañana" y "Ayer" en las noches de cambio de hora y de año', () => {
    expect(textoFechaLimite('2026-03-29', '2026-03-28')).toBe('Mañana')
    expect(textoFechaLimite('2026-03-29', '2026-03-30')).toBe('Ayer')
    expect(textoFechaLimite('2026-10-26', '2026-10-25')).toBe('Mañana')
    expect(textoFechaLimite('2026-12-31', '2027-01-01')).toBe('Ayer')
    expect(textoFechaLimite('2026-12-27', '2027-01-01')).toBe('Hace 5 días')
  })

  it('urgencia al cruzar el año: lo del 31/12 va atrasado el 1/1', () => {
    expect(urgencia(tarea({ fecha_limite: '2026-12-31' }), '2027-01-01')).toBe('atrasada')
  })

  it('ordenarTareas: todas sin fecha, por antigüedad; y una hecha sin fecha va tras las pendientes', () => {
    const b = tarea({ texto: 'b', created_at: '2026-11-03T10:00:00Z' })
    const a = tarea({ texto: 'a', created_at: '2026-11-02T10:00:00Z' })
    const h = tarea({ texto: 'h', hecha: true, hecha_en: '2026-11-13T10:00:00Z', created_at: '2026-11-01T10:00:00Z' })
    expect(ordenarTareas([h, b, a]).map((t) => t.texto)).toEqual(['a', 'b', 'h'])
  })

  it('ordenarTareas: la de fecha cruza bien el cambio de año (texto AAAA-MM-DD)', () => {
    const enero = tarea({ texto: 'enero', fecha_limite: '2027-01-02' })
    const diciembre = tarea({ texto: 'diciembre', fecha_limite: '2026-12-30' })
    expect(ordenarTareas([enero, diciembre]).map((t) => t.texto)).toEqual(['diciembre', 'enero'])
  })

  it('recuentoTareas: las tareas sin fecha cuentan como pendientes pero no como urgentes', () => {
    expect(recuentoTareas([tarea(), tarea()], HOY)).toEqual({ pendientes: 2, atrasadas: 0, proximas: 0, hechas: 0 })
  })
})
