import { describe, expect, it } from 'vitest'
import { escaparNotificacion, prepararEnvio, reaccionar, recortar } from './puente.ts'

const el = (extra: Partial<Parameters<typeof reaccionar>[0]>) => ({ id: '1', tipo: 'texto', contenido: 'hola', archivo_nombre: null, dispositivo: 'Móvil', ...extra })

describe('reaccionar a lo que llega al Puente', () => {
  it('texto o enlace: avisa y copia', () => {
    expect(reaccionar(el({ contenido: 'hola\nque tal' }), 'PC casa')).toEqual({
      aviso: { titulo: 'Puente · Móvil', cuerpo: 'hola\n(copiado al portapapeles)' },
      copiar: 'hola\nque tal',
    })
    expect(reaccionar(el({ tipo: 'enlace', contenido: 'https://a.es' }), 'PC casa').copiar).toBe('https://a.es')
  })

  it('un archivo solo se avisa (no se descarga ni se copia)', () => {
    const r = reaccionar(el({ tipo: 'archivo', contenido: '', archivo_nombre: 'foto.jpg' }), 'PC casa')
    expect(r.copiar).toBeNull()
    expect(r.aviso?.cuerpo).toContain('foto.jpg')
  })

  it('lo que manda este mismo PC no se repite', () => {
    expect(reaccionar(el({ dispositivo: 'PC casa' }), 'PC casa')).toEqual({ aviso: null, copiar: null })
  })

  it('un tipo desconocido no hace nada', () => {
    expect(reaccionar(el({ tipo: 'comando' }), 'PC casa')).toEqual({ aviso: null, copiar: null })
  })

  it('escapa el HTML: un texto no puede meter enlaces ni formato en la notificación', () => {
    const r = reaccionar(el({ contenido: '<a href="http://x">pulsa</a> & <b>ya</b>', dispositivo: '<i>Móvil</i>' }), 'PC')
    expect(r.aviso?.cuerpo).not.toMatch(/[<>]/)
    expect(r.aviso?.titulo).toBe('Puente · &lt;i&gt;Móvil&lt;/i&gt;')
    // pero lo copiado es el texto tal cual
    expect(r.copiar).toBe('<a href="http://x">pulsa</a> & <b>ya</b>')
  })

  it('lo muy largo se avisa recortado y no se copia', () => {
    const r = reaccionar(el({ contenido: 'x'.repeat(20000) }), 'PC')
    expect(r.copiar).toBeNull()
    expect([...(r.aviso?.cuerpo ?? '')].length).toBeLessThanOrEqual(200)
  })
})

describe('ayudas', () => {
  it('escaparNotificacion', () => {
    expect(escaparNotificacion(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;')
  })
  it('recortar no parte emojis y quita controles', () => {
    expect(recortar('😀😀😀', 2)).toBe('😀…')
    expect(recortar('a\u0007b\nc', 10)).toBe('ab\nc')
  })
  it('prepararEnvio', () => {
    expect(prepararEnvio('  hola \n')).toBe('hola')
    expect(prepararEnvio('   ')).toBeNull()
    expect(prepararEnvio('x'.repeat(10001))).toBeNull()
  })
})
