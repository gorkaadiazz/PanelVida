// Casos límite de lo que llega al Puente: texto malicioso, recortes y envíos.
import { describe, expect, it } from 'vitest'
import { MAX_COPIAR, escaparNotificacion, prepararEnvio, reaccionar, recortar, type ElementoPuente } from './puente.ts'

const el = (extra: Partial<ElementoPuente>): ElementoPuente => ({ id: '1', tipo: 'texto', contenido: 'hola', archivo_nombre: null, dispositivo: 'Móvil', ...extra })

describe('escaparNotificacion: ningún texto mete marcado en la notificación', () => {
  const maliciosos = [
    '<a href="javascript:alert(1)">x</a>',
    '<img src=x onerror=alert(1)>',
    '<b>negrita</b><i>cursiva</i><u>sub</u>',
    "<a href='file:///etc/passwd'>abre</a>",
    '&lt;b&gt;ya escapado&lt;/b&gt;',
    '<<script>>alert(1)<</script>>',
    '<!-- comentario --><![CDATA[x]]>',
    '"; rm -rf ~; echo "',
    '$(reboot) `reboot` ${HOME}',
  ]
  it.each(maliciosos)('%s', (texto) => {
    const e = escaparNotificacion(texto)
    expect(e).not.toMatch(/[<>"']/)
    // Todo & del resultado es el comienzo de una entidad que hemos puesto nosotros
    expect(e.replace(/&(amp|lt|gt|quot|#39);/g, '')).not.toContain('&')
  })

  it('escapa primero el & (no deja entidades a medias) y no doble-interpreta', () => {
    expect(escaparNotificacion('&lt;')).toBe('&amp;lt;')
    expect(escaparNotificacion('a & b')).toBe('a &amp; b')
    expect(escaparNotificacion('')).toBe('')
  })

  it('texto normal con tildes, ñ y emojis se queda igual', () => {
    expect(escaparNotificacion('Mañana a las 9 ☕ en la cafetería')).toBe('Mañana a las 9 ☕ en la cafetería')
  })
})

describe('recortar', () => {
  it('justo en el máximo no recorta; uno más, sí, y el resultado no pasa del máximo', () => {
    expect(recortar('abcde', 5)).toBe('abcde')
    expect(recortar('abcdef', 5)).toBe('abcd…')
    expect([...recortar('abcdef', 5)]).toHaveLength(5)
  })
  it('cuenta emojis como un carácter (no parte pares sustitutos)', () => {
    const r = recortar('😀'.repeat(300), 200)
    expect([...r]).toHaveLength(200)
    expect(r.endsWith('😀…')).toBe(true)
    expect(r).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/) // ningún sustituto alto huérfano
  })
  it('no deja espacios antes de los puntos suspensivos', () => {
    expect(recortar('abc      defghijk', 8)).toBe('abc…')
  })
  it('quita caracteres de control (ESC, BEL, NUL, DEL, retorno de carro) pero deja saltos de línea y tabuladores', () => {
    expect(recortar('a\u001b[31mrojo\u001b[0m\u0007\u0000\u007f\r\nb\tc', 100)).toBe('a[31mrojo[0m\nb\tc')
  })
  it('vacío o solo controles: cadena vacía', () => {
    expect(recortar('', 10)).toBe('')
    expect(recortar('\u0000\u0001', 10)).toBe('')
  })
  it('max 1: solo los puntos suspensivos', () => {
    expect(recortar('abc', 1)).toBe('…')
  })
})

describe('reaccionar: casos límite', () => {
  it('el título y el cuerpo nunca llevan < > " \' aunque todo venga malicioso', () => {
    for (const tipo of ['texto', 'enlace', 'archivo']) {
      const r = reaccionar(
        el({ tipo, contenido: '<a href="x">y</a>', archivo_nombre: '<img src=x onerror=1>.png', dispositivo: '<b>"evil"</b>' }),
        'PC casa',
      )
      expect(r.aviso).not.toBeNull()
      // el cuerpo admite formato en KDE: va escapado; el título es texto plano (spec de freedesktop) y no se escapa
      expect(r.aviso!.cuerpo).not.toMatch(/[<>"']/)
    }
  })

  it('lo de este PC no se avisa aunque lleve espacios alrededor', () => {
    expect(reaccionar(el({ dispositivo: '  PC casa ' }), 'PC casa')).toEqual({ aviso: null, copiar: null })
    expect(reaccionar(el({ tipo: 'archivo', archivo_nombre: 'a.pdf', dispositivo: 'PC casa' }), ' PC casa')).toEqual({ aviso: null, copiar: null })
  })

  it('otro nombre (aunque solo cambien mayúsculas) sí se avisa', () => {
    expect(reaccionar(el({ dispositivo: 'pc casa' }), 'PC casa').aviso).not.toBeNull()
  })

  it('sin dispositivo: «otro dispositivo», aunque el PC tampoco tenga nombre', () => {
    expect(reaccionar(el({ dispositivo: '   ' }), '').aviso?.titulo).toBe('Puente · otro dispositivo')
    expect(reaccionar(el({ dispositivo: '' }), 'PC').aviso?.titulo).toBe('Puente · otro dispositivo')
  })

  it('el origen se recorta a 40 caracteres', () => {
    const r = reaccionar(el({ dispositivo: 'x'.repeat(100) }), 'PC')
    expect(r.aviso?.titulo).toBe(`Puente · ${'x'.repeat(39)}…`)
  })

  it('justo en el máximo se copia; uno más, no (pero se avisa)', () => {
    expect(reaccionar(el({ contenido: 'a'.repeat(MAX_COPIAR) }), 'PC').copiar).toHaveLength(MAX_COPIAR)
    const r = reaccionar(el({ contenido: 'a'.repeat(MAX_COPIAR + 1) }), 'PC')
    expect(r.copiar).toBeNull()
    expect(r.aviso?.cuerpo).not.toContain('copiado')
  })

  it('el resumen es la primera línea con texto; lo copiado, todo tal cual (incluidos controles)', () => {
    const contenido = '\n\n   \n  primera\nsegunda\u0007'
    const r = reaccionar(el({ contenido }), 'PC')
    expect(r.aviso?.cuerpo).toBe('  primera\n(copiado al portapapeles)')
    expect(r.copiar).toBe(contenido)
  })

  it('comandos de shell en el texto: se copian como texto y el aviso no los cambia salvo escapar', () => {
    const r = reaccionar(el({ contenido: '$(rm -rf ~); `reboot` && curl x | sh' }), 'PC')
    expect(r.copiar).toBe('$(rm -rf ~); `reboot` && curl x | sh')
    expect(r.aviso?.cuerpo.startsWith('$(rm -rf ~); `reboot` &amp;&amp; curl x | sh')).toBe(true)
  })

  it('archivo sin nombre, nombre muy largo y archivo nunca se copia', () => {
    expect(reaccionar(el({ tipo: 'archivo', archivo_nombre: null }), 'PC').aviso?.cuerpo).toContain('sin nombre')
    const r = reaccionar(el({ tipo: 'archivo', contenido: 'no copiar', archivo_nombre: 'a'.repeat(500) }), 'PC')
    expect(r.copiar).toBeNull()
    expect(r.aviso?.cuerpo.length).toBeLessThan(200)
  })

  it('tipos desconocidos o raros no hacen nada', () => {
    for (const tipo of ['', 'TEXTO', 'comando', 'texto ', 'ejecutar']) {
      expect(reaccionar(el({ tipo }), 'PC')).toEqual({ aviso: null, copiar: null })
    }
  })
})

describe('prepararEnvio', () => {
  it('quita espacios de los extremos (incluidos no separables y saltos), no los de dentro', () => {
    expect(prepararEnvio(' \t hola  mundo \r\n')).toBe('hola  mundo')
  })
  it('justo en el máximo vale; uno más, no (contando lo de dentro)', () => {
    expect(prepararEnvio('x'.repeat(MAX_COPIAR))).toHaveLength(MAX_COPIAR)
    expect(prepararEnvio(`  ${'x'.repeat(MAX_COPIAR)}  `)).toHaveLength(MAX_COPIAR)
    expect(prepararEnvio('x'.repeat(MAX_COPIAR + 1))).toBeNull()
  })
  it('vacío o solo espacios: null', () => {
    expect(prepararEnvio('')).toBeNull()
    expect(prepararEnvio('\n\t  ')).toBeNull()
  })
})

describe('lo nuevo: C1, invisibles de formato, título en texto plano y origen_agente', () => {
  it('recortar quita C1 (U+0080–U+009F) e invisibles \\p{Cf} (U+202E, anchura cero, BOM)', () => {
    expect(recortar('a\u0085b\u009bc‮d​e﻿f⁦g', 100)).toBe('abcdefg')
  })
  it('el título no se escapa pero sí se limpia de controles e invisibles', () => {
    const r = reaccionar(el({ dispositivo: 'Móvil & <b>‮etc\u0007' }), 'PC')
    expect(r.aviso?.titulo).toBe('Puente · Móvil & <b>etc')
  })
  it('origen_agente: de otro PC no se copia (ni siquiera un enlace), del móvil sí', () => {
    expect(reaccionar(el({ tipo: 'enlace', contenido: 'https://a.es', origen_agente: '22222222-2222-4222-8222-222222222222' }), 'PC').copiar).toBeNull()
    expect(reaccionar(el({ origen_agente: '' }), 'PC').copiar).toBe('hola')
    expect(reaccionar(el({ origen_agente: null }), 'PC').copiar).toBe('hola')
  })
  it('de otro PC y demasiado largo: avisa sin la nota de copiado', () => {
    const r = reaccionar(el({ contenido: 'x'.repeat(MAX_COPIAR + 1), origen_agente: '22222222-2222-4222-8222-222222222222' }), 'PC')
    expect(r.copiar).toBeNull()
    expect(r.aviso?.cuerpo).not.toContain('copiado al portapapeles')
  })
})
