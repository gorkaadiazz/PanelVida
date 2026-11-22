// Casos límite (tester) de la lista fija del Mando: valores hostiles que
// podrían llegar de la base de datos y salidas raras de wpctl.
import { describe, expect, it } from 'vitest'
import { esAccion, leerVolumen, mensajeError, traducir } from './acciones.ts'

const apps = [
  { nombre: 'Firefox', orden: ['firefox', '--new-window'] },
  { nombre: 'Steam', orden: ['steam'] },
]

describe('traducir: valores hostiles', () => {
  it('la acción tiene que ser un texto exacto de la lista', () => {
    for (const accion of [['apagar'], { toString: () => 'apagar' }, 1, null, undefined, 'APAGAR', ' apagar', 'apagar ', 'apagar\n', 'apagar\0', 'hasOwnProperty', 'valueOf', '__proto__', 'constructor', '']) {
      expect(traducir(accion, null, apps, '3')).toBeNull()
    }
    expect(esAccion('volumen')).toBe(true)
    expect(esAccion('abrir_app')).toBe(true)
    expect(esAccion('bloquear')).toBe(true)
  })

  it('volumen: solo 0..100 en ASCII, sin ceros delante, espacios ni saltos', () => {
    expect(traducir('volumen', '0', apps, null)?.args.at(-1)).toBe('0%')
    expect(traducir('volumen', '100', apps, null)?.args.at(-1)).toBe('100%')
    expect(traducir('volumen', '9', apps, null)?.args.at(-1)).toBe('9%')
    for (const v of ['', '-1', '040', '00', '1000', '50%', ' 50', '50 ', '50\n', '\n50', '5e1', '50.0', '٤٠', '５０', '+5', '0x10', '50;reboot', '100+', null, undefined, 50, ['50'], { valueOf: () => 50 }]) {
      expect(traducir('volumen', v, apps, null)).toBeNull()
    }
  })

  it('volumen: el argumento va como UNA entrada de la lista (nunca se parte)', () => {
    const o = traducir('volumen', '75', apps, null)!
    expect(o).toEqual({ programa: 'wpctl', args: ['set-volume', '@DEFAULT_AUDIO_SINK@', '75%'] })
    expect(o.separado).toBeUndefined()
  })

  it('abrir_app: igualdad exacta con el nombre de config.json (sin trim, mayúsculas ni tipos raros)', () => {
    for (const v of ['Firefox ', ' Firefox', 'FIREFOX', 'Firefox\0', 'Firefox;rm', ['Firefox'], { nombre: 'Firefox' }, null, undefined, '', 'firefox --new-window']) {
      expect(traducir('abrir_app', v, apps, null)).toBeNull()
    }
    expect(traducir('abrir_app', 'Steam', apps, null)).toEqual({ programa: 'steam', args: [], separado: true })
    // sin apps configuradas, nada
    expect(traducir('abrir_app', 'Firefox', [], null)).toBeNull()
  })

  it('abrir_app: no devuelve la lista de config.json por referencia (no se puede mutar la config)', () => {
    const o = traducir('abrir_app', 'Firefox', apps, null)!
    o.args.push('--evil')
    expect(apps[0].orden).toEqual(['firefox', '--new-window'])
  })

  it('bloquear: el id de sesión limpio y corto; el valor que llegue no se usa', () => {
    expect(traducir('bloquear', null, apps, 'c2')).toEqual({ programa: 'loginctl', args: ['lock-session', 'c2'] })
    expect(traducir('bloquear', 'otra', apps, 'c2')).toEqual({ programa: 'loginctl', args: ['lock-session', 'c2'] })
    // (la sesión sale de `loginctl show-user` en el propio PC, no de la base de datos)
    for (const s of ['', ' ', '3\n', '3 4', 'x'.repeat(33), '../3', '$(id)']) {
      expect(traducir('bloquear', null, apps, s)).toBeNull()
    }
    expect(traducir('bloquear', null, apps, 'x'.repeat(32))).not.toBeNull()
  })

  it('acciones fijas: cualquier valor que no sea null/undefined la anula', () => {
    for (const v of ['', 0, false, 'ahora', [], {}]) {
      expect(traducir('apagar', v, apps, '3')).toBeNull()
      expect(traducir('silenciar', v, apps, '3')).toBeNull()
    }
  })

  it('las órdenes fijas no se pueden alterar desde fuera (cada llamada da lo mismo)', () => {
    const a = traducir('apagar', null, apps, '3')!
    const antes = JSON.stringify(a)
    try {
      a.args.push('--force')
    } catch {
      // si está congelada, mejor
    }
    const b = traducir('apagar', null, apps, '3')!
    expect(JSON.stringify(b)).toBe(antes)
  })
})

describe('leerVolumen: salidas reales y raras de wpctl', () => {
  it('reales', () => {
    expect(leerVolumen('Volume: 0.00')).toEqual({ volumen: 0, silenciado: false })
    expect(leerVolumen('Volume: 0.40 [MUTED]\n')).toEqual({ volumen: 40, silenciado: true })
    expect(leerVolumen('Volume: 1.50')).toEqual({ volumen: 150, silenciado: false })
    expect(leerVolumen('Volume: 0.455')).toEqual({ volumen: 46, silenciado: false })
    expect(leerVolumen('Volume: 1')).toEqual({ volumen: 100, silenciado: false })
  })
  it('raras', () => {
    expect(leerVolumen('')).toBeNull()
    expect(leerVolumen('Volume: 1.51')).toBeNull()
    expect(leerVolumen('Volume: -0.10')).toBeNull()
    expect(leerVolumen('Volume: abc')).toBeNull()
    expect(leerVolumen('Volume: 99999999999999999999999999')).toBeNull()
    expect(leerVolumen('Translate ID error: \'@DEFAULT_AUDIO_SINK@\' is not a valid ID')).toBeNull()
  })
})

describe('mensajeError: límites', () => {
  it('cualquier cosa lanzada da un texto corto', () => {
    expect(mensajeError(null)).toBe('Error')
    expect(mensajeError(undefined)).toBe('Error')
    expect(mensajeError('texto')).toBe('Error')
    expect(mensajeError({ code: 'ETIMEDOUT' })).toMatch(/a tiempo/)
    expect(mensajeError(new Error('Command failed: x timed out'))).toMatch(/a tiempo/)
    expect(mensajeError(new Error('x'.repeat(500)))).toHaveLength(150)
    expect(mensajeError(new Error('a /home/ana/b y /home/luis/c'))).toBe('a ~/b y ~/c')
  })
})
