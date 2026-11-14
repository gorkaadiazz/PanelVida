// Casos límite de los fijos con frecuencia: semanas que cruzan mes y año,
// 29 de febrero, pausas, cambios de frecuencia, importes grandes y filas
// antiguas de IndexedDB sin las columnas nuevas.
import { describe, expect, it } from 'vitest'
import { IMPORTE_MAX_CENTIMOS } from './dinero'
import {
  apuntesPendientes,
  DESDE_NUNCA,
  equivalencias,
  IMPORTE_MAX_DIARIO,
  idApunteFijo,
  MAX_ANIOS_PENDIENTES,
  normalizarFijo,
  proximoApunte,
  totalFijoMensual,
  type FijoBasico,
} from './fijos'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const fijo = (c: Partial<FijoBasico> = {}): FijoBasico => ({
  id: ID,
  dia: 5,
  desde: DESDE_NUNCA,
  ultimo_mes: null,
  activo: true,
  frecuencia: 'mensual',
  mes: null,
  inicio: '2026-11-01',
  ultimo_apunte: null,
  ...c,
})
const fechas = (f: FijoBasico, hoy: string) => apuntesPendientes(f, hoy).map((a) => a.fecha)

describe('semanas que cruzan mes y año', () => {
  it('semanal: la semana del 28/12/2026 se apunta el viernes 1/1/2027, con su lunes como periodo', () => {
    const f = fijo({ frecuencia: 'semanal', dia: 5, inicio: '2026-12-28' })
    expect(apuntesPendientes(f, '2027-01-01')).toEqual([{ periodo: '2026-12-28', fecha: '2027-01-01', veces: 1 }])
    // Después de apuntarla no se repite en la semana siguiente del año nuevo
    expect(fechas({ ...f, ultimo_apunte: '2027-01-01' }, '2027-01-07')).toEqual([])
    expect(fechas({ ...f, ultimo_apunte: '2027-01-01' }, '2027-01-08')).toEqual(['2027-01-08'])
  })

  it('diaria: empieza el miércoles 30/12 y el domingo 3/1/2027 se apuntan 5 días', () => {
    const f = fijo({ frecuencia: 'diaria', dia: 7, inicio: '2026-12-30' })
    expect(apuntesPendientes(f, '2027-01-03')).toEqual([{ periodo: '2026-12-28', fecha: '2027-01-03', veces: 5 }])
  })

  it('diaria: una semana que cruza de mes cuenta sus 7 días', () => {
    const f = fijo({ frecuencia: 'diaria', dia: 7, inicio: '2026-11-30' })
    expect(apuntesPendientes(f, '2026-12-06')).toEqual([{ periodo: '2026-11-30', fecha: '2026-12-06', veces: 7 }])
  })

  it('diaria: si empieza un domingo, ese mismo domingo se apunta 1 día', () => {
    const f = fijo({ frecuencia: 'diaria', dia: 7, inicio: '2026-11-15' })
    expect(apuntesPendientes(f, '2026-11-15')).toEqual([{ periodo: '2026-11-09', fecha: '2026-11-15', veces: 1 }])
    expect(proximoApunte(f, '2026-11-15')).toBe('2026-11-15')
  })

  it('mensual: de diciembre a enero sin saltarse ni repetir', () => {
    const f = fijo({ dia: 31, inicio: '2026-12-01', ultimo_apunte: '2026-11-30' })
    expect(fechas(f, '2027-01-31')).toEqual(['2026-12-31', '2027-01-31'])
  })
})

describe('29 de febrero', () => {
  it('mensual el día 31: en febrero cae el 28 o el 29 si es bisiesto', () => {
    const f = fijo({ dia: 31, inicio: '2027-12-01' })
    expect(fechas(f, '2028-03-31')).toEqual(['2027-12-31', '2028-01-31', '2028-02-29', '2028-03-31'])
  })

  it('anual el 29/2: 2027 el 28, 2028 el 29 y no se repite el mismo año', () => {
    const f = fijo({ frecuencia: 'anual', dia: 29, mes: 2, inicio: '2026-11-14' })
    expect(fechas(f, '2027-02-28')).toEqual(['2027-02-28'])
    const apuntado = { ...f, ultimo_apunte: '2027-02-28' }
    expect(fechas(apuntado, '2028-02-28')).toEqual([])
    expect(fechas(apuntado, '2028-02-29')).toEqual(['2028-02-29'])
    expect(proximoApunte(apuntado, '2027-03-01')).toBe('2028-02-29')
  })

  it('anual: después de muchos años sin abrir la app, como mucho los 2 últimos', () => {
    const f = fijo({ frecuencia: 'anual', dia: 1, mes: 3, inicio: '2020-01-01', ultimo_apunte: '2020-03-01' })
    expect(fechas(f, '2026-11-14')).toHaveLength(MAX_ANIOS_PENDIENTES)
    expect(fechas(f, '2026-11-14')).toEqual(['2025-03-01', '2026-03-01'])
  })

  it('semanal y diaria con el 29/2 en medio de la semana', () => {
    const diaria = fijo({ frecuencia: 'diaria', dia: 7, inicio: '2028-02-28' }) // lunes
    expect(apuntesPendientes(diaria, '2028-03-05')).toEqual([{ periodo: '2028-02-28', fecha: '2028-03-05', veces: 7 }])
    const semanal = fijo({ frecuencia: 'semanal', dia: 2, inicio: '2028-02-28' }) // martes
    expect(fechas(semanal, '2028-03-05')).toEqual(['2028-02-29'])
  })
})

describe('pausados y reanudados', () => {
  it('en pausa no apunta nada ni tiene próximo apunte, aunque haya semanas atrasadas', () => {
    const f = fijo({ frecuencia: 'semanal', dia: 1, inicio: '2026-01-05', activo: false })
    expect(apuntesPendientes(f, '2026-11-14')).toEqual([])
    expect(proximoApunte(f, '2026-11-14')).toBeNull()
  })

  it('diaria reanudada a mitad de semana: el domingo cuenta solo desde el día en que se reanudó', () => {
    // Estuvo activa del lunes 2 al domingo 8 (ya apuntado); en pausa hasta el jueves 12
    const f = fijo({ frecuencia: 'diaria', dia: 7, inicio: '2026-11-12', ultimo_apunte: '2026-11-08' })
    expect(apuntesPendientes(f, '2026-11-15')).toEqual([{ periodo: '2026-11-09', fecha: '2026-11-15', veces: 4 }])
  })
})

describe('cambiar la frecuencia (lo que hace editarFijo: inicio = hoy, ultimo_apunte = null)', () => {
  it('de semanal a mensual el día 12 con día 20: el del 20 de este mes sí se apunta', () => {
    const f = fijo({ frecuencia: 'mensual', dia: 20, inicio: '2026-11-12', ultimo_apunte: null })
    expect(fechas(f, '2026-11-20')).toEqual(['2026-11-20'])
  })

  it('de semanal a anual el 12/11 con el 1 de diciembre: se apunta el 1/12/2026, no un año después', () => {
    const f = fijo({ frecuencia: 'anual', dia: 1, mes: 12, inicio: '2026-11-12', ultimo_apunte: null })
    expect(proximoApunte(f, '2026-11-12')).toBe('2026-12-01')
    expect(fechas(f, '2026-12-01')).toEqual(['2026-12-01'])
  })

  it('de mensual a diaria a mitad de semana: el domingo cuenta los días desde el cambio', () => {
    const f = fijo({ frecuencia: 'diaria', dia: 7, inicio: '2026-11-12', ultimo_apunte: null })
    expect(apuntesPendientes(f, '2026-11-15')).toEqual([{ periodo: '2026-11-09', fecha: '2026-11-15', veces: 4 }])
  })

  it('los ids de cada frecuencia no chocan entre sí en el mismo periodo', () => {
    const ids = new Set([
      idApunteFijo(ID, '2026-11', 'mensual'),
      idApunteFijo(ID, '2026', 'anual'),
      idApunteFijo(ID, '2026-11-09', 'semanal'),
      idApunteFijo(ID, '2026-11-09', 'diaria'),
    ])
    expect(ids.size).toBe(4)
  })
})

describe('filas antiguas (IndexedDB de antes de la migración)', () => {
  it('sin ninguna columna nueva: mensual desde `desde`, sigue después de `ultimo_mes`', () => {
    const antigua = { id: ID, dia: 31, desde: '2026-09', ultimo_mes: '2026-10', activo: true } as FijoBasico
    expect(normalizarFijo(antigua)).toEqual({ id: ID, frecuencia: 'mensual', dia: 31, mes: null, inicio: '2026-09-01', ultimo_apunte: '2026-10-31', activo: true })
    expect(apuntesPendientes(antigua, '2026-11-29')).toEqual([])
    expect(apuntesPendientes(antigua, '2026-11-30')).toEqual([{ periodo: '2026-11', fecha: '2026-11-30', veces: 1 }])
    // El id del apunte es el de siempre (fijo:AAAA-MM): no duplica lo que apuntó la app antigua
    expect(idApunteFijo(ID, '2026-11')).toBe(idApunteFijo(ID, '2026-11', 'mensual'))
  })

  it('sin columnas nuevas y nunca apuntado: empieza en `desde`', () => {
    const antigua = { id: ID, dia: 3, desde: '2026-10', ultimo_mes: null, activo: true } as FijoBasico
    expect(apuntesPendientes(antigua, '2026-11-14').map((a) => a.fecha)).toEqual(['2026-10-03', '2026-11-03'])
  })

  it('frecuencia null o desconocida se lee como mensual; un anual sin mes, como enero', () => {
    expect(normalizarFijo(fijo({ frecuencia: null })).frecuencia).toBe('mensual')
    expect(normalizarFijo(fijo({ frecuencia: 'quincenal' })).frecuencia).toBe('mensual')
    expect(normalizarFijo(fijo({ frecuencia: 'anual', mes: null })).mes).toBe(1)
  })

  it('total mensual con filas antiguas (sin frecuencia) las cuenta como mensuales', () => {
    expect(totalFijoMensual([{ tipo: 'gasto', importe_centimos: 999, activo: true }])).toBe(999)
  })
})

describe('importes grandes', () => {
  it('el diario máximo × 7 cabe en el máximo de un movimiento', () => {
    expect(IMPORTE_MAX_DIARIO * 7).toBeLessThanOrEqual(IMPORTE_MAX_CENTIMOS)
  })

  it('las equivalencias del máximo siguen siendo enteros exactos', () => {
    for (const [importe, frecuencia] of [
      [IMPORTE_MAX_DIARIO, 'diaria'],
      [IMPORTE_MAX_CENTIMOS, 'semanal'],
      [IMPORTE_MAX_CENTIMOS, 'mensual'],
      [IMPORTE_MAX_CENTIMOS, 'anual'],
    ] as const) {
      const e = equivalencias(importe, frecuencia)
      for (const v of Object.values(e)) expect(Number.isSafeInteger(v)).toBe(true)
    }
    expect(equivalencias(IMPORTE_MAX_CENTIMOS, 'mensual').anio).toBe(IMPORTE_MAX_CENTIMOS * 12)
  })

  it('1 céntimo al día redondea a 0 al día pero no al mes ni al año', () => {
    expect(equivalencias(1, 'diaria')).toEqual({ dia: 1, semana: 7, mes: 30, anio: 365 })
    expect(equivalencias(1, 'anual')).toEqual({ dia: 0, semana: 0, mes: 0, anio: 1 })
  })
})
