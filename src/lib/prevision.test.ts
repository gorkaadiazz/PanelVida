// Previsión de ahorro: ritmo medio, proyección por plazo, fecha de llegada,
// ritmo cero o negativo y datos insuficientes. Hoy: 16/11/2026.
import { describe, expect, it } from 'vitest'
import { formatearEuros as eur } from './dinero'
import { idApunteFijo } from './fijos'
import {
  cuandoLlego,
  DIAS_MAX_LLEGADA,
  impactoEnMeta,
  lineaMeta,
  objetivoDeseo,
  ritmoAhorro,
  saldoDentroDe,
  saldoEn,
  serieProyeccion,
  serieReal,
  sumarMesesAFecha,
  textoDuracion,
  textoFecha,
  textoLlegada,
  textoRitmo,
  type FijoPrevision,
  type MovimientoPrevision,
} from './prevision'

const HOY = '2026-11-16'
const FIJO = '0f8fad5b-d9cb-469f-a165-70867728950e'
let n = 0
const mov = (fecha: string, importe: number, tipo = 'gasto', c: Partial<MovimientoPrevision> = {}): MovimientoPrevision => ({ id: `m${++n}`, tipo, importe_centimos: importe, fecha, ...c })
const fijo = (importe: number, c: Partial<FijoPrevision> = {}): FijoPrevision => ({ id: FIJO, tipo: 'gasto', importe_centimos: importe, frecuencia: 'mensual', activo: true, ...c })

describe('fechas por meses', () => {
  it('la misma fecha n meses antes o después; el 31 cae en el último día', () => {
    expect(sumarMesesAFecha('2026-11-16', -3)).toBe('2026-08-16')
    expect(sumarMesesAFecha('2026-08-31', 1)).toBe('2026-09-30')
    expect(sumarMesesAFecha('2027-01-31', 1)).toBe('2027-02-28')
    expect(sumarMesesAFecha('2026-11-16', 12)).toBe('2027-11-16')
  })
})

describe('ritmo medio', () => {
  it('ingresos − gastos de la ventana, pasados a «por mes»', () => {
    // Ventana de 3 meses: del 17/08 al 16/11 (92 días). 920 € netos → 920 × 30,42 / 92 = 304,17 €/mes
    const movimientos = [mov('2026-08-17', 150000, 'ingreso'), mov('2026-10-01', 58000), mov('2026-08-16', 99999, 'ingreso')]
    const r = ritmoAhorro(movimientos, [], 3, HOY)
    expect(r).toMatchObject({ dias: 92, desde: '2026-08-17', aviso: null, fijos: 0 })
    expect(r.variable).toBe(Math.round((92000 * 365) / (12 * 92)))
    expect(r.mensual).toBe(r.variable)
  })

  it('la ventana se puede cambiar a 1 o 6 meses', () => {
    const movimientos = [mov('2026-06-01', 60000, 'ingreso'), mov('2026-11-01', 3000)]
    expect(ritmoAhorro(movimientos, [], 1, HOY)).toMatchObject({ dias: 31, desde: '2026-10-17' })
    expect(ritmoAhorro(movimientos, [], 6, HOY).desde).toBe('2026-06-01') // empieza en el primer dato
  })

  it('los fijos activos cuentan con su equivalente al mes y sus apuntes no se cuentan dos veces', () => {
    const movimientos = [
      mov('2026-08-17', 100000, 'ingreso'),
      mov('2026-10-05', 3000, 'gasto', { fijo_id: FIJO }),
      mov('2026-09-05', 3000, 'gasto', { id: idApunteFijo(FIJO, '2026-09') }), // de antes de fijo_id
    ]
    const r = ritmoAhorro(movimientos, [fijo(3000), fijo(150, { id: 'otro', frecuencia: 'diaria' }), fijo(9999, { activo: false }), fijo(50000, { tipo: 'ingreso' })], 3, HOY)
    expect(r.variable).toBe(Math.round((100000 * 365) / (12 * 92)))
    expect(r.fijos).toBe(50000 - 3000 - 4563)
    expect(r.mensual).toBe(r.variable + r.fijos)
  })

  it('con menos de un mes de datos avisa (y usa lo que hay)', () => {
    const r = ritmoAhorro([mov('2026-11-07', 10000, 'ingreso')], [], 3, HOY)
    expect(r).toMatchObject({ dias: 10, aviso: 'pocos_datos', variable: Math.round((10000 * 365) / (12 * 10)) })
  })

  it('sin datos: avisa y el ritmo sale solo de los fijos', () => {
    expect(ritmoAhorro([], [fijo(3000)], 3, HOY)).toEqual({ mensual: -3000, variable: 0, fijos: -3000, dias: 0, desde: null, aviso: 'sin_datos' })
    // Lo apuntado con fecha futura no cuenta como dato
    expect(ritmoAhorro([mov('2026-12-01', 5000)], [], 3, HOY).aviso).toBe('sin_datos')
  })
})

describe('proyección por plazo', () => {
  it('cuánto tendrás dentro de 1, 3, 6 o 12 meses o en una fecha', () => {
    expect(saldoDentroDe(50000, 10000, 365)).toBe(50000 + 120000)
    expect(saldoEn(50000, 10000, HOY, sumarMesesAFecha(HOY, 6))).toBe(50000 + Math.round((10000 * 12 * 181) / 365))
    expect(saldoEn(50000, -10000, HOY, '2027-11-16')).toBe(50000 - 120000)
    expect(saldoEn(50000, 10000, HOY, '2026-11-01')).toBe(50000) // una fecha pasada no resta
  })
  it('la serie de la proyección empieza hoy y va mes a mes', () => {
    const serie = serieProyeccion(1000, 3000, HOY, 3)
    expect(serie.map((p) => p.fecha)).toEqual(['2026-11-16', '2026-12-16', '2027-01-16', '2027-02-16'])
    expect(serie[0].saldo).toBe(1000)
    expect(serie[3].saldo).toBe(saldoEn(1000, 3000, HOY, '2027-02-16'))
  })
  it('la serie real acumula el ahorro al final de cada mes, sin lo de después de hoy', () => {
    const serie = serieReal([mov('2026-09-10', 10000, 'ingreso'), mov('2026-10-31', 2000), mov('2026-11-10', 500, 'ingreso'), mov('2026-11-20', 99999, 'ingreso')], HOY, 3)
    expect(serie).toEqual([
      { fecha: '2026-08-31', saldo: 0 },
      { fecha: '2026-09-30', saldo: 10000 },
      { fecha: '2026-10-31', saldo: 8000 },
      { fecha: HOY, saldo: 8500 },
    ])
  })
})

describe('fecha de llegada', () => {
  it('cuánto tardas y en qué fecha llegas', () => {
    // Faltan 600 € a 200 €/mes: 3 meses = 91,25 días → 92
    expect(cuandoLlego(40000, 100000, 20000, HOY)).toEqual({ estado: 'llega', dias: 92, fecha: '2027-02-16' })
  })
  it('si ya lo tienes, lo dice', () => {
    expect(cuandoLlego(100000, 100000, 0, HOY)).toEqual({ estado: 'ya' })
  })
  it('con ritmo cero o negativo no inventa fecha y dice cuánto haría falta al mes en 3, 6 o 12 meses', () => {
    const esperado = { estado: 'no_llega', motivo: 'ritmo', falta: 60000, necesario: [{ meses: 3, alMes: 20000 }, { meses: 6, alMes: 10000 }, { meses: 12, alMes: 5000 }] }
    expect(cuandoLlego(40000, 100000, 0, HOY)).toEqual(esperado)
    expect(cuandoLlego(40000, 100000, -5000, HOY)).toEqual(esperado)
  })
  it('un ritmo positivo pero mínimo (más de 50 años) tampoco da fecha', () => {
    const r = cuandoLlego(0, 100_000_000, 1, HOY)
    expect(r).toMatchObject({ estado: 'no_llega', motivo: 'lejos' })
    // 6 € a 1 céntimo al mes: justo 50 años (18.250 días); un céntimo más, ya no
    expect(cuandoLlego(0, 600, 1, HOY)).toMatchObject({ estado: 'llega', dias: DIAS_MAX_LLEGADA })
    expect(cuandoLlego(0, 601, 1, HOY)).toMatchObject({ estado: 'no_llega', motivo: 'lejos' })
  })
  it('con un ahorro negativo también cuenta lo que falta desde ahí', () => {
    expect(cuandoLlego(-10000, 20000, 0, HOY)).toMatchObject({ falta: 30000 })
  })
})

describe('impacto de un recorte en la meta', () => {
  it('días antes', () => {
    // Faltan 600 €: a 200 €/mes, 92 días; a 300 €/mes, 61 días
    expect(impactoEnMeta(40000, 100000, 20000, 10000, HOY)).toEqual({ tipo: 'antes', dias: 31 })
  })
  it('si a tu ritmo no llegabas y con el recorte sí, lo dice con la fecha', () => {
    expect(impactoEnMeta(40000, 100000, -5000, 25000, HOY)).toEqual({ tipo: 'desbloquea', fecha: '2027-02-16' })
  })
  it('nada si no hay meta, ya está conseguida o el recorte no llega', () => {
    expect(impactoEnMeta(40000, null, 20000, 10000, HOY)).toBeNull()
    expect(impactoEnMeta(200000, 100000, 20000, 10000, HOY)).toBeNull()
    expect(impactoEnMeta(40000, 100000, -50000, 10000, HOY)).toBeNull()
  })
})

describe('objetivo de un deseo', () => {
  const deseo = (id: string, precio: number, prioridad: string, comprado = false) => ({ id, articulo: id, precio_centimos: precio, prioridad, comprado, created_at: '2026-11-01T00:00:00Z' })
  it('su precio más el de los que van antes por prioridad', () => {
    const deseos = [deseo('cascos', 5000, 'baja'), deseo('bici', 30000, 'alta'), deseo('libro', 2000, 'media'), deseo('movil', 90000, 'alta', true)]
    expect(objetivoDeseo(deseos, 'bici')).toBe(30000)
    expect(objetivoDeseo(deseos, 'libro')).toBe(32000)
    expect(objetivoDeseo(deseos, 'cascos')).toBe(37000)
    expect(objetivoDeseo(deseos, 'movil')).toBeNull() // ya comprado
  })
})

describe('textos', () => {
  it('duraciones', () => {
    expect(textoDuracion(1)).toBe('1 día')
    expect(textoDuracion(10)).toBe('10 días')
    expect(textoDuracion(21)).toBe('3 semanas')
    expect(textoDuracion(92)).toBe('3 meses')
    expect(textoDuracion(31)).toBe('4 semanas')
    expect(textoDuracion(800)).toBe('2 años')
  })
  it('fechas: sin año si es este año', () => {
    expect(textoFecha('2026-12-15', HOY)).toBe('15 de diciembre')
    expect(textoFecha('2027-05-15', HOY)).toBe('15 de mayo de 2027')
  })
  it('ritmo con signo', () => {
    expect(textoRitmo(12000)).toBe(`+${eur(12000)}/mes`)
    expect(textoRitmo(-3000)).toBe(`${eur(-3000)}/mes`)
  })
  it('llegada', () => {
    expect(textoLlegada(cuandoLlego(40000, 100000, 20000, HOY), HOY)).toBe('A este ritmo llegas el 16 de febrero de 2027 (en 3 meses).')
    expect(textoLlegada(cuandoLlego(40000, 100000, 0, HOY), HOY)).toBe(
      `A este ritmo no llegas. Para llegar tendrías que ahorrar ${eur(20000)}/mes en 3 meses, ${eur(10000)} en 6 o ${eur(5000)} en 12.`,
    )
    expect(textoLlegada({ estado: 'ya' }, HOY)).toBe('Ya lo tienes.')
  })
  it('línea de Inicio', () => {
    expect(lineaMeta(cuandoLlego(40000, 50000, 20000, HOY), HOY)).toBe('A este ritmo llegas a tu meta el 2 de diciembre')
    expect(lineaMeta(cuandoLlego(40000, 50000, 0, HOY), HOY)).toBe('A este ritmo no llegas a tu meta')
    expect(lineaMeta({ estado: 'ya' }, HOY)).toBeNull()
    expect(lineaMeta(null, HOY)).toBeNull()
  })
})
