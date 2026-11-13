import { describe, expect, it } from 'vitest'
import { claseDeModulo, proximoExamen, textoCuentaAtras, type EvaluacionBasica, type ModuloBasico } from './examenes'

const MODULOS: ModuloBasico[] = [
  { id: 'm-sor', nombre: 'Sistemas Operativos en Red', abreviatura: 'SOR' },
  { id: 'm-x', nombre: 'Módulo inventado', abreviatura: 'XYZ' },
]

let n = 0
const ev = (cambios: Partial<EvaluacionBasica>): EvaluacionBasica => ({
  id: `e${++n}`,
  modulo_id: 'm-sor',
  titulo: 'RA1',
  tipo: 'examen_teorico',
  fecha: '2026-11-20T08:30:00Z',
  estado: 'pendiente',
  ...cambios,
})

const HOY = '2026-11-13'

describe('proximoExamen', () => {
  it('sin evaluaciones no hay próximo examen', () => {
    expect(proximoExamen([], MODULOS, HOY)).toBeNull()
  })

  it('elige el examen pendiente más cercano y calcula la cuenta atrás', () => {
    const r = proximoExamen(
      [ev({ titulo: 'Lejano', fecha: '2026-12-01T08:00:00Z' }), ev({ titulo: 'Cercano', fecha: '2026-11-18T08:00:00Z' })],
      MODULOS,
      HOY,
    )
    expect(r?.titulo).toBe('Cercano')
    expect(r?.dias).toBe(5)
    expect(r?.fecha).toBe('18/11/2026')
    expect(r?.hora).toBe('09:00') // 08:00 UTC en invierno = 09:00 en Madrid
    expect(r?.tipo).toBe('Teórico')
    expect(r?.modulo).toEqual({ nombre: 'Sistemas Operativos en Red', abreviatura: 'SOR', clase: 'mod-sor' })
  })

  it('ignora prácticas, trabajos y lo que ya no está pendiente', () => {
    const r = proximoExamen(
      [
        ev({ titulo: 'Práctica', tipo: 'practica', fecha: '2026-11-14T08:00:00Z' }),
        ev({ titulo: 'Ya aprobado', estado: 'aprobado', fecha: '2026-11-15T08:00:00Z' }),
        ev({ titulo: 'Recu', tipo: 'recuperacion', fecha: '2026-11-16T08:00:00Z' }),
      ],
      MODULOS,
      HOY,
    )
    expect(r?.titulo).toBe('Recu')
    expect(r?.tipo).toBe('Recuperación')
  })

  it('los de días pasados no cuentan; los de hoy sí, aunque ya haya pasado la hora', () => {
    const r = proximoExamen(
      [ev({ titulo: 'Ayer', fecha: '2026-11-12T08:00:00Z' }), ev({ titulo: 'Hoy temprano', fecha: '2026-11-13T07:00:00Z' })],
      MODULOS,
      HOY,
    )
    expect(r?.titulo).toBe('Hoy temprano')
    expect(r?.dias).toBe(0)
  })

  it('el día es el de Madrid: las 23:30 UTC del 13 ya son el 14 en Madrid', () => {
    const r = proximoExamen([ev({ fecha: '2026-11-13T23:30:00Z' })], MODULOS, HOY)
    expect(r?.dia).toBe('2026-11-14')
    expect(r?.dias).toBe(1)
    expect(r?.hora).toBe('00:30')
  })

  it('un examen sin hora (medianoche en Madrid) no enseña hora', () => {
    const r = proximoExamen([ev({ fecha: '2026-11-19T23:00:00Z' })], MODULOS, HOY) // 00:00 del 20 en Madrid
    expect(r?.dia).toBe('2026-11-20')
    expect(r?.hora).toBeNull()
  })

  it('en verano la hora también es la de Madrid (UTC+2)', () => {
    const r = proximoExamen([ev({ fecha: '2027-06-10T07:00:00Z' })], MODULOS, '2027-06-01')
    expect(r?.hora).toBe('09:00')
  })

  it('módulo sin color propio o que no está en la copia local', () => {
    expect(proximoExamen([ev({ modulo_id: 'm-x' })], MODULOS, HOY)?.modulo?.clase).toBeNull()
    expect(proximoExamen([ev({ modulo_id: 'no-existe' })], MODULOS, HOY)?.modulo).toBeNull()
  })

  it('ignora fechas que no se pueden leer', () => {
    expect(proximoExamen([ev({ fecha: 'mañana' })], MODULOS, HOY)).toBeNull()
  })
})

describe('textos', () => {
  it('cuenta atrás', () => {
    expect(textoCuentaAtras(0)).toBe('Hoy')
    expect(textoCuentaAtras(1)).toBe('Mañana')
    expect(textoCuentaAtras(12)).toBe('En 12 días')
  })

  it('clase de color del módulo', () => {
    expect(claseDeModulo('SOR')).toBe('mod-sor')
    expect(claseDeModulo(' ipe2 ')).toBe('mod-ipe2')
    expect(claseDeModulo('<script>')).toBeNull()
  })
})
