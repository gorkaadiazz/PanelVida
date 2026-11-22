// Casos límite de lib/puente.ts: textos raros, nombres de archivo raros,
// caducidad justo en el límite, cambio de hora, de mes y de año en Madrid y
// lo que llega al compartir desde Android.

import { describe, expect, it } from 'vitest'
import {
  CONTENIDO_MAX,
  DIAS_CADUCIDAD,
  NOMBRE_ARCHIVO_MAX,
  cuandoSeEnvio,
  diasParaCaducar,
  limpiarNombreDispositivo,
  nombreParaRuta,
  nombreSeguro,
  ordenarPuente,
  prepararTexto,
  rutaArchivo,
  textoCaducidad,
  unirCompartido,
} from './puente'

const DIA = 24 * 60 * 60 * 1000
/** Un surrogate suelto (medio emoji) no se puede guardar en Postgres: el servidor rechaza la fila. */
const SURROGATE_SUELTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
/** Lo mismo que el check `puente_enlace` de la migración. */
const CHECK_ENLACE = /^https?:\/\/[^\s]+$/i
/** Lo mismo que el check `puente_archivo` de la migración (segmentos «.» o «..»). */
const SEGMENTO_PUNTOS = /(^|\/)\.\.?(\/|$)/

describe('prepararTexto: casos límite', () => {
  it('saltos de línea de Windows (\\r\\n) en los extremos se quitan', () => {
    expect(prepararTexto('\r\n\r\n  hola  \r\n')).toEqual({ tipo: 'texto', contenido: 'hola' })
    expect(prepararTexto('\r\n  a\r\n    b\r\n\r\n').contenido).toBe('  a\r\n    b')
  })

  it('un enlace rodeado de líneas en blanco sigue siendo un enlace', () => {
    expect(prepararTexto('\n\n   https://a.es/x  \n\n')).toEqual({ tipo: 'enlace', contenido: 'https://a.es/x' })
    expect(prepararTexto('  \n\thttps://a.es\n')).toEqual({ tipo: 'enlace', contenido: 'https://a.es' })
  })

  it('dos enlaces en dos líneas son texto (no se puede abrir con un toque)', () => {
    expect(prepararTexto('https://a.es\nhttps://b.es').tipo).toBe('texto')
  })

  it('HTTPS en mayúsculas es enlace y cumple el check de la base de datos', () => {
    const r = prepararTexto('HTTPS://A.ES/Ruta')
    expect(r.tipo).toBe('enlace')
    expect(CHECK_ENLACE.test(r.contenido)).toBe(true)
  })

  it('todo lo que se guarda como enlace cumple el check de la base de datos', () => {
    for (const t of ['https://a.es', 'http://192.168.1.10:8080/x?y=1#z', 'https://ñandú.es/á', 'https://a.es/​']) {
      const r = prepararTexto(t)
      if (r.tipo === 'enlace') expect(CHECK_ENLACE.test(r.contenido), t).toBe(true)
    }
  })

  it('espacios raros (no separable) dentro de un "enlace" lo hacen texto', () => {
    expect(prepararTexto('https://a.es/ x').tipo).toBe('texto')
  })

  it('el límite se cuenta después de quitar lo vacío de los extremos', () => {
    expect(prepararTexto(`\n\n${'x'.repeat(CONTENIDO_MAX)}   \n`).contenido).toHaveLength(CONTENIDO_MAX)
    expect(() => prepararTexto(`  ${'x'.repeat(CONTENIDO_MAX - 1)}\nyy`)).toThrow('Como mucho')
  })

  it('solo espacios, tabuladores y saltos (también de Windows) no se manda', () => {
    expect(() => prepararTexto('\r\n\t \r\n')).toThrow('Escribe o pega algo')
    expect(() => prepararTexto('')).toThrow('Escribe o pega algo')
  })
})

describe('nombreSeguro: nombres raros', () => {
  it('barras de los dos tipos y nombres que son solo puntos', () => {
    expect(nombreSeguro('a/b\\c.txt')).toBe('a_b_c.txt')
    expect(nombreSeguro('...')).toBe('archivo')
    expect(nombreSeguro('..')).toBe('archivo')
  })

  it('no empieza por punto ni por espacio aunque los mezcle', () => {
    for (const n of ['. .txt', ' . oculto', '.​.env', '. . . x']) {
      expect(nombreSeguro(n), JSON.stringify(n)).not.toMatch(/^[.\s]/)
    }
  })

  it('junta espacios, tabuladores y saltos y normaliza a NFC', () => {
    expect(nombreSeguro('\t foto  de\n playa .jpg ')).toBe('foto de playa .jpg')
    expect(nombreSeguro('ñu.txt')).toBe('ñu.txt')
  })

  it('el nombre justo en el límite no se toca; uno más se recorta', () => {
    const justo = `${'a'.repeat(NOMBRE_ARCHIVO_MAX - 4)}.pdf`
    expect(nombreSeguro(justo)).toBe(justo)
    const uno = `${'a'.repeat(NOMBRE_ARCHIVO_MAX - 3)}.pdf`
    expect(nombreSeguro(uno)).toHaveLength(NOMBRE_ARCHIVO_MAX)
    expect(nombreSeguro(uno).endsWith('.pdf')).toBe(true)
  })

  it('una extensión de más de 10 caracteres no se conserva, pero el largo sí se respeta', () => {
    const r = nombreSeguro(`${'a'.repeat(200)}.extensionlarga`)
    expect(r).toHaveLength(NOMBRE_ARCHIVO_MAX)
    expect(r).not.toContain('.')
  })

  it('al recortar no parte un emoji por la mitad (Postgres rechazaría la fila)', () => {
    for (const n of [`a${'😀'.repeat(100)}.pdf`, `${'😀'.repeat(100)}b`, `ab${'😀'.repeat(100)}`]) {
      const r = nombreSeguro(n)
      expect(r.length).toBeLessThanOrEqual(NOMBRE_ARCHIVO_MAX)
      expect(SURROGATE_SUELTO.test(r), JSON.stringify(r.slice(-3))).toBe(false)
    }
  })
})

describe('nombreParaRuta y rutaArchivo con nombres raros', () => {
  const raros = [
    'Ñandú café.PDF',
    '中文.txt',
    '..',
    '.',
    '-.-hola-',
    '😀😀.png',
    'a..b',
    '../../../etc/passwd',
    '..\\..\\windows',
    'con espacio final .  ',
    '%2e%2e%2fsecreto',
    `${'ñ'.repeat(300)}.jpg`,
    '\u0000‮​',
    'CON',
    'nombre?con*raros<>|":.txt',
  ]

  it('solo caracteres seguros, nunca «.» ni «..», y como mucho 100', () => {
    for (const n of raros) {
      const r = nombreParaRuta(n)
      expect(r, n).toMatch(/^[A-Za-z0-9._-]+$/)
      expect(r, n).not.toMatch(/^\.\.?$/)
      expect(r.length, n).toBeLessThanOrEqual(100)
      expect(r.startsWith('.') || r.startsWith('-'), n).toBe(false)
    }
  })

  it('quita las tildes y cambia lo demás por guiones', () => {
    expect(nombreParaRuta('Ñandú café.PDF')).toBe('Nandu-cafe.PDF')
    expect(nombreParaRuta('-.-hola-')).toBe('hola')
    expect(nombreParaRuta('..')).toBe('archivo')
    expect(nombreParaRuta('%2e%2e%2fsecreto')).toBe('2e-2e-2fsecreto')
  })

  it('la ruta siempre tiene 3 partes, empieza por el usuario y la fila y cumple el check de la base de datos', () => {
    const usuario = 'aaaaaaaa-0000-4000-8000-00000000000a'
    const fila = 'a0000000-0000-4000-8000-0000000000e1'
    for (const n of raros) {
      const ruta = rutaArchivo(usuario, fila, n)
      expect(ruta.split('/'), n).toHaveLength(3)
      expect(ruta.startsWith(`${usuario}/${fila}/`), n).toBe(true)
      expect(SEGMENTO_PUNTOS.test(ruta), n).toBe(false)
      expect(ruta.length, n).toBeLessThanOrEqual(300)
    }
  })
})

describe('diasParaCaducar en el límite', () => {
  const creado = '2026-11-15T12:00:00.000Z'
  const t = Date.parse(creado)
  const el = { id: 'a', tipo: 'texto', fijado: false, created_at: creado }

  it('un milisegundo antes de los 7 días aún queda 1; justo a los 7, 0', () => {
    expect(diasParaCaducar(el, t + DIAS_CADUCIDAD * DIA - 1)).toBe(1)
    expect(diasParaCaducar(el, t + DIAS_CADUCIDAD * DIA)).toBe(0)
    expect(diasParaCaducar(el, t + DIAS_CADUCIDAD * DIA + 1)).toBe(0)
  })

  it('a los 6 días justos queda 1 (se borra mañana); un milisegundo antes, 2', () => {
    expect(diasParaCaducar(el, t + 6 * DIA)).toBe(1)
    expect(diasParaCaducar(el, t + 6 * DIA - 1)).toBe(2)
  })

  it('nunca dice más de 7 días, aunque se haya creado después de «ahora» (la página fija «ahora» al abrirse o el reloj va adelantado)', () => {
    expect(diasParaCaducar(el, t - 1)).toBe(DIAS_CADUCIDAD)
    expect(diasParaCaducar(el, t - 3 * DIA)).toBe(DIAS_CADUCIDAD)
    expect(textoCaducidad(diasParaCaducar(el, t - 1))).toBe('Se borra en 7 días')
  })

  it('una fecha que no se entiende no dice nada', () => {
    expect(diasParaCaducar({ ...el, created_at: 'basura' }, t)).toBeNull()
  })

  it('el cambio de hora no afecta (se cuentan instantes, no días de calendario)', () => {
    // Creado el sábado 24/10/2026 a las 12:00 en Madrid (CEST); el 25 se atrasa la hora
    const antes = { ...el, created_at: '2026-10-24T10:00:00.000Z' }
    expect(diasParaCaducar(antes, Date.parse('2026-10-31T10:00:00.000Z'))).toBe(0)
    expect(diasParaCaducar(antes, Date.parse('2026-10-31T09:59:59.999Z'))).toBe(1)
  })
})

describe('cuandoSeEnvio: cambio de hora, de mes y de año (Madrid)', () => {
  it('pasada la medianoche del día de 23 horas (29/03/2026), lo del 29 es «ayer»', () => {
    const ahora = Date.parse('2026-03-29T22:30:00Z') // 30/03 00:30 (CEST)
    expect(cuandoSeEnvio('2026-03-29T10:00:00Z', ahora)).toBe('ayer, 12:00')
    expect(cuandoSeEnvio('2026-03-29T00:30:00Z', ahora)).toBe('ayer, 01:30') // antes del cambio (CET)
    expect(cuandoSeEnvio('2026-03-28T22:59:00Z', ahora)).toBe('28/03/2026, 23:59')
  })

  it('al final del día de 25 horas (25/10/2026), lo del 24 es «ayer» y lo del 25 es «hoy»', () => {
    const ahora = Date.parse('2026-10-25T22:30:00Z') // 25/10 23:30 (CET)
    expect(cuandoSeEnvio('2026-10-24T10:00:00Z', ahora)).toBe('ayer, 12:00')
    expect(cuandoSeEnvio('2026-10-24T22:30:00Z', ahora)).toBe('hoy, 00:30')
    // La hora repetida: 02:30 de verano y 02:30 de invierno, las dos «hoy»
    expect(cuandoSeEnvio('2026-10-25T00:30:00Z', ahora)).toBe('hoy, 02:30')
    expect(cuandoSeEnvio('2026-10-25T01:30:00Z', ahora)).toBe('hoy, 02:30')
  })

  it('cambio de año y de mes', () => {
    const ahora = Date.parse('2027-01-01T00:30:00Z') // 01/01/2027 01:30
    expect(cuandoSeEnvio('2026-12-31T22:00:00Z', ahora)).toBe('ayer, 23:00')
    expect(cuandoSeEnvio('2026-12-31T23:15:00Z', ahora)).toBe('hoy, 00:15') // ya es 2027 en Madrid
    expect(cuandoSeEnvio('2026-12-30T12:00:00Z', ahora)).toBe('30/12/2026, 13:00')
    const marzo = Date.parse('2026-03-01T08:00:00Z')
    expect(cuandoSeEnvio('2026-02-28T20:00:00Z', marzo)).toBe('ayer, 21:00')
  })

  it('algo con fecha futura (reloj adelantado de otro dispositivo) sale con su fecha', () => {
    const ahora = Date.parse('2026-11-22T16:00:00Z')
    expect(cuandoSeEnvio('2026-11-23T10:00:00Z', ahora)).toBe('23/11/2026, 11:00')
  })
})

describe('unirCompartido: más casos', () => {
  it('título, texto y enlace distintos: todo, en ese orden', () => {
    expect(unirCompartido('Título', 'Un texto', 'https://a.es')).toBe('Título\nUn texto\nhttps://a.es')
  })

  it('solo un enlace en el título también vale', () => {
    expect(unirCompartido('https://a.es', '', '')).toBe('https://a.es')
  })

  it('título repetido en el texto + enlace: solo el enlace', () => {
    expect(unirCompartido('Noticia', 'Noticia', 'https://a.es/n')).toBe('https://a.es/n')
  })

  it('texto + enlace (sin título) se queda todo: el texto no se pierde', () => {
    expect(unirCompartido('', 'Hola', 'https://a.es')).toBe('Hola\nhttps://a.es')
  })

  it('un «enlace» que no es http(s) nunca se queda solo como enlace', () => {
    const r = unirCompartido('Noticia', '', 'javascript:alert(1)')
    expect(r).toBe('Noticia\njavascript:alert(1)')
    expect(prepararTexto(r).tipo).toBe('texto')
    expect(prepararTexto(unirCompartido('', '', 'javascript:alert(1)')).tipo).toBe('texto')
  })

  it('dos enlaces distintos: los dos, como texto', () => {
    const r = unirCompartido('', 'https://a.es', 'https://b.es')
    expect(r).toBe('https://a.es\nhttps://b.es')
    expect(prepararTexto(r).tipo).toBe('texto')
  })

  it('quita espacios de los extremos de cada parte', () => {
    expect(unirCompartido('  ', '  https://a.es  ', ' ')).toBe('https://a.es')
    expect(unirCompartido(' T ', ' x ', '')).toBe('T\nx')
  })

  it('el enlace ya incluido en el texto no se repite', () => {
    expect(unirCompartido('Título', 'Lee esto https://a.es', 'https://a.es')).toBe('Título\nLee esto https://a.es')
  })
})

describe('limpiarNombreDispositivo y orden', () => {
  it('quita caracteres invisibles y de control', () => {
    expect(limpiarNombreDispositivo('PC\u0000ca​sa', 'PC')).toBe('PCcasa')
    expect(limpiarNombreDispositivo('​‮', 'Móvil')).toBe('Móvil')
  })

  it('al recortar a 40 no parte un emoji (si no, el servidor rechazaría TODO lo que se mande)', () => {
    const r = limpiarNombreDispositivo(`a${'📱'.repeat(25)}`, 'PC')
    expect(r.length).toBeLessThanOrEqual(40)
    expect(SURROGATE_SUELTO.test(r)).toBe(false)
  })

  it('a igual hora desempata por id y no cambia la lista original', () => {
    const lista = [
      { id: 'b', tipo: 'texto', fijado: false, created_at: '2026-11-22T10:00:00.000Z' },
      { id: 'a', tipo: 'texto', fijado: false, created_at: '2026-11-22T10:00:00.000Z' },
    ]
    expect(ordenarPuente(lista).recientes.map((e) => e.id)).toEqual(['a', 'b'])
    expect(lista.map((e) => e.id)).toEqual(['b', 'a'])
    expect(ordenarPuente([])).toEqual({ fijados: [], recientes: [] })
  })
})
