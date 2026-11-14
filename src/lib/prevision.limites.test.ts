// Casos límite de la previsión y de la revisión: cambio de año, 29 de
// febrero, ritmo cero o negativo, datos justos, fijos en pausa e importes grandes.
import { describe, expect, it } from 'vitest'
import { IMPORTE_MAX_CENTIMOS } from './dinero'
import { idApunteFijo } from './fijos'
import {
  cuandoLlego,
  DIAS_MIN_DATOS,
  impactoEnMeta,
  lineaMeta,
  ritmoAhorro,
  saldoDentroDe,
  serieProyeccion,
  serieReal,
  sumarMesesAFecha,
  textoLlegada,
  type FijoPrevision,
  type MovimientoPrevision,
} from './prevision'
import { calcularRevision, periodoAnterior, periodoTerminado, type FijoRevision, type MovimientoRevision } from './revision'

const FIJO = '0f8fad5b-d9cb-469f-a165-70867728950e'
let n = 0
const mov = (fecha: string, importe: number, tipo = 'gasto', c: Partial<MovimientoPrevision> = {}): MovimientoPrevision => ({ id: `m${++n}`, tipo, importe_centimos: importe, fecha, ...c })
const fijo = (importe: number, c: Partial<FijoPrevision> = {}): FijoPrevision => ({ id: FIJO, tipo: 'gasto', importe_centimos: importe, frecuencia: 'mensual', activo: true, ...c })

describe('ventana del ritmo', () => {
  it('cruza el cambio de año: 3 meses hasta el 15/1/2027 empiezan el 16/10/2026', () => {
    const r = ritmoAhorro([mov('2026-10-15', 99999, 'ingreso'), mov('2026-10-16', 9200, 'ingreso'), mov('2027-01-15', 0)], [], 3, '2027-01-15')
    expect(r.desde).toBe('2026-10-16')
    expect(r.dias).toBe(92)
    expect(r.variable).toBe(Math.round((9200 * 365) / (12 * 92)))
  })

  it('el 29/2/2028 con ventana de 1 mes empieza el 30/1', () => {
    expect(sumarMesesAFecha('2028-02-29', -12)).toBe('2027-02-28')
    const r = ritmoAhorro([mov('2027-12-01', 1)], [], 1, '2028-02-29')
    expect(r.desde).toBe('2028-01-30')
  })

  it('justo 30 días de datos ya no avisa; 29, sí', () => {
    expect(ritmoAhorro([mov('2026-10-18', 100)], [], 3, '2026-11-16').dias).toBe(DIAS_MIN_DATOS)
    expect(ritmoAhorro([mov('2026-10-18', 100)], [], 3, '2026-11-16').aviso).toBeNull()
    expect(ritmoAhorro([mov('2026-10-19', 100)], [], 3, '2026-11-16').aviso).toBe('pocos_datos')
  })

  it('un solo día de datos: usa lo que hay y avisa', () => {
    const r = ritmoAhorro([mov('2026-11-16', 1000, 'ingreso')], [], 3, '2026-11-16')
    expect(r).toMatchObject({ dias: 1, aviso: 'pocos_datos' })
    expect(r.variable).toBe(Math.round((1000 * 365) / 12))
  })

  it('los movimientos con fecha futura no cuentan (ni para el primer día)', () => {
    const r = ritmoAhorro([mov('2026-12-01', 50000, 'ingreso')], [], 3, '2026-11-16')
    expect(r.aviso).toBe('sin_datos')
    expect(r.mensual).toBe(0)
  })

  it('un fijo en pausa no resta, y sus apuntes tampoco entran en la media', () => {
    const apunte = mov('2026-11-05', 3000, 'gasto', { id: idApunteFijo(FIJO, '2026-11') })
    const r = ritmoAhorro([mov('2026-08-17', 0), apunte], [fijo(3000, { activo: false })], 3, '2026-11-16')
    expect(r).toMatchObject({ variable: 0, fijos: 0, mensual: 0 })
  })

  it('fijos de todas las frecuencias en su equivalente al mes', () => {
    const r = ritmoAhorro([], [fijo(150, { frecuencia: 'diaria' }), fijo(2000, { frecuencia: 'semanal' }), fijo(12000, { frecuencia: 'anual' }), fijo(100000, { tipo: 'ingreso' })], 3, '2026-11-16')
    expect(r.fijos).toBe(100000 - 4563 - 8690 - 1000)
  })
})

describe('ritmo cero o negativo', () => {
  it('cero: no llega, sin fecha, y lo necesario al mes redondeado hacia arriba', () => {
    const l = cuandoLlego(0, 1000, 0, '2026-11-16')
    expect(l).toEqual({
      estado: 'no_llega',
      motivo: 'ritmo',
      falta: 1000,
      necesario: [
        { meses: 3, alMes: 334 },
        { meses: 6, alMes: 167 },
        { meses: 12, alMes: 84 },
      ],
    })
    expect(textoLlegada(l, '2026-11-16')).toMatch(/^A este ritmo no llegas\./)
    expect(lineaMeta(l, '2026-11-16')).toBe('A este ritmo no llegas a tu meta')
  })

  it('negativo pero ya tienes la meta: lo dice (no hay que llegar)', () => {
    expect(cuandoLlego(5000, 5000, -100, '2026-11-16')).toEqual({ estado: 'ya' })
  })

  it('la proyección con ritmo negativo baja (y nunca va hacia atrás en el tiempo)', () => {
    const serie = serieProyeccion(10000, -3000, '2026-11-16', 3)
    expect(serie.map((p) => p.fecha)).toEqual(['2026-11-16', '2026-12-16', '2027-01-16', '2027-02-16'])
    expect(serie.every((p, i) => i === 0 || p.saldo < serie[i - 1].saldo)).toBe(true)
    expect(saldoDentroDe(10000, -3000, -5)).toBe(10000)
  })

  it('un recorte que pasa de negativo a positivo «desbloquea» la meta', () => {
    const con = cuandoLlego(0, 120000, 10000, '2026-11-16')
    expect(con.estado).toBe('llega')
    expect(impactoEnMeta(0, 120000, -1000, 11000, '2026-11-16')).toEqual({ tipo: 'desbloquea', fecha: con.estado === 'llega' ? con.fecha : null })
  })
})

describe('fecha de llegada', () => {
  it('cruza el año y cae el 29/2 si toca', () => {
    // 105 días desde el 16/11/2027 → 29/2/2028
    const ritmo = 1000 * 12
    const falta = Math.floor((105 * 12 * ritmo) / 365)
    const l = cuandoLlego(0, falta, ritmo, '2027-11-16')
    expect(l).toMatchObject({ estado: 'llega', dias: 105, fecha: '2028-02-29' })
  })

  it('importes enormes: no se pierde precisión ni sale una fecha absurda', () => {
    const lejos = cuandoLlego(0, IMPORTE_MAX_CENTIMOS, 1, '2026-11-16')
    expect(lejos).toMatchObject({ estado: 'no_llega', motivo: 'lejos' })
    const rapido = cuandoLlego(0, IMPORTE_MAX_CENTIMOS, IMPORTE_MAX_CENTIMOS, '2026-11-16')
    expect(rapido).toMatchObject({ estado: 'llega', dias: 31 })
    expect(Number.isSafeInteger(saldoDentroDe(IMPORTE_MAX_CENTIMOS, IMPORTE_MAX_CENTIMOS, 365 * 50))).toBe(true)
  })
})

describe('serie real', () => {
  it('cruza el cambio de año con los finales de mes correctos (febrero bisiesto)', () => {
    const serie = serieReal([mov('2027-12-31', 100, 'ingreso'), mov('2028-02-29', 50, 'ingreso')], '2028-03-10', 3)
    expect(serie).toEqual([
      { fecha: '2027-12-31', saldo: 100 },
      { fecha: '2028-01-31', saldo: 100 },
      { fecha: '2028-02-29', saldo: 150 },
      { fecha: '2028-03-10', saldo: 150 },
    ])
  })
})

describe('revisión: periodos en los límites', () => {
  it('la semana que cruza el año se revisa el lunes 4/1/2027', () => {
    expect(periodoTerminado('semanal', '2027-01-04')).toEqual({ tipo: 'semanal', inicio: '2026-12-28', fin: '2027-01-03' })
  })
  it('el 1/3/2028 se revisa febrero con su 29', () => {
    expect(periodoTerminado('mensual', '2028-03-01')).toEqual({ tipo: 'mensual', inicio: '2028-02-01', fin: '2028-02-29' })
    expect(periodoAnterior({ tipo: 'mensual', inicio: '2028-03-01', fin: '2028-03-31' })).toEqual({ tipo: 'mensual', inicio: '2028-02-01', fin: '2028-02-29' })
  })
  it('la diaria apuntada el domingo 3/1 entra en la revisión de esa semana (de 2026 a 2027)', () => {
    const f: FijoRevision = { id: FIJO, tipo: 'gasto', concepto: 'Café', importe_centimos: 150, frecuencia: 'diaria', categoria: 'comida', necesidad: 'prescindible', activo: true }
    const apunte: MovimientoRevision = { id: idApunteFijo(FIJO, '2026-12-28', 'diaria'), tipo: 'gasto', concepto: 'Café (7 días)', importe_centimos: 1050, fecha: '2027-01-03', categoria: 'comida', necesidad: 'prescindible', fijo_id: FIJO }
    const d = calcularRevision({ periodo: periodoTerminado('semanal', '2027-01-04'), movimientos: [apunte], fijos: [f], deseos: [], meta: null, hoy: '2027-01-04' })
    expect(d).toMatchObject({ gastos: 1050, fijos_periodo: 1050, prescindibles: 1050 })
    // Es de un fijo: va en «fijos caros», no en «prescindibles» a mano
    expect(d.sugerencias.map((s) => s.regla)).toEqual(['fijo_caro'])
  })
  it('un fijo en pausa no cuenta para los solapados ni para los fijos caros', () => {
    const fijos: FijoRevision[] = [
      { id: 'a', tipo: 'gasto', concepto: 'Netflix', importe_centimos: 1299, frecuencia: 'mensual', categoria: 'suscripciones', necesidad: null, activo: true },
      { id: 'b', tipo: 'gasto', concepto: 'HBO', importe_centimos: 999, frecuencia: 'mensual', categoria: 'suscripciones', necesidad: null, activo: false },
    ]
    const d = calcularRevision({ periodo: periodoTerminado('semanal', '2026-11-16'), movimientos: [], fijos, deseos: [], meta: null, hoy: '2026-11-16' })
    expect(d.sugerencias.map((s) => [s.regla, s.titulo])).toEqual([['fijo_caro', 'Netflix']])
  })
})
