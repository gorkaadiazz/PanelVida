import { describe, expect, it } from 'vitest'
import {
  ARCHIVO_MAX_BYTES,
  diasParaCaducar,
  dispositivoPorDefecto,
  esEnlaceSeguro,
  formatearBytes,
  limpiarNombreDispositivo,
  nombreParaRuta,
  nombreSeguro,
  ordenarPuente,
  prepararTexto,
  resumenElemento,
  rutaArchivo,
  textoCaducidad,
  validarArchivo,
} from './puente'

describe('prepararTexto', () => {
  it('un enlace http(s) solo es un enlace', () => {
    expect(prepararTexto('  https://ejemplo.com/a?b=1  ')).toEqual({ tipo: 'enlace', contenido: 'https://ejemplo.com/a?b=1' })
    expect(prepararTexto('http://192.168.1.1')).toEqual({ tipo: 'enlace', contenido: 'http://192.168.1.1' })
  })

  it('un enlace con texto alrededor, o de otro protocolo, es texto', () => {
    expect(prepararTexto('mira https://ejemplo.com').tipo).toBe('texto')
    expect(prepararTexto('javascript:alert(1)').tipo).toBe('texto')
    expect(prepararTexto('ftp://ejemplo.com').tipo).toBe('texto')
    expect(prepararTexto('https://').tipo).toBe('texto')
  })

  it('respeta la sangría y los saltos del texto (puede ser código) y quita lo vacío de los extremos', () => {
    expect(prepararTexto('\n\n  if (x) {\n    y()\n  }\n\n').contenido).toBe('  if (x) {\n    y()\n  }')
  })

  it('no deja mandar nada vacío ni demasiado largo', () => {
    expect(() => prepararTexto('   \n ')).toThrow('Escribe o pega algo')
    expect(() => prepararTexto('x'.repeat(10001))).toThrow('Como mucho')
    expect(prepararTexto('x'.repeat(10000)).contenido).toHaveLength(10000)
  })
})

describe('esEnlaceSeguro', () => {
  it('solo http y https', () => {
    expect(esEnlaceSeguro('https://a.es')).toBe(true)
    expect(esEnlaceSeguro('HTTP://a.es')).toBe(true)
    expect(esEnlaceSeguro('javascript:alert(1)')).toBe(false)
    expect(esEnlaceSeguro('data:text/html,hola')).toBe(false)
    expect(esEnlaceSeguro('no es un enlace')).toBe(false)
  })
})

describe('nombres y rutas de archivo', () => {
  it('quita barras, puntos iniciales y caracteres de control', () => {
    expect(nombreSeguro('../../etc/passwd')).toBe('_.._etc_passwd')
    expect(nombreSeguro('.bashrc')).toBe('bashrc')
    expect(nombreSeguro('a\u0000b‮c.txt')).toBe('abc.txt')
    expect(nombreSeguro('   ')).toBe('archivo')
  })

  it('recorta los nombres largos conservando la extensión', () => {
    const largo = nombreSeguro(`${'a'.repeat(300)}.pdf`)
    expect(largo).toHaveLength(120)
    expect(largo.endsWith('.pdf')).toBe(true)
  })

  it('la ruta va en la carpeta del usuario y de la fila, con un nombre que Storage acepta', () => {
    expect(rutaArchivo('u1', 'f1', 'Foto de la playa ñ (1).JPG')).toBe('u1/f1/Foto-de-la-playa-n-1-.JPG')
    expect(nombreParaRuta('../x')).toBe('_x')
    expect(nombreParaRuta('😀😀')).toBe('archivo')
    expect(rutaArchivo('u', 'f', '../../otro').split('/')).toHaveLength(3)
  })

  it('valida el tamaño', () => {
    expect(() => validarArchivo({ name: 'a', size: 0 })).toThrow('vacío')
    expect(() => validarArchivo({ name: 'a', size: ARCHIVO_MAX_BYTES + 1 })).toThrow('25 MB')
    expect(() => validarArchivo({ name: 'a', size: ARCHIVO_MAX_BYTES })).not.toThrow()
  })
})

describe('orden y caducidad', () => {
  const e = (id: string, created_at: string, fijado = false) => ({ id, tipo: 'texto', fijado, created_at })

  it('lo más nuevo arriba y los fijados aparte', () => {
    const { fijados, recientes } = ordenarPuente([
      e('a', '2026-11-20T10:00:00Z'),
      e('b', '2026-11-22T10:00:00Z'),
      e('c', '2026-11-21T10:00:00Z', true),
    ])
    expect(recientes.map((x) => x.id)).toEqual(['b', 'a'])
    expect(fijados.map((x) => x.id)).toEqual(['c'])
  })

  it('cuenta los días que faltan para los 7 días', () => {
    const creado = Date.parse('2026-11-15T12:00:00Z')
    const el = e('a', '2026-11-15T12:00:00Z')
    expect(diasParaCaducar(el, creado)).toBe(7)
    expect(diasParaCaducar(el, creado + 6.5 * 86400000)).toBe(1)
    expect(diasParaCaducar(el, creado + 7 * 86400000)).toBe(0)
    expect(diasParaCaducar(el, creado + 30 * 86400000)).toBe(0)
    expect(diasParaCaducar(e('b', '2026-11-15T12:00:00Z', true), creado)).toBeNull()
  })

  it('texto de la caducidad', () => {
    expect(textoCaducidad(null)).toBeNull()
    expect(textoCaducidad(0)).toBe('Se borra hoy')
    expect(textoCaducidad(1)).toBe('Se borra mañana')
    expect(textoCaducidad(5)).toBe('Se borra en 5 días')
  })
})

describe('otros', () => {
  it('formatea tamaños en español', () => {
    expect(formatearBytes(850)).toBe('850 B')
    expect(formatearBytes(12595)).toBe('12,3 KB')
    expect(formatearBytes(4404019)).toBe('4,2 MB')
  })

  it('nombre del dispositivo', () => {
    expect(limpiarNombreDispositivo('  PC   casa ', 'PC')).toBe('PC casa')
    expect(limpiarNombreDispositivo('   ', 'Móvil')).toBe('Móvil')
    expect(limpiarNombreDispositivo('x'.repeat(60), 'PC')).toHaveLength(40)
    expect(dispositivoPorDefecto('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile')).toBe('Móvil')
    expect(dispositivoPorDefecto('Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0')).toBe('PC')
  })

  it('resumen de un elemento', () => {
    expect(resumenElemento({ tipo: 'archivo', contenido: '', archivo_nombre: 'foto.jpg' })).toBe('foto.jpg')
    expect(resumenElemento({ tipo: 'texto', contenido: '\n  hola\nadiós', archivo_nombre: null })).toBe('hola')
    expect(resumenElemento({ tipo: 'texto', contenido: 'x'.repeat(100), archivo_nombre: null }, 10)).toBe(`${'x'.repeat(9)}…`)
  })
})

describe('cuandoSeEnvio', () => {
  it('hoy, ayer o la fecha, en hora de Madrid', async () => {
    const { cuandoSeEnvio } = await import('./puente')
    const ahora = Date.parse('2026-11-22T16:00:00Z') // 17:00 en Madrid
    expect(cuandoSeEnvio('2026-11-22T16:40:00Z', ahora)).toBe('hoy, 17:40')
    expect(cuandoSeEnvio('2026-11-21T23:30:00Z', ahora)).toBe('hoy, 00:30')
    expect(cuandoSeEnvio('2026-11-21T08:05:00Z', ahora)).toBe('ayer, 09:05')
    expect(cuandoSeEnvio('2026-11-20T17:00:00Z', ahora)).toBe('20/11/2026, 18:00')
    expect(cuandoSeEnvio('basura', ahora)).toBe('')
  })
})

describe('unirCompartido', () => {
  it('título + enlace de una web: solo el enlace', async () => {
    const { unirCompartido } = await import('./puente')
    expect(unirCompartido('Noticia', '', 'https://a.es/n')).toBe('https://a.es/n')
    expect(unirCompartido('Noticia', 'https://a.es/n', '')).toBe('https://a.es/n')
    expect(unirCompartido('', 'https://a.es/n', 'https://a.es/n')).toBe('https://a.es/n')
  })

  it('un texto con algo más se queda entero y sin repetir', async () => {
    const { unirCompartido } = await import('./puente')
    expect(unirCompartido('', 'Mira esto https://a.es', 'https://a.es')).toBe('Mira esto https://a.es')
    expect(unirCompartido('Lista', 'pan\nleche', '')).toBe('Lista\npan\nleche')
    expect(unirCompartido('', '', '')).toBe('')
  })
})
