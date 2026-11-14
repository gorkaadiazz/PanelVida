import { describe, expect, it } from 'vitest'
import { lunesDe, porcentaje, resumenSemana, textoComparacion } from './semana'

describe('lunes de la semana', () => {
  it('la semana empieza en lunes', () => {
    expect(lunesDe('2026-11-16')).toBe('2026-11-16') // lunes
    expect(lunesDe('2026-11-18')).toBe('2026-11-16') // miércoles
    expect(lunesDe('2026-11-22')).toBe('2026-11-16') // domingo
    expect(lunesDe('2026-11-14')).toBe('2026-11-09') // sábado
  })
  it('cruza meses y años', () => {
    expect(lunesDe('2027-01-01')).toBe('2026-12-28')
  })
})

describe('resumen de la semana', () => {
  const habitos = [
    { id: 'h1', nombre: 'Gym', orden: 0, archivado: false },
    { id: 'h2', nombre: 'Leer', orden: 1, archivado: false },
    { id: 'h3', nombre: 'Viejo', orden: 2, archivado: true },
  ]
  // Hoy: miércoles 18/11/2026 → esta semana lun 16 - mié 18; la pasada, lun 9 - mié 11
  const hoy = '2026-11-18'

  it('compara con los mismos días de la semana pasada', () => {
    const r = resumenSemana(
      {
        habitos,
        marcas: [
          { habito_id: 'h1', fecha: '2026-11-16', hecho: true },
          { habito_id: 'h2', fecha: '2026-11-17', hecho: true },
          { habito_id: 'h2', fecha: '2026-11-18', hecho: false }, // desmarcada
          { habito_id: 'h3', fecha: '2026-11-18', hecho: true }, // archivado: no cuenta
          { habito_id: 'h1', fecha: '2026-11-09', hecho: true },
          { habito_id: 'h1', fecha: '2026-11-12', hecho: true }, // jueves pasado: fuera
        ],
        tareas: [
          { hecha: true, hecha_en: '2026-11-15T23:30:00Z' }, // 00:30 del lunes 16 en Madrid
          { hecha: true, hecha_en: '2026-11-10T10:00:00Z' },
          { hecha: false, hecha_en: null },
          { hecha: true, hecha_en: 'no es una fecha' },
        ],
        movimientos: [
          { tipo: 'ingreso', importe_centimos: 5000, fecha: '2026-11-16' },
          { tipo: 'gasto', importe_centimos: 1200, fecha: '2026-11-18' },
          { tipo: 'gasto', importe_centimos: 1000, fecha: '2026-11-19' }, // mañana: fuera
          { tipo: 'gasto', importe_centimos: 700, fecha: '2026-11-11' },
        ],
      },
      hoy,
    )
    expect(r.desde).toBe('2026-11-16')
    expect(r.dias).toBe(3)
    expect(r.actual).toEqual({ habitosHechos: 2, habitosPosibles: 6, tareasHechas: 1, ahorro: 3800 })
    expect(r.anterior).toEqual({ habitosHechos: 1, habitosPosibles: 6, tareasHechas: 1, ahorro: -700 })
  })

  it('el lunes cuenta un solo día; sin hábitos, nada posible', () => {
    const r = resumenSemana({ habitos: [], marcas: [], tareas: [], movimientos: [] }, '2026-11-16')
    expect(r.dias).toBe(1)
    expect(r.actual).toEqual({ habitosHechos: 0, habitosPosibles: 0, tareasHechas: 0, ahorro: 0 })
  })
})

describe('textos', () => {
  it('porcentaje entero y 0 si no había nada', () => {
    expect(porcentaje(2, 6)).toBe(33)
    expect(porcentaje(0, 0)).toBe(0)
  })
  it('compara en palabras', () => {
    expect(textoComparacion(5, 2)).toBe('3 más que la semana pasada')
    expect(textoComparacion(2, 5)).toBe('3 menos que la semana pasada')
    expect(textoComparacion(4, 4)).toBe('igual que la semana pasada')
    expect(textoComparacion(-100, 500, (n) => `${n / 100} €`)).toBe('6 € menos que la semana pasada')
  })
})
