import { describe, expect, it } from 'vitest'
import { ErrorDeValidacion, medioDe, resumenMesPorMedio, validarMedio } from './dinero'

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
