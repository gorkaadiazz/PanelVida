import { describe, expect, it } from 'vitest'
import { ErrorDeValidacion, filasDelMes, medioDe, resumenMesPorMedio, resumir, saldoPorMedio, traspasosDelMes, validarFechaTraspaso, validarMedio, validarSentido } from './dinero'

describe('efectivo o tarjeta', () => {
  it('validarMedio: vacío o sin poner es tarjeta; fuera de la lista falla', () => {
    expect(validarMedio('')).toBe('tarjeta')
    expect(validarMedio(undefined)).toBe('tarjeta')
    expect(validarMedio(null)).toBe('tarjeta')
    expect(validarMedio('efectivo')).toBe('efectivo')
    expect(validarMedio('tarjeta')).toBe('tarjeta')
    expect(() => validarMedio('bizum')).toThrow(ErrorDeValidacion)
  })

  it('medioDe: una fila sin medio (antigua o sin descargar) o con uno desconocido cuenta como tarjeta', () => {
    expect(medioDe({})).toBe('tarjeta')
    expect(medioDe({ medio: null })).toBe('tarjeta')
    expect(medioDe({ medio: 'cheque' })).toBe('tarjeta')
    expect(medioDe({ medio: 'efectivo' })).toBe('efectivo')
  })

  it('resumenMesPorMedio separa ingresos y gastos del mes y no cuenta otros meses', () => {
    const r = resumenMesPorMedio(
      [
        { tipo: 'gasto', importe_centimos: 1000, fecha: '2026-11-02', medio: 'tarjeta' },
        { tipo: 'gasto', importe_centimos: 250, fecha: '2026-11-03', medio: 'efectivo' },
        { tipo: 'ingreso', importe_centimos: 2000, fecha: '2026-11-04', medio: 'efectivo' },
        { tipo: 'gasto', importe_centimos: 99, fecha: '2026-11-05' },
        { tipo: 'gasto', importe_centimos: 5000, fecha: '2026-10-31', medio: 'efectivo' },
      ],
      '2026-11',
    )
    expect(r.tarjeta).toEqual({ ingresos: 0, gastos: 1099, ahorro: -1099 })
    expect(r.efectivo).toEqual({ ingresos: 2000, gastos: 250, ahorro: 1750 })
  })

  it('un mes sin movimientos da ceros en los dos', () => {
    const r = resumenMesPorMedio([], '2026-11')
    expect(r.tarjeta).toEqual({ ingresos: 0, gastos: 0, ahorro: 0 })
    expect(r.efectivo).toEqual({ ingresos: 0, gastos: 0, ahorro: 0 })
  })
})

describe('saldo por medio y traspasos', () => {
  const movs = [
    { tipo: 'ingreso', importe_centimos: 100000, fecha: '2026-11-01', medio: 'tarjeta' },
    { tipo: 'gasto', importe_centimos: 1500, fecha: '2026-11-03', medio: 'efectivo' },
    { tipo: 'gasto', importe_centimos: 2000, fecha: '2026-11-04' },
  ]

  it('sacar del cajero pasa de tarjeta a efectivo e ingresar al revés; la suma es siempre el ahorro total', () => {
    const s = saldoPorMedio(movs, [
      { sentido: 'sacar', importe_centimos: 5000, fecha: '2026-11-02' },
      { sentido: 'ingresar', importe_centimos: 1000, fecha: '2026-11-05' },
    ])
    expect(s).toEqual({ tarjeta: 100000 - 2000 - 5000 + 1000, efectivo: -1500 + 5000 - 1000 })
    expect(s.tarjeta + s.efectivo).toBe(resumir(movs).ahorro)
  })

  it('sin traspasos, gastar en efectivo deja el efectivo en negativo; un sentido desconocido no cuenta', () => {
    expect(saldoPorMedio(movs, [{ sentido: 'teletransporte', importe_centimos: 999, fecha: '2026-11-02' }])).toEqual({ tarjeta: 98000, efectivo: -1500 })
    expect(saldoPorMedio([], [])).toEqual({ tarjeta: 0, efectivo: 0 })
  })

  it('validarSentido solo acepta sacar o ingresar', () => {
    expect(validarSentido('sacar')).toBe('sacar')
    expect(validarSentido('ingresar')).toBe('ingresar')
    expect(() => validarSentido('')).toThrow(ErrorDeValidacion)
    expect(() => validarSentido('Sacar')).toThrow(ErrorDeValidacion)
  })

  it('traspasosDelMes: solo los del mes, del más reciente al más antiguo', () => {
    const t = (id: string, fecha: string, created_at = '2026-11-01T10:00:00Z') => ({ id, sentido: 'sacar', importe_centimos: 1, fecha, created_at })
    const r = traspasosDelMes([t('a', '2026-11-02'), t('b', '2026-11-20'), t('c', '2026-10-31'), t('d', '2026-11-20', '2026-11-20T12:00:00Z')], '2026-11')
    expect(r.map((x) => x.id)).toEqual(['d', 'b', 'a'])
  })
})

describe('traspasos: casos límite', () => {
  it('tarjeta + efectivo es siempre el ahorro total (muchas combinaciones, con céntimos, otros meses y años)', () => {
    // Generador determinista (sin Math.random) para que el test sea reproducible
    let semilla = 12345
    const azar = (n: number) => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648
      return semilla % n
    }
    const fechas = ['2025-12-31', '2026-01-01', '2026-03-29', '2026-10-25', '2026-11-15', '2027-02-28']
    for (let vuelta = 0; vuelta < 200; vuelta++) {
      const movs = Array.from({ length: azar(8) }, () => ({
        tipo: ['ingreso', 'gasto', 'raro'][azar(3)],
        importe_centimos: 1 + azar(99999),
        fecha: fechas[azar(fechas.length)],
        medio: [undefined, null, '', 'tarjeta', 'efectivo', 'bizum'][azar(6)] as string | null | undefined,
      }))
      const tras = Array.from({ length: azar(6) }, () => ({ sentido: ['sacar', 'ingresar', 'otro'][azar(3)], importe_centimos: 1 + azar(99999), fecha: fechas[azar(fechas.length)] }))
      const s = saldoPorMedio(movs, tras)
      expect(Number.isInteger(s.tarjeta) && Number.isInteger(s.efectivo)).toBe(true)
      expect(s.tarjeta + s.efectivo).toBe(resumir(movs).ahorro)
    }
  })

  it('el saldo es acumulado: cuentan los traspasos de cualquier mes, y sacar e ingresar lo mismo se anulan', () => {
    const tras = [
      { sentido: 'sacar', importe_centimos: 2050, fecha: '2025-12-31' },
      { sentido: 'ingresar', importe_centimos: 2050, fecha: '2026-01-01' },
      { sentido: 'sacar', importe_centimos: 1, fecha: '2026-11-15' },
    ]
    expect(saldoPorMedio([], tras)).toEqual({ tarjeta: -1, efectivo: 1 })
  })

  it('los traspasos no cambian el resumen del mes (ni ingresos ni gastos ni ahorro)', () => {
    const movs = [{ tipo: 'gasto', importe_centimos: 1234, fecha: '2026-11-03', medio: 'efectivo' }]
    // resumenMesPorMedio solo recibe movimientos: un traspaso no es ni ingreso ni gasto
    expect(resumenMesPorMedio(movs, '2026-11').efectivo).toEqual({ ingresos: 0, gastos: 1234, ahorro: -1234 })
  })

  it('traspasosDelMes en cambio de año y mismo instante: desempata por id', () => {
    const t = (id: string, fecha: string, created_at = '2026-01-01T00:00:00Z') => ({ id, sentido: 'sacar', importe_centimos: 1, fecha, created_at })
    expect(traspasosDelMes([t('z', '2026-01-01'), t('a', '2026-01-01'), t('x', '2025-12-31')], '2026-01').map((x) => x.id)).toEqual(['a', 'z'])
    expect(traspasosDelMes([t('z', '2026-01-01'), t('x', '2025-12-31')], '2025-12').map((x) => x.id)).toEqual(['x'])
  })

  it('filasDelMes mezcla movimientos y traspasos del mes por fecha y, el mismo día, el último apuntado primero', () => {
    const m = (id: string, fecha: string, created_at: string) => ({ id, tipo: 'gasto', importe_centimos: 100, fecha, created_at })
    const t = (id: string, fecha: string, created_at: string) => ({ id, sentido: 'sacar', importe_centimos: 100, fecha, created_at })
    const filas = filasDelMes(
      [m('m1', '2026-11-02', '2026-11-02T09:00:00Z'), m('m2', '2026-11-10', '2026-11-10T08:00:00Z'), m('fuera', '2026-10-31', '2026-10-31T23:00:00Z')],
      [t('t1', '2026-11-10', '2026-11-10T09:00:00Z'), t('t2', '2026-11-01', '2026-11-01T09:00:00Z'), t('fuera2', '2026-12-01', '2026-12-01T00:00:00Z')],
      '2026-11',
    )
    expect(filas.map((f) => (f.clase === 'movimiento' ? f.m.id : f.t.id))).toEqual(['t1', 'm2', 'm1', 't2'])
    expect(filas.map((f) => f.clase)).toEqual(['traspaso', 'movimiento', 'movimiento', 'traspaso'])
    expect(filasDelMes([], [], '2026-11')).toEqual([])
  })

  it('validarFechaTraspaso: fecha de día dentro de 2000-2100, como el check de la base de datos', () => {
    expect(validarFechaTraspaso('2000-01-01')).toBe('2000-01-01')
    expect(validarFechaTraspaso('2100-12-31')).toBe('2100-12-31')
    expect(validarFechaTraspaso('2028-02-29')).toBe('2028-02-29')
    for (const mala of ['1999-12-31', '2101-01-01', '0202-11-15', '2026-02-29', '15/11/2026', '']) {
      expect(() => validarFechaTraspaso(mala)).toThrow(ErrorDeValidacion)
    }
  })
})
