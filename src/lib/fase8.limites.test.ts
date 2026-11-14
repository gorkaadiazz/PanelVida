// Casos límite de la fase 8 (cumpleaños, planes, deseos e ideas): lógica pura.

import { describe, expect, it } from 'vitest'
import { esBisiesto, fechaEnAnio, ordenarPorProximo, proximo, proximosDias, textoCuentaAtras, validarCumple } from './cumpleanos'
import { historial, ordenarDeseos, repartirAhorro, validarDeseo, type DeseoBasico } from './deseos'
import { hoy } from './fechas'
import { notasDeIdea, tituloDeIdea, validarIdea, ideasSinProcesar } from './ideas'
import { ErrorDeValidacion, estadoTrasGuardar, filtrarPlanes, ordenarPlanes, proximoPlan, validarPlan, validarValoracion, type PlanBasico } from './planes'

const c = (dia: number, mes: number, anio: number | null = null, nombre = 'Ana') => ({ id: nombre, nombre, dia, mes, anio })

describe('cumpleaños: 29 de febrero alrededor de los bisiestos', () => {
  const bisiesto = c(29, 2, 2004)
  it.each([
    // hoy,          fecha que toca, días, edad
    ['2027-01-01', '2027-02-28', 58, 23],
    ['2027-02-27', '2027-02-28', 1, 23],
    ['2027-02-28', '2027-02-28', 0, 23], // en año no bisiesto, hoy es el día
    ['2027-03-01', '2028-02-29', 365, 24], // ya pasó: el siguiente es en bisiesto
    ['2028-02-28', '2028-02-29', 1, 24], // en bisiesto NO se adelanta al 28
    ['2028-02-29', '2028-02-29', 0, 24],
    ['2028-03-01', '2029-02-28', 364, 25],
    ['2027-12-31', '2028-02-29', 60, 24], // fin de año: el siguiente cae en bisiesto
  ])('hoy %s → %s (en %i días, cumple %i)', (dia, fecha, dias, edad) => {
    expect(proximo(bisiesto, dia)).toMatchObject({ fecha, dias, edad })
  })
  it('1900 y 2100 no son bisiestos; 2000 sí', () => {
    expect([1900, 2000, 2024, 2100].map(esBisiesto)).toEqual([false, true, true, false])
    expect(fechaEnAnio(29, 2, 2100)).toBe('2100-02-28')
    expect(proximo(c(29, 2), '2099-03-01')).toMatchObject({ fecha: '2100-02-28', dias: 364 })
  })
  it('un 28 de febrero y un 29 en año no bisiesto caen el mismo día (desempate por nombre)', () => {
    const lista = [c(29, 2, null, 'Zoe'), c(28, 2, null, 'Bea'), c(1, 3, null, 'Ana')]
    expect(ordenarPorProximo(lista, '2027-02-20').map((p) => `${p.cumple.nombre} ${p.dias}`)).toEqual(['Bea 8', 'Zoe 8', 'Ana 9'])
    // En bisiesto, el 29 va después del 28
    expect(ordenarPorProximo(lista, '2028-02-20').map((p) => `${p.cumple.nombre} ${p.dias}`)).toEqual(['Bea 8', 'Zoe 9', 'Ana 10'])
  })
})

describe('cumpleaños: fin de año y edad', () => {
  it('31/12 y 1/1 alrededor de Nochevieja', () => {
    expect(proximo(c(31, 12, 2000), '2026-12-31')).toMatchObject({ fecha: '2026-12-31', dias: 0, edad: 26 })
    expect(proximo(c(31, 12, 2000), '2027-01-01')).toMatchObject({ fecha: '2027-12-31', dias: 364, edad: 27 })
    expect(proximo(c(1, 1, 2000), '2026-12-31')).toMatchObject({ fecha: '2027-01-01', dias: 1, edad: 27 })
  })
  it('la tarjeta de 7 días cruza el año', () => {
    const lista = [c(1, 1, null, 'Uno'), c(4, 1, null, 'Cuatro'), c(5, 1, null, 'Cinco'), c(28, 12, null, 'Hoy')]
    expect(proximosDias(lista, '2026-12-28').map((p) => `${p.cumple.nombre} ${p.dias}`)).toEqual(['Hoy 0', 'Uno 4', 'Cuatro 7'])
  })
  it('el mismo día cumple los años de hoy; al día siguiente, la edad del año que viene', () => {
    expect(proximo(c(14, 11, 2000), '2026-11-14')).toMatchObject({ dias: 0, edad: 26 })
    expect(proximo(c(14, 11, 2000), '2026-11-15')).toMatchObject({ dias: 364, edad: 27 })
    expect(proximo(c(14, 11, 2000), '2026-11-13')).toMatchObject({ dias: 1, edad: 26 })
  })
  it('la edad nunca es negativa', () => {
    expect(proximo(c(1, 1, 2026), '2026-11-14').edad).toBe(1) // nacido este año: el próximo, cumple 1
  })
})

describe('cumpleaños: cuenta atrás a medianoche en Madrid', () => {
  const quince = c(15, 11)
  it('invierno (UTC+1): a las 23:59:59 aún es «mañana»; a las 00:00 ya es «hoy»', () => {
    expect(textoCuentaAtras(proximo(quince, hoy(new Date('2026-11-14T22:59:59.999Z'))).dias)).toBe('mañana')
    expect(textoCuentaAtras(proximo(quince, hoy(new Date('2026-11-14T23:00:00.000Z'))).dias)).toBe('hoy')
  })
  it('verano (UTC+2): cambia a las 22:00 UTC', () => {
    const julio = c(15, 7)
    expect(proximo(julio, hoy(new Date('2026-07-14T21:59:59Z'))).dias).toBe(1)
    expect(proximo(julio, hoy(new Date('2026-07-14T22:00:00Z'))).dias).toBe(0)
  })
  it('a través del cambio de hora los días siguen siendo enteros', () => {
    expect(proximo(c(30, 3), '2026-03-28').dias).toBe(2) // 29/3: horario de verano
    expect(proximo(c(26, 10), '2026-10-24').dias).toBe(2) // 25/10: horario de invierno
    expect(proximo(c(27, 3), '2026-03-28').dias).toBe(364)
  })
  it('textos', () => {
    expect([0, 1, 2, 364, -1].map(textoCuentaAtras)).toEqual(['hoy', 'mañana', 'en 2 días', 'en 364 días', 'hoy'])
  })
})

describe('cumpleaños: validar', () => {
  const v = (dia: string, mes: string, anio = '') => validarCumple({ nombre: 'x', dia, mes, anio, notas: '' }, '2026-11-14')
  it('días que no existen y años fuera de rango', () => {
    for (const [d, m] of [['31', '4'], ['30', '2'], ['0', '1'], ['32', '1'], ['1', '13'], ['1', '0'], ['1,5', '1'], ['', '1']]) {
      expect(() => v(d, m), `${d}/${m}`).toThrow(ErrorDeValidacion)
    }
    expect(() => v('1', '1', '1899')).toThrow(ErrorDeValidacion)
    expect(() => v('1', '1', '2027')).toThrow(ErrorDeValidacion) // futuro
    expect(() => v('29', '2', '1900')).toThrow(/no fue bisiesto/)
    expect(v('29', '2', '2000')).toMatchObject({ dia: 29, mes: 2, anio: 2000 })
    // Nacido este año: vale hasta hoy, no una fecha que aún no ha llegado
    expect(() => v('31', '12', '2026')).toThrow(/aún no ha llegado/)
    expect(v('1', '1', '2026')).toMatchObject({ anio: 2026 })
  })
})

// ---------------------------------------------------------------------------

const plan = (id: string, estado: string, fecha: string | null, tipo = 'otro', created_at = '2026-11-01T00:00:00Z'): PlanBasico => ({ id, titulo: id, tipo, fecha, estado, created_at })

describe('planes: próximo plan y fechas pasadas', () => {
  it('cuenta el de hoy, no los pasados ni los hechos; cruza el año', () => {
    const lista = [plan('ayer', 'planeado', '2026-12-30'), plan('hecho', 'hecho', '2027-01-01'), plan('año nuevo', 'planeado', '2027-01-01'), plan('luego', 'planeado', '2027-02-01')]
    expect(proximoPlan(lista, '2026-12-31')?.id).toBe('año nuevo')
    expect(proximoPlan([...lista, plan('hoy', 'planeado', '2026-12-31')], '2026-12-31')?.id).toBe('hoy')
    expect(proximoPlan([plan('ayer', 'planeado', '2026-12-30'), plan('idea', 'idea', null)], '2026-12-31')).toBeNull()
    expect(proximoPlan([], '2026-12-31')).toBeNull()
    // Un hecho con fecha futura (lo hiciste antes de tiempo) no es el próximo
    expect(proximoPlan([plan('adelantado', 'hecho', '2027-01-01'), plan('luego', 'planeado', '2027-01-02')], '2026-12-31')?.id).toBe('luego')
    expect(proximoPlan([plan('adelantado', 'hecho', '2027-01-01')], '2026-12-31')).toBeNull()
  })
  it('mismo día: desempata por título; el orden de la lista no importa', () => {
    const a = [plan('Zumba', 'planeado', '2026-12-01'), plan('Bolos', 'planeado', '2026-12-01')]
    expect(proximoPlan(a, '2026-11-14')?.id).toBe('Bolos')
    expect(proximoPlan([...a].reverse(), '2026-11-14')?.id).toBe('Bolos')
  })
  it('un planeado ya pasado sigue arriba en la lista (antes que los futuros)', () => {
    const lista = [plan('futuro', 'planeado', '2026-12-01'), plan('pasado', 'planeado', '2026-10-01'), plan('idea', 'idea', null), plan('hecho', 'hecho', '2026-09-01')]
    expect(ordenarPlanes(lista).map((p) => p.id)).toEqual(['pasado', 'futuro', 'idea', 'hecho'])
  })
  it('hechos: el más reciente primero; un hecho sin fecha va al final', () => {
    const lista = [plan('sin', 'hecho', null), plan('viejo', 'hecho', '2026-01-01'), plan('nuevo', 'hecho', '2026-11-01')]
    expect(ordenarPlanes(lista).map((p) => p.id)).toEqual(['nuevo', 'viejo', 'sin'])
  })
})

describe('planes: transiciones', () => {
  it('estado tras guardar en todas las combinaciones', () => {
    expect(estadoTrasGuardar('idea', null)).toBe('idea')
    expect(estadoTrasGuardar('idea', '2026-12-01')).toBe('planeado')
    expect(estadoTrasGuardar('planeado', '2026-12-01')).toBe('planeado')
    expect(estadoTrasGuardar('planeado', null)).toBe('idea')
    expect(estadoTrasGuardar('hecho', null)).toBe('hecho')
    expect(estadoTrasGuardar('hecho', '2020-01-01')).toBe('hecho')
  })
  it('una fecha pasada se puede guardar (planes de antes)', () => {
    expect(validarPlan({ titulo: 'x', tipo: 'viaje', con_quien: '', fecha: '2020-02-29', coste: '', notas: '' }).fecha).toBe('2020-02-29')
  })
  it('fechas imposibles no', () => {
    for (const fecha of ['2026-02-29', '2026-13-01', '2026-04-31', '14/11/2026', '2026-1-1']) {
      expect(() => validarPlan({ titulo: 'x', tipo: 'viaje', con_quien: '', fecha, coste: '', notas: '' }), fecha).toThrow(ErrorDeValidacion)
    }
  })
  it('valoración: solo enteros del 1 al 5', () => {
    for (const mal of ['0', '6', '3.5', 'tres', -1, 2.5, ' ']) expect(() => validarValoracion(mal), String(mal)).toThrow(ErrorDeValidacion)
    expect([1, '5', null, undefined, ''].map((x) => validarValoracion(x))).toEqual([1, 5, null, null, null])
  })
  it('coste con decimales en céntimos enteros', () => {
    const p = validarPlan({ titulo: 'x', tipo: 'comida', con_quien: '', fecha: '', coste: '12,05', notas: '' })
    expect(p.coste_centimos).toBe(1205)
    expect(Number.isInteger(p.coste_centimos)).toBe(true)
    expect(() => validarPlan({ titulo: 'x', tipo: 'comida', con_quien: '', fecha: '', coste: '-5', notas: '' })).toThrow(ErrorDeValidacion)
    expect(() => validarPlan({ titulo: 'x', tipo: 'restaurante', con_quien: '', fecha: '', coste: '', notas: '' })).toThrow(ErrorDeValidacion)
  })
})

describe('planes: filtros combinados', () => {
  const lista = [
    plan('a', 'idea', null, 'viaje'),
    plan('b', 'planeado', '2026-12-01', 'viaje'),
    plan('c', 'planeado', '2026-12-02', 'comida'),
    plan('d', 'hecho', '2026-10-01', 'viaje'),
    plan('e', 'hecho', '2026-10-02', 'sitio'),
  ]
  it.each([
    ['todos', 'todos', ['a', 'b', 'c', 'd', 'e']],
    ['planeado', 'todos', ['b', 'c']],
    ['todos', 'viaje', ['a', 'b', 'd']],
    ['hecho', 'viaje', ['d']],
    ['planeado', 'viaje', ['b']],
    ['idea', 'comida', []],
    ['hecho', 'actividad', []],
  ] as const)('estado %s + tipo %s', (estado, tipo, esperado) => {
    expect(filtrarPlanes(lista, estado, tipo).map((p) => p.id)).toEqual(esperado)
  })
})

// ---------------------------------------------------------------------------

const deseo = (id: string, precio_centimos: number, prioridad = 'media', created_at = '2026-11-01T00:00:00Z', comprado = false): DeseoBasico & { comprado_en: string | null } => ({
  id,
  articulo: id,
  precio_centimos,
  prioridad,
  comprado,
  created_at,
  comprado_en: comprado ? '2026-11-10' : null,
})

describe('deseos: reparto del ahorro', () => {
  it('con ahorro negativo nadie recibe nada y no hay números raros', () => {
    const r = repartirAhorro([deseo('a', 1000, 'alta'), deseo('b', 1, 'baja')], -50_000)
    expect(r.map((x) => [x.deseo.id, x.cubierto, x.falta, x.teLlega, x.porcentaje])).toEqual([
      ['a', 0, 1000, false, 0],
      ['b', 0, 1, false, 0],
    ])
  })
  it('en orden de prioridad: un artículo barato de prioridad baja espera aunque el ahorro le llegaría', () => {
    const r = repartirAhorro([deseo('barato', 500, 'baja'), deseo('caro', 10_000, 'alta')], 2_000)
    expect(r.map((x) => [x.deseo.id, x.cubierto, x.falta])).toEqual([
      ['caro', 2_000, 8_000],
      ['barato', 0, 500],
    ])
  })
  it('céntimos exactos: te llega justo; un céntimo menos, te falta 1 céntimo y la barra no llega al 100', () => {
    expect(repartirAhorro([deseo('a', 5999)], 5999)[0]).toMatchObject({ teLlega: true, falta: 0, porcentaje: 100 })
    expect(repartirAhorro([deseo('a', 5999)], 5998)[0]).toMatchObject({ teLlega: false, falta: 1, porcentaje: 99 })
    expect(repartirAhorro([deseo('a', 5999), deseo('b', 1)], 6000).map((x) => x.teLlega)).toEqual([true, true])
  })
  it('lo repartido nunca supera el ahorro ni la suma de precios, y todo son enteros', () => {
    const lista = [deseo('a', 333, 'alta'), deseo('b', 777, 'media'), deseo('c', 1, 'baja'), deseo('d', 50_000, 'baja', '2026-11-02T00:00:00Z')]
    for (const ahorro of [-1, 0, 1, 333, 334, 1110, 1111, 51_110, 51_111, 10_000_000]) {
      const r = repartirAhorro(lista, ahorro)
      const total = r.reduce((s, x) => s + x.cubierto, 0)
      expect(total).toBe(Math.min(Math.max(0, ahorro), 51_111))
      for (const x of r) {
        expect(Number.isInteger(x.cubierto) && Number.isInteger(x.falta) && Number.isInteger(x.porcentaje)).toBe(true)
        expect(x.cubierto + x.falta).toBe(x.deseo.precio_centimos)
        expect(x.porcentaje).toBeGreaterThanOrEqual(0)
        expect(x.porcentaje).toBeLessThanOrEqual(100)
        expect(x.teLlega).toBe(x.porcentaje === 100)
      }
    }
  })
  it('precio enorme (tope del servidor): la cuenta sigue siendo exacta', () => {
    const tope = 100_000_000_000 - 1
    expect(repartirAhorro([deseo('casa', tope)], 1)[0]).toMatchObject({ cubierto: 1, falta: tope - 1, porcentaje: 0 })
    expect(repartirAhorro([deseo('casa', tope)], tope - 1)[0]).toMatchObject({ falta: 1, porcentaje: 99, teLlega: false })
    expect(repartirAhorro([deseo('casa', tope)], Number.MAX_SAFE_INTEGER)[0]).toMatchObject({ falta: 0, porcentaje: 100 })
    expect(validarDeseo({ articulo: 'x', precio: '999.999.999,99', prioridad: 'alta', enlace: '', notas: '' }).precio_centimos).toBe(tope)
    expect(() => validarDeseo({ articulo: 'x', precio: '1.000.000.000', prioridad: 'alta', enlace: '', notas: '' })).toThrow(ErrorDeValidacion)
    expect(() => validarDeseo({ articulo: 'x', precio: '0', prioridad: 'alta', enlace: '', notas: '' })).toThrow(ErrorDeValidacion)
  })
  it('empates de prioridad: el más antiguo primero; con la misma fecha, por id; no depende del orden de entrada', () => {
    const lista = [deseo('z', 100, 'alta', '2026-11-01T00:00:00Z'), deseo('a', 100, 'alta', '2026-11-01T00:00:00Z'), deseo('viejo', 100, 'alta', '2026-10-01T00:00:00Z')]
    const esperado = ['viejo', 'a', 'z']
    expect(ordenarDeseos(lista).map((d) => d.id)).toEqual(esperado)
    expect(ordenarDeseos([...lista].reverse()).map((d) => d.id)).toEqual(esperado)
    expect(repartirAhorro(lista, 150).map((x) => x.cubierto)).toEqual([100, 50, 0])
  })
  it('los comprados no se llevan ahorro; una prioridad desconocida va al final', () => {
    const r = repartirAhorro([deseo('comprado', 1000, 'alta', undefined, true), deseo('raro', 100, 'urgente'), deseo('baja', 100, 'baja')], 100)
    expect(r.map((x) => [x.deseo.id, x.cubierto])).toEqual([
      ['baja', 100],
      ['raro', 0],
    ])
  })
  it('no cambia la lista que recibe', () => {
    const lista = [deseo('b', 1, 'baja'), deseo('a', 1, 'alta')]
    ordenarDeseos(lista)
    historial(lista)
    expect(lista.map((d) => d.id)).toEqual(['b', 'a'])
  })
})

// ---------------------------------------------------------------------------

describe('ideas: límites', () => {
  it('solo saltos de línea o espacios no es una idea', () => {
    expect(() => validarIdea('\n\n  \t\n')).toThrow(ErrorDeValidacion)
  })
  it('el límite se mide después de limpiar', () => {
    expect(validarIdea(`  ${'a'.repeat(500)}  `)).toHaveLength(500)
    expect(validarIdea(`a\n\n\n\n\nb`)).toBe('a\n\nb')
  })
  it('título y notas al convertir: título exacto al máximo sin «…», uno más con «…»', () => {
    expect(tituloDeIdea('abcde', 5)).toBe('abcde')
    expect(tituloDeIdea('abcdef', 5)).toBe('abcd…')
    expect(tituloDeIdea('abcdef', 5)).toHaveLength(5)
    expect(notasDeIdea('título')).toBe('')
    expect(notasDeIdea('título\nlínea 2\n\nlínea 3')).toBe('línea 2\n\nlínea 3')
  })
  it('la bandeja no cambia la lista que recibe y desempata por id', () => {
    const lista = [
      { id: 'b', texto: 'x', archivada: false, created_at: '2026-11-14T10:00:00Z' },
      { id: 'a', texto: 'y', archivada: false, created_at: '2026-11-14T10:00:00Z' },
    ]
    expect(ideasSinProcesar(lista).map((i) => i.id)).toEqual(['a', 'b'])
    expect(lista.map((i) => i.id)).toEqual(['b', 'a'])
  })
})
