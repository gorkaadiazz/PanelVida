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

describe('proximoExamen: casos límite', () => {
  it('empate exacto de instante: gana el id menor, sin depender del orden de la lista', () => {
    const a = ev({ id: 'a', titulo: 'A', fecha: '2026-11-18T08:00:00Z' })
    const b = ev({ id: 'b', titulo: 'B', fecha: '2026-11-18T08:00:00.000+00:00' })
    expect(proximoExamen([a, b], MODULOS, HOY)?.titulo).toBe('A')
    expect(proximoExamen([b, a], MODULOS, HOY)?.titulo).toBe('A')
  })

  it('mismo día, distinta hora: gana el más temprano', () => {
    const r = proximoExamen(
      [ev({ id: 'a', titulo: 'Tarde', fecha: '2026-11-18T15:00:00Z' }), ev({ id: 'z', titulo: 'Mañana', fecha: '2026-11-18T07:00:00Z' })],
      MODULOS,
      HOY,
    )
    expect(r?.titulo).toBe('Mañana')
  })

  it('mismo instante escrito con otra zona (+02:00) cuenta como empate', () => {
    const r = proximoExamen(
      [ev({ id: 'b', titulo: 'B', fecha: '2026-11-18T08:00:00Z' }), ev({ id: 'a', titulo: 'A', fecha: '2026-11-18T10:00:00+02:00' })],
      MODULOS,
      HOY,
    )
    expect(r?.titulo).toBe('A')
  })

  describe('cambio de hora de octubre (25/10/2026, 03:00 CEST → 02:00 CET)', () => {
    it('medianoche del 25 (aún en verano, UTC+2) es el día 25 y sin hora', () => {
      const r = proximoExamen([ev({ fecha: '2026-10-24T22:00:00Z' })], MODULOS, '2026-10-24')
      expect(r).toMatchObject({ dia: '2026-10-25', hora: null, dias: 1, fecha: '25/10/2026' })
    })

    it('medianoche del 26 (ya en invierno, UTC+1) es el día 26 y sin hora', () => {
      const r = proximoExamen([ev({ fecha: '2026-10-25T23:00:00Z' })], MODULOS, '2026-10-24')
      expect(r).toMatchObject({ dia: '2026-10-26', hora: null, dias: 2 })
    })

    it('las 22:00 UTC del 25 son las 23:00 del 25, no el 26', () => {
      const r = proximoExamen([ev({ fecha: '2026-10-25T22:00:00Z' })], MODULOS, '2026-10-25')
      expect(r).toMatchObject({ dia: '2026-10-25', hora: '23:00', dias: 0 })
    })

    it('la cuenta atrás cruza el cambio sin perder ni ganar un día', () => {
      const r = proximoExamen([ev({ fecha: '2026-10-29T08:00:00Z' })], MODULOS, '2026-10-22')
      expect(r).toMatchObject({ dia: '2026-10-29', hora: '09:00', dias: 7 })
    })
  })

  describe('cambio de hora de marzo (28/03/2027, 02:00 CET → 03:00 CEST)', () => {
    it('medianoche del 28 (aún en invierno, UTC+1) es el 28 y sin hora', () => {
      const r = proximoExamen([ev({ fecha: '2027-03-27T23:00:00Z' })], MODULOS, '2027-03-27')
      expect(r).toMatchObject({ dia: '2027-03-28', hora: null, dias: 1 })
    })

    it('medianoche del 29 (ya en verano, UTC+2) es el 29 y sin hora', () => {
      const r = proximoExamen([ev({ fecha: '2027-03-28T22:00:00Z' })], MODULOS, '2027-03-27')
      expect(r).toMatchObject({ dia: '2027-03-29', hora: null, dias: 2 })
    })

    it('justo después del salto son las 03:00', () => {
      const r = proximoExamen([ev({ fecha: '2027-03-28T01:00:00Z' })], MODULOS, '2027-03-28')
      expect(r).toMatchObject({ dia: '2027-03-28', hora: '03:00', dias: 0 })
    })

    it('la cuenta atrás cruza el cambio sin perder ni ganar un día', () => {
      const r = proximoExamen([ev({ fecha: '2027-04-02T07:00:00Z' })], MODULOS, '2027-03-26')
      expect(r).toMatchObject({ dia: '2027-04-02', hora: '09:00', dias: 7 })
    })
  })

  describe('medianoche en Madrid en verano (UTC+2)', () => {
    it('las 22:00 UTC son las 00:00 del día siguiente: sin hora', () => {
      const r = proximoExamen([ev({ fecha: '2027-06-09T22:00:00Z' })], MODULOS, '2027-06-01')
      expect(r).toMatchObject({ dia: '2027-06-10', hora: null, dias: 9, fecha: '10/06/2027' })
    })

    it('un examen a las 00:00 de hoy sigue contando (dias 0)', () => {
      const r = proximoExamen([ev({ fecha: '2027-06-09T22:00:00Z' })], MODULOS, '2027-06-10')
      expect(r).toMatchObject({ dia: '2027-06-10', hora: null, dias: 0 })
    })

    it('las 21:59 UTC aún son las 23:59 del día anterior (ya pasado si hoy es el 10)', () => {
      expect(proximoExamen([ev({ fecha: '2027-06-09T21:59:00Z' })], MODULOS, '2027-06-09')).toMatchObject({ dia: '2027-06-09', hora: '23:59' })
      expect(proximoExamen([ev({ fecha: '2027-06-09T21:59:00Z' })], MODULOS, '2027-06-10')).toBeNull()
    })
  })

  it('cambio de año', () => {
    const r = proximoExamen([ev({ fecha: '2027-01-08T08:00:00Z' })], MODULOS, '2026-12-30')
    expect(r).toMatchObject({ dia: '2027-01-08', fecha: '08/01/2027', dias: 9 })
  })

  it('el módulo que aún no ha llegado (otra página de la descarga) no cambia qué examen se elige', () => {
    const evals = [ev({ id: 'x1', titulo: 'Sin módulo aún', modulo_id: 'm-tarde', fecha: '2026-11-15T08:00:00Z' }), ev({ id: 'x2', titulo: 'Con módulo', fecha: '2026-11-16T08:00:00Z' })]
    const antes = proximoExamen(evals, MODULOS, HOY)
    expect(antes?.titulo).toBe('Sin módulo aún')
    expect(antes?.modulo).toBeNull()
    const despues = proximoExamen(evals, [...MODULOS, { id: 'm-tarde', nombre: 'Seguridad Informática', abreviatura: 'SI' }], HOY)
    expect(despues?.titulo).toBe('Sin módulo aún')
    expect(despues?.modulo).toEqual({ nombre: 'Seguridad Informática', abreviatura: 'SI', clase: 'mod-si' })
  })

  it.each(['entregado', 'aprobado', 'suspendido'])('el estado «%s» no cuenta como pendiente', (estado) => {
    expect(proximoExamen([ev({ estado, fecha: '2026-11-14T08:00:00Z' })], MODULOS, HOY)).toBeNull()
    const r = proximoExamen([ev({ estado, titulo: 'Hecho', fecha: '2026-11-14T08:00:00Z' }), ev({ titulo: 'Pendiente', fecha: '2026-11-30T08:00:00Z' })], MODULOS, HOY)
    expect(r?.titulo).toBe('Pendiente')
  })

  it.each(['practica', 'trabajo', 'exposicion', 'entrega'])('el tipo «%s» no es examen', (tipo) => {
    expect(proximoExamen([ev({ tipo })], MODULOS, HOY)).toBeNull()
  })

  it('examen práctico', () => {
    expect(proximoExamen([ev({ tipo: 'examen_practico' })], MODULOS, HOY)?.tipo).toBe('Práctico')
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
