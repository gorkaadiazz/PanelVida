// Fijos con frecuencia (diaria, semanal, anual), equivalencias y compatibilidad
// con los campos antiguos. El 14/11/2026 es sábado; su semana va del lunes 9
// al domingo 15.
import { describe, expect, it } from 'vitest'
import {
  alMes,
  apuntesPendientes,
  camposAntiguos,
  DESDE_NUNCA,
  equivalencias,
  esDeFijo,
  idApunteFijo,
  inicioAlReanudar,
  MAX_SEMANAS_PENDIENTES,
  mesesPendientes,
  normalizarFijo,
  proximoApunte,
  textoCuando,
  totalFijoMensual,
  validarCuando,
  type FijoBasico,
} from './fijos'
import { ErrorDeValidacion } from './validacion'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const fijo = (cambios: Partial<FijoBasico> = {}): FijoBasico => ({
  id: ID,
  dia: 5,
  desde: DESDE_NUNCA,
  ultimo_mes: null,
  activo: true,
  frecuencia: 'mensual',
  mes: null,
  inicio: '2026-11-01',
  ultimo_apunte: null,
  ...cambios,
})

describe('semanal', () => {
  const clase = (c: Partial<FijoBasico> = {}) => fijo({ frecuencia: 'semanal', dia: 3, inicio: '2026-11-09', ...c }) // miércoles

  it('se apunta el día de la semana que toca, una vez por semana', () => {
    expect(apuntesPendientes(clase(), '2026-11-10')).toEqual([])
    expect(apuntesPendientes(clase(), '2026-11-11')).toEqual([{ periodo: '2026-11-09', fecha: '2026-11-11', veces: 1 }])
    expect(apuntesPendientes(clase({ ultimo_apunte: '2026-11-11' }), '2026-11-17')).toEqual([])
    expect(apuntesPendientes(clase({ ultimo_apunte: '2026-11-11' }), '2026-11-18').map((a) => a.fecha)).toEqual(['2026-11-18'])
  })
  it('pone al día las semanas atrasadas', () => {
    expect(apuntesPendientes(clase({ ultimo_apunte: '2026-11-11' }), '2026-12-02').map((a) => a.fecha)).toEqual(['2026-11-18', '2026-11-25', '2026-12-02'])
  })
  it('si empieza un jueves, la de ese miércoles ya no cuenta', () => {
    expect(apuntesPendientes(clase({ inicio: '2026-11-12' }), '2026-11-14')).toEqual([])
    expect(proximoApunte(clase({ inicio: '2026-11-12' }), '2026-11-14')).toBe('2026-11-18')
  })
  it('como mucho 52 semanas', () => {
    const apuntes = apuntesPendientes(clase({ inicio: '2020-01-01' }), '2026-11-14')
    expect(apuntes).toHaveLength(MAX_SEMANAS_PENDIENTES)
    expect(apuntes.at(-1)?.fecha).toBe('2026-11-11')
  })
  it('el domingo (7) cae al final de la semana', () => {
    expect(apuntesPendientes(clase({ dia: 7 }), '2026-11-15').map((a) => a.fecha)).toEqual(['2026-11-15'])
  })
})

describe('diaria: un apunte por semana, el domingo', () => {
  const cafe = (c: Partial<FijoBasico> = {}) => fijo({ frecuencia: 'diaria', dia: 7, inicio: '2026-11-09', ...c })

  it('el domingo, por los 7 días de la semana', () => {
    expect(apuntesPendientes(cafe(), '2026-11-14')).toEqual([])
    expect(apuntesPendientes(cafe(), '2026-11-15')).toEqual([{ periodo: '2026-11-09', fecha: '2026-11-15', veces: 7 }])
  })
  it('la primera semana solo cuenta desde el día en que empieza', () => {
    expect(apuntesPendientes(cafe({ inicio: '2026-11-13' }), '2026-11-15')).toEqual([{ periodo: '2026-11-09', fecha: '2026-11-15', veces: 3 }])
    expect(apuntesPendientes(cafe({ inicio: '2026-11-15' }), '2026-11-15')[0].veces).toBe(1)
  })
  it('el próximo apunte es el domingo', () => {
    expect(proximoApunte(cafe(), '2026-11-11')).toBe('2026-11-15')
    expect(proximoApunte(cafe({ ultimo_apunte: '2026-11-15' }), '2026-11-15')).toBe('2026-11-22')
  })
  it('su id no choca con el de un semanal del mismo periodo', () => {
    expect(idApunteFijo(ID, '2026-11-09', 'diaria')).not.toBe(idApunteFijo(ID, '2026-11-09', 'semanal'))
  })
})

describe('anual', () => {
  const seguro = (c: Partial<FijoBasico> = {}) => fijo({ frecuencia: 'anual', dia: 29, mes: 2, inicio: '2026-11-14', ...c })

  it('el 29/2 se apunta el 28 en años no bisiestos y el 29 en los bisiestos', () => {
    expect(proximoApunte(seguro(), '2026-11-14')).toBe('2027-02-28')
    expect(apuntesPendientes(seguro(), '2027-02-28')).toEqual([{ periodo: '2027', fecha: '2027-02-28', veces: 1 }])
    expect(proximoApunte(seguro({ ultimo_apunte: '2027-02-28' }), '2027-03-01')).toBe('2028-02-29')
  })
  it('creado después de su día, empieza el año que viene', () => {
    expect(apuntesPendientes(fijo({ frecuencia: 'anual', dia: 1, mes: 3, inicio: '2026-11-14' }), '2026-12-31')).toEqual([])
    expect(proximoApunte(fijo({ frecuencia: 'anual', dia: 1, mes: 3, inicio: '2026-11-14' }), '2026-11-14')).toBe('2027-03-01')
  })
  it('no repite el año ya apuntado aunque cambie el día', () => {
    expect(apuntesPendientes(seguro({ dia: 10, mes: 12, ultimo_apunte: '2027-02-28' }), '2027-12-31')).toEqual([])
  })
})

describe('compatibilidad con los campos antiguos', () => {
  it('una fila sin columnas nuevas se lee como mensual desde `desde`', () => {
    expect(normalizarFijo({ id: ID, dia: 31, desde: '2026-02', ultimo_mes: '2026-03', activo: true })).toEqual({
      id: ID,
      frecuencia: 'mensual',
      dia: 31,
      mes: null,
      inicio: '2026-02-01',
      ultimo_apunte: '2026-03-31',
      activo: true,
    })
  })
  it('los mensuales guardan `desde` y `ultimo_mes` como antes; los demás, un desde que nunca llega', () => {
    expect(camposAntiguos({ frecuencia: 'mensual', dia: 5, inicio: '2026-11-14', ultimo_apunte: null })).toEqual({ desde: '2026-12', ultimo_mes: null })
    expect(camposAntiguos({ frecuencia: 'mensual', dia: 20, inicio: '2026-11-14', ultimo_apunte: '2026-11-20' })).toEqual({ desde: '2026-11', ultimo_mes: '2026-11' })
    expect(camposAntiguos({ frecuencia: 'semanal', dia: 1, inicio: '2026-11-14', ultimo_apunte: '2026-11-16' })).toEqual({ desde: DESDE_NUNCA, ultimo_mes: null })
  })
  it('la app antigua no apunta nada de un fijo no mensual (desde = 9999-12)', () => {
    // Lo que haría la app antigua: leer solo los campos de meses
    expect(mesesPendientes({ id: ID, dia: 3, desde: DESDE_NUNCA, ultimo_mes: null, activo: true }, '2026-11-14')).toEqual([])
  })
  it('al reanudar cuenta desde hoy (o desde su inicio si aún no ha llegado)', () => {
    expect(inicioAlReanudar(fijo({ inicio: '2026-01-01' }), '2026-11-14')).toBe('2026-11-14')
    expect(inicioAlReanudar(fijo({ inicio: '2027-01-01' }), '2026-11-14')).toBe('2027-01-01')
  })
})

describe('equivalencias', () => {
  it('1,50 €/día ≈ 45,63 €/mes ≈ 547,50 €/año', () => {
    expect(equivalencias(150, 'diaria')).toEqual({ dia: 150, semana: 1050, mes: 4563, anio: 54750 })
  })
  it('una semanal, una mensual y una anual', () => {
    expect(equivalencias(2000, 'semanal')).toEqual({ dia: 286, semana: 2000, mes: 8690, anio: 104286 })
    expect(equivalencias(999, 'mensual')).toEqual({ dia: 33, semana: 230, mes: 999, anio: 11988 })
    expect(equivalencias(12000, 'anual')).toEqual({ dia: 33, semana: 230, mes: 1000, anio: 12000 })
  })
  it('siempre en céntimos enteros', () => {
    for (const f of ['diaria', 'semanal', 'mensual', 'anual'] as const) {
      for (const v of Object.values(equivalencias(333, f))) expect(Number.isInteger(v)).toBe(true)
    }
  })
  it('total fijo mensual: solo los activos y del tipo pedido', () => {
    const fijos = [
      { tipo: 'gasto', importe_centimos: 999, frecuencia: 'mensual', activo: true },
      { tipo: 'gasto', importe_centimos: 150, frecuencia: 'diaria', activo: true },
      { tipo: 'gasto', importe_centimos: 5000, frecuencia: 'mensual', activo: false },
      { tipo: 'ingreso', importe_centimos: 2000, frecuencia: 'semanal', activo: true },
    ]
    expect(totalFijoMensual(fijos)).toBe(999 + 4563)
    expect(totalFijoMensual(fijos, 'ingreso')).toBe(8690)
    expect(alMes(999, 'rara')).toBe(999) // frecuencia desconocida = mensual
  })
})

describe('validar cuándo', () => {
  it('cada frecuencia con su día', () => {
    expect(validarCuando('diaria', '')).toEqual({ dia: 7, mes: null })
    expect(validarCuando('semanal', '3')).toEqual({ dia: 3, mes: null })
    expect(validarCuando('mensual', '31')).toEqual({ dia: 31, mes: null })
    expect(validarCuando('anual', '29', '2')).toEqual({ dia: 29, mes: 2 })
  })
  it.each([
    ['semanal', '8', null],
    ['semanal', '0', null],
    ['mensual', '32', null],
    ['anual', '31', '4'],
    ['anual', '30', '2'],
    ['anual', '5', ''],
    ['anual', '5', '13'],
  ] as const)('rechaza %s día %s mes %s', (f, d, m) => {
    expect(() => validarCuando(f, d, m)).toThrow(ErrorDeValidacion)
  })
})

describe('textos y origen', () => {
  it('dice cuándo se apunta', () => {
    expect(textoCuando(fijo())).toBe('Día 5 de cada mes')
    expect(textoCuando(fijo({ frecuencia: 'semanal', dia: 2 }))).toBe('Cada martes')
    expect(textoCuando(fijo({ frecuencia: 'anual', dia: 5, mes: 3 }))).toBe('5 de marzo, cada año')
    expect(textoCuando(fijo({ frecuencia: 'diaria' }))).toBe('Cada día · se apunta el domingo')
  })
  it('un movimiento es de un fijo si lleva fijo_id o tiene el id del mes de un fijo (los de antes)', () => {
    expect(esDeFijo({ id: 'x', fecha: '2026-11-05', fijo_id: ID }, [])).toBe(true)
    expect(esDeFijo({ id: idApunteFijo(ID, '2026-11'), fecha: '2026-11-05' }, [{ id: ID }])).toBe(true)
    expect(esDeFijo({ id: idApunteFijo(ID, '2026-11'), fecha: '2026-12-05' }, [{ id: ID }])).toBe(false)
    expect(esDeFijo({ id: 'otro', fecha: '2026-11-05', fijo_id: null }, [{ id: ID }])).toBe(false)
    // Un fijo con un id dañado no rompe nada
    expect(esDeFijo({ id: 'otro', fecha: '2026-11-05' }, [{ id: 'no-es-uuid' }])).toBe(false)
  })
})
