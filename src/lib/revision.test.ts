// Revisión semanal y mensual: periodos, comparaciones, las cuatro reglas de
// sugerencias, sus textos y la lectura segura de lo guardado.
// El lunes 16/11/2026 se revisa la semana del 9 al 15.
import { describe, expect, it } from 'vitest'
import { formatearEuros as eur } from './dinero'
import {
  ahorroDeRecortes,
  calcularRevision,
  cambio,
  hayMovimientos,
  leerDatosRevision,
  nombrePeriodo,
  periodoAnterior,
  periodoTerminado,
  textoCambio,
  textoSugerencia,
  type EntradaRevision,
  type FijoRevision,
  type MovimientoRevision,
  type Sugerencia,
} from './revision'

const SEMANA = periodoTerminado('semanal', '2026-11-16')
let n = 0
const mov = (fecha: string, importe: number, c: Partial<MovimientoRevision> = {}): MovimientoRevision => ({
  id: `m${++n}`,
  tipo: 'gasto',
  concepto: 'Algo',
  importe_centimos: importe,
  fecha,
  categoria: null,
  necesidad: null,
  fijo_id: null,
  ...c,
})
const fijo = (concepto: string, importe: number, c: Partial<FijoRevision> = {}): FijoRevision => ({
  id: `f-${concepto}`,
  tipo: 'gasto',
  concepto,
  importe_centimos: importe,
  frecuencia: 'mensual',
  categoria: null,
  necesidad: null,
  activo: true,
  ...c,
})
const entrada = (e: Partial<EntradaRevision>): EntradaRevision => ({ periodo: SEMANA, movimientos: [], fijos: [], deseos: [], meta: null, hoy: '2026-11-16', ...e })

describe('periodos', () => {
  it('la semana terminada es la de lunes a domingo anterior a hoy', () => {
    expect(periodoTerminado('semanal', '2026-11-16')).toEqual({ tipo: 'semanal', inicio: '2026-11-09', fin: '2026-11-15' })
    // El domingo aún no ha terminado su semana: la terminada es la anterior
    expect(periodoTerminado('semanal', '2026-11-15')).toEqual({ tipo: 'semanal', inicio: '2026-11-02', fin: '2026-11-08' })
  })
  it('el mes terminado es el anterior entero (también febrero y el cambio de año)', () => {
    expect(periodoTerminado('mensual', '2026-12-01')).toEqual({ tipo: 'mensual', inicio: '2026-11-01', fin: '2026-11-30' })
    expect(periodoTerminado('mensual', '2026-03-01')).toEqual({ tipo: 'mensual', inicio: '2026-02-01', fin: '2026-02-28' })
    expect(periodoTerminado('mensual', '2027-01-15')).toEqual({ tipo: 'mensual', inicio: '2026-12-01', fin: '2026-12-31' })
  })
  it('el periodo anterior', () => {
    expect(periodoAnterior(SEMANA)).toEqual({ tipo: 'semanal', inicio: '2026-11-02', fin: '2026-11-08' })
    expect(periodoAnterior({ tipo: 'mensual', inicio: '2026-03-01', fin: '2026-03-31' }, 2)).toEqual({ tipo: 'mensual', inicio: '2026-01-01', fin: '2026-01-31' })
  })
  it('solo hay revisión si hubo movimientos en el periodo', () => {
    expect(hayMovimientos([mov('2026-11-08', 1)], SEMANA)).toBe(false)
    expect(hayMovimientos([mov('2026-11-15', 1)], SEMANA)).toBe(true)
  })
  it('nombre del periodo', () => {
    expect(nombrePeriodo(SEMANA)).toBe('semana del 9 al 15 de noviembre')
    expect(nombrePeriodo({ tipo: 'semanal', inicio: '2026-11-30', fin: '2026-12-06' })).toBe('semana del 30 de noviembre al 6 de diciembre')
    expect(nombrePeriodo({ tipo: 'mensual', inicio: '2026-11-01', fin: '2026-11-30' })).toBe('noviembre de 2026')
  })
})

describe('comparaciones', () => {
  it('subidas y bajadas en € y %', () => {
    expect(cambio(1500, 1000)).toEqual({ diferencia: 500, porcentaje: 50 })
    expect(cambio(900, 1000)).toEqual({ diferencia: -100, porcentaje: -10 })
    expect(cambio(800, 0)).toEqual({ diferencia: 800, porcentaje: null })
    expect(textoCambio(1500, 1000)).toBe(`+${eur(500)} (+50 %)`)
    expect(textoCambio(900, 1000)).toBe(`−${eur(100)} (−10 %)`)
    expect(textoCambio(800, 0)).toBe(`+${eur(800)} (antes 0)`)
    expect(textoCambio(5, 5)).toBe('igual')
  })

  it('gastos e ingresos del periodo frente al anterior, y por categoría', () => {
    const d = calcularRevision(
      entrada({
        movimientos: [
          mov('2026-11-10', 3000, { categoria: 'comida' }),
          mov('2026-11-12', 1000, { categoria: 'ocio' }),
          mov('2026-11-14', 5000, { tipo: 'ingreso' }),
          mov('2026-11-03', 2000, { categoria: 'comida' }),
          mov('2026-11-04', 500, { categoria: 'transporte' }),
        ],
      }),
    )
    expect(d).toMatchObject({ gastos: 4000, ingresos: 5000, gastos_anterior: 2500, ingresos_anterior: 0 })
    expect(d.categorias.map((c) => [c.categoria, c.actual, c.anterior])).toEqual([
      ['comida', 3000, 2000],
      ['ocio', 1000, 0],
      ['transporte', 0, 500],
    ])
  })

  it('totales de fijos y de prescindibles', () => {
    const f = fijo('Gimnasio', 3000)
    const d = calcularRevision(
      entrada({
        fijos: [f, fijo('Café', 150, { frecuencia: 'diaria' }), fijo('Pausado', 9999, { activo: false })],
        movimientos: [mov('2026-11-10', 3000, { fijo_id: f.id }), mov('2026-11-11', 800, { necesidad: 'prescindible' })],
      }),
    )
    expect(d.fijos_mes).toBe(3000 + 4563)
    expect(d.fijos_periodo).toBe(3000)
    expect(d.prescindibles).toBe(800)
  })
})

describe('sugerencias', () => {
  it('1. prescindibles del periodo agrupados por concepto, de mayor a menor (sin los de fijos)', () => {
    const d = calcularRevision(
      entrada({
        fijos: [fijo('Netflix', 999, { necesidad: 'prescindible' })],
        movimientos: [
          mov('2026-11-10', 900, { concepto: 'Cine', necesidad: 'prescindible' }),
          mov('2026-11-13', 900, { concepto: ' cine ', necesidad: 'prescindible' }),
          mov('2026-11-12', 1200, { concepto: 'Ropa', necesidad: 'prescindible' }),
          mov('2026-11-12', 300, { concepto: 'Chuches', necesidad: 'prescindible' }),
          mov('2026-11-12', 200, { concepto: 'Kebab', necesidad: 'prescindible' }),
          mov('2026-11-12', 5000, { concepto: 'Súper', necesidad: 'esencial' }),
          mov('2026-11-12', 999, { concepto: 'Netflix', necesidad: 'prescindible', fijo_id: 'f-Netflix' }),
          mov('2026-11-05', 9000, { concepto: 'Fuera del periodo', necesidad: 'prescindible' }),
        ],
      }),
    )
    const prescindibles = d.sugerencias.filter((s) => s.regla === 'prescindible')
    expect(prescindibles.map((s) => [s.titulo, s.importe])).toEqual([
      ['Cine', 1800],
      ['Ropa', 1200],
      ['Chuches', 300],
    ])
    // De la semana al mes: × 30,42 / 7
    expect(prescindibles[0].ahorro_mes).toBe(Math.round((1800 * 365) / 12 / 7))
    expect(prescindibles[0].ahorro_anio).toBe(prescindibles[0].ahorro_mes * 12)
  })

  it('2. fijos más caros en su equivalente al mes, sin los esenciales ni los pausados', () => {
    const d = calcularRevision(
      entrada({
        fijos: [
          fijo('Alquiler', 50000, { necesidad: 'esencial' }),
          fijo('Café', 150, { frecuencia: 'diaria' }),
          fijo('Gimnasio', 3000),
          fijo('Spotify', 1099, { necesidad: 'prescindible' }),
          fijo('Seguro', 12000, { frecuencia: 'anual' }),
          fijo('Pausado', 99999, { activo: false }),
          fijo('Paga', 5000, { tipo: 'ingreso' }),
        ],
      }),
    )
    expect(d.sugerencias.filter((s) => s.regla === 'fijo_caro').map((s) => [s.titulo, s.ahorro_mes])).toEqual([
      ['Café', 4563],
      ['Gimnasio', 3000],
      ['Spotify', 1099],
    ])
  })

  it('3. categorías muy por encima de su media de las semanas anteriores', () => {
    const semanas = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']
    const movimientos = [
      ...semanas.flatMap((d) => [mov(d, 2000, { categoria: 'ocio' }), mov(d, 5000, { categoria: 'comida' })]),
      mov('2026-11-10', 6000, { categoria: 'ocio' }), // 3 × la media
      mov('2026-11-10', 5400, { categoria: 'comida' }), // +8 %: no
    ]
    const d = calcularRevision(entrada({ movimientos }))
    expect(d.categorias.find((c) => c.categoria === 'ocio')).toMatchObject({ actual: 6000, anterior: 2000, media: 2000 })
    const subidas = d.sugerencias.filter((s) => s.regla === 'categoria_sube')
    expect(subidas).toHaveLength(1)
    expect(subidas[0]).toMatchObject({ titulo: 'Ocio', importe: 6000, media: 2000, ahorro_mes: Math.round((4000 * 365) / 12 / 7) })
  })

  it('3. sin historial no hay media (un usuario nuevo no ve «sube mucho» en todo)', () => {
    const d = calcularRevision(entrada({ movimientos: [mov('2026-11-10', 6000, { categoria: 'ocio' })] }))
    expect(d.categorias[0].media).toBeNull()
    expect(d.sugerencias.some((s) => s.regla === 'categoria_sube')).toBe(false)
  })

  it('3. una subida pequeña en euros no cuenta aunque en % sea mucho', () => {
    const movimientos = [mov('2026-11-02', 100, { categoria: 'ocio' }), mov('2026-11-10', 400, { categoria: 'ocio' })]
    const d = calcularRevision(entrada({ movimientos }))
    expect(d.sugerencias.some((s) => s.regla === 'categoria_sube')).toBe(false)
  })

  it('4. suscripciones de la misma categoría a la vez: propone quitar la más barata', () => {
    const d = calcularRevision(
      entrada({
        fijos: [
          fijo('Netflix', 1299, { categoria: 'suscripciones' }),
          fijo('HBO', 999, { categoria: 'suscripciones' }),
          fijo('Disney', 899, { categoria: 'suscripciones', necesidad: 'esencial' }),
          fijo('Bus', 2000, { categoria: 'transporte' }),
          fijo('Metro', 4000, { categoria: 'transporte' }),
        ],
      }),
    )
    const solapados = d.sugerencias.filter((s) => s.regla === 'solapados')
    expect(solapados).toEqual([expect.objectContaining({ titulo: 'HBO', conceptos: ['HBO', 'Netflix'], ahorro_mes: 999 })])
    // No se suma al escenario «con recortes» (ya está en «fijos más caros»)
    expect(ahorroDeRecortes(d.sugerencias)).toBe(d.sugerencias.filter((s) => s.regla !== 'solapados').reduce((t, s) => t + s.ahorro_mes, 0))
  })

  it('impacto en la meta: cuánto antes llegas con cada recorte', () => {
    // Un ingreso de 1.104 € hace 92 días (la ventana de 3 meses): 365 €/mes a mano,
    // menos el gimnasio (30 €/mes) = ritmo de 335 €/mes. Meta 2.000 €: faltan 896 €.
    // A 335 €/mes se tarda 82 días; sin el gimnasio (365 €/mes), 75: 7 días antes.
    const d = calcularRevision(entrada({ movimientos: [mov('2026-08-17', 110400, { tipo: 'ingreso' })], meta: 200000, fijos: [fijo('Gimnasio', 3000)] }))
    expect(d.ritmo).toBe(33500)
    expect(d.sugerencias.find((s) => s.titulo === 'Gimnasio')?.impacto).toEqual({ tipo: 'antes', dias: 7 })
    expect(d.llegada_meta).toBe('2027-02-06')
  })

  it('sin meta no hay impacto', () => {
    const d = calcularRevision(entrada({ fijos: [fijo('Gimnasio', 3000)] }))
    expect(d.sugerencias[0].impacto).toBeNull()
  })

  it('lo que falta para cada deseo, en orden de prioridad', () => {
    const deseo = (articulo: string, precio: number, prioridad: string) => ({ id: articulo, articulo, precio_centimos: precio, prioridad, comprado: false, created_at: '2026-11-01T00:00:00Z' })
    const d = calcularRevision(
      entrada({ movimientos: [mov('2026-11-10', 30000, { tipo: 'ingreso' })], deseos: [deseo('Cascos', 20000, 'baja'), deseo('Bici', 25000, 'alta')] }),
    )
    expect(d.ahorro_total).toBe(30000)
    expect(d.deseos).toEqual([{ articulo: 'Cascos', falta: 15000 }])
  })
})

describe('escenario «con recortes» sin contar dos veces', () => {
  const s = (c: Partial<Sugerencia>): Sugerencia => ({ regla: 'prescindible', titulo: 'x', importe: 0, ahorro_mes: 0, ahorro_anio: 0, impacto: null, ...c })

  it('de una categoría que sube solo suma lo que no cubren sus prescindibles', () => {
    const sugerencias = [
      s({ regla: 'prescindible', titulo: 'Cine', categoria: 'ocio', ahorro_mes: 3000 }),
      s({ regla: 'prescindible', titulo: 'Ropa', categoria: 'compras', ahorro_mes: 2000 }),
      s({ regla: 'fijo_caro', titulo: 'Gimnasio', ahorro_mes: 3500 }),
      s({ regla: 'categoria_sube', titulo: 'Ocio', categoria: 'ocio', ahorro_mes: 5000 }), // 3.000 ya están en «Cine»
      s({ regla: 'categoria_sube', titulo: 'Comida', categoria: 'comida', ahorro_mes: 1500 }),
      s({ regla: 'solapados', titulo: 'HBO', ahorro_mes: 999 }),
    ]
    expect(ahorroDeRecortes(sugerencias)).toBe(3000 + 2000 + 3500 + (5000 - 3000) + 1500)
  })
  it('si los prescindibles cubren toda la subida, la subida no suma nada', () => {
    expect(ahorroDeRecortes([s({ categoria: 'ocio', ahorro_mes: 6000 }), s({ regla: 'categoria_sube', categoria: 'ocio', ahorro_mes: 4000 })])).toBe(6000)
  })
  it('«sin categoría» también se descuenta entre sí', () => {
    expect(ahorroDeRecortes([s({ categoria: null, ahorro_mes: 1000 }), s({ regla: 'categoria_sube', categoria: null, ahorro_mes: 2500 })])).toBe(2500)
  })
  it('las revisiones de antes (sin categoría guardada) suman como antes', () => {
    expect(ahorroDeRecortes([s({ ahorro_mes: 1000 }), s({ regla: 'categoria_sube', ahorro_mes: 2500 })])).toBe(3500)
  })
  it('de punta a punta: el cine prescindible y la subida del ocio no se suman enteros', () => {
    const semanas = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']
    const d = calcularRevision(
      entrada({
        movimientos: [
          ...semanas.map((f) => mov(f, 2000, { categoria: 'ocio' })),
          mov('2026-11-10', 3000, { concepto: 'Cine', categoria: 'ocio', necesidad: 'prescindible' }),
          mov('2026-11-11', 3000, { concepto: 'Bolera', categoria: 'ocio' }),
        ],
      }),
    )
    const cine = d.sugerencias.find((x) => x.regla === 'prescindible')!
    const ocio = d.sugerencias.find((x) => x.regla === 'categoria_sube')!
    expect(cine.categoria).toBe('ocio')
    expect(ocio.categoria).toBe('ocio')
    expect(ahorroDeRecortes(d.sugerencias)).toBe(cine.ahorro_mes + Math.max(0, ocio.ahorro_mes - cine.ahorro_mes))
    expect(ahorroDeRecortes(d.sugerencias)).toBeLessThan(cine.ahorro_mes + ocio.ahorro_mes)
  })
  it('el mismo concepto en dos categorías son dos gastos distintos', () => {
    const d = calcularRevision(
      entrada({
        movimientos: [
          mov('2026-11-10', 900, { concepto: 'Cine', categoria: 'ocio', necesidad: 'prescindible' }),
          mov('2026-11-11', 500, { concepto: 'cine', necesidad: 'prescindible' }),
        ],
      }),
    )
    expect(d.sugerencias.map((x) => [x.titulo, x.categoria, x.importe])).toEqual([
      ['Cine', 'ocio', 900],
      ['cine', null, 500],
    ])
  })
})

describe('textos de las sugerencias', () => {
  const s = (c: Partial<Sugerencia>): Sugerencia => ({ regla: 'fijo_caro', titulo: 'Netflix', importe: 999, ahorro_mes: 999, ahorro_anio: 11988, impacto: null, ...c })

  it('directos, con el ahorro y el efecto en la meta', () => {
    expect(textoSugerencia(s({ impacto: { tipo: 'antes', dias: 21 } }), 'mensual')).toBe(
      `Si quitas «Netflix» ahorras ${eur(999)}/mes (${eur(11988)}/año) y llegas a la meta 3 semanas antes.`,
    )
    expect(textoSugerencia(s({ regla: 'prescindible', titulo: 'Cine', importe: 1800, ahorro_mes: 7821 }), 'semanal')).toBe(
      `Si dejas «Cine» (${eur(1800)} esa semana) ahorras ~${eur(7821)}/mes.`,
    )
    expect(textoSugerencia(s({ regla: 'categoria_sube', titulo: 'Ocio', importe: 6000, media: 2000, ahorro_mes: 4000 }), 'mensual')).toBe(
      `Ocio: ${eur(6000)} ese mes, por encima de tu media (${eur(2000)}). Si vuelves a tu media ahorras ${eur(4000)}/mes.`,
    )
    expect(textoSugerencia(s({ regla: 'solapados', titulo: 'HBO', conceptos: ['HBO', 'Max', 'Netflix'], impacto: { tipo: 'desbloquea', fecha: '2027-05-15' } }), 'mensual')).toBe(
      `Tienes a la vez «HBO», «Max» y «Netflix». Si quitas «HBO» ahorras ${eur(999)}/mes y empiezas a acercarte a la meta (llegarías el 15/05/2027).`,
    )
  })
})

describe('leer lo guardado', () => {
  it('lo calculado pasa por JSON y se lee igual', () => {
    const d = calcularRevision(
      entrada({
        meta: 100000,
        fijos: [fijo('Netflix', 1299, { categoria: 'suscripciones' }), fijo('HBO', 999, { categoria: 'suscripciones' })],
        movimientos: [mov('2026-11-10', 900, { concepto: 'Cine', necesidad: 'prescindible', categoria: 'ocio' }), mov('2026-11-11', 50000, { tipo: 'ingreso' })],
      }),
    )
    expect(leerDatosRevision(JSON.parse(JSON.stringify(d)))).toEqual(d)
  })
  it.each([null, 'texto', [1, 2], { v: 2 }, { v: 1, gastos: 'mucho' }])('datos que no valen → null (%j)', (v) => {
    expect(leerDatosRevision(v)).toBeNull()
  })
  it('descarta las sugerencias o categorías mal formadas y se queda con las buenas', () => {
    const base = calcularRevision(entrada({ fijos: [fijo('Gimnasio', 3000)] }))
    const raro = { ...base, sugerencias: [...base.sugerencias, { regla: 'inventada', titulo: 'x' }, { regla: 'fijo_caro', titulo: 1 }], categorias: [{ categoria: 'ocio', actual: 'x' }] }
    const leido = leerDatosRevision(JSON.parse(JSON.stringify(raro)))
    expect(leido?.sugerencias).toEqual(base.sugerencias)
    expect(leido?.categorias).toEqual([])
  })
})
