import { describe, expect, it } from 'vitest'
import { ACCIONES_SIN_VUELTA, esAccion, leerVolumen, mensajeError, traducir } from './acciones.ts'

const apps = [{ nombre: 'Firefox', orden: ['firefox', '--new-window'] }]

describe('traducir: solo la lista fija', () => {
  it('acciones fijas', () => {
    expect(traducir('apagar', null, apps, '3')).toEqual({ programa: 'systemctl', args: ['poweroff'] })
    expect(traducir('volumen_subir', null, apps, '3')?.programa).toBe('wpctl')
    expect(traducir('play_pausa', undefined, apps, null)).toEqual({ programa: 'playerctl', args: ['play-pause'] })
  })
  it('volumen con número de 0 a 100', () => {
    expect(traducir('volumen', '40', apps, null)).toEqual({ programa: 'wpctl', args: ['set-volume', '@DEFAULT_AUDIO_SINK@', '40%'] })
    expect(traducir('volumen', '101', apps, null)).toBeNull()
    expect(traducir('volumen', '40; rm -rf ~', apps, null)).toBeNull()
    expect(traducir('volumen', 40, apps, null)).toBeNull()
  })
  it('abrir app: solo las de tu config.json, con sus argumentos', () => {
    expect(traducir('abrir_app', 'Firefox', apps, null)).toEqual({ programa: 'firefox', args: ['--new-window'], separado: true })
    expect(traducir('abrir_app', 'firefox', apps, null)).toBeNull()
    expect(traducir('abrir_app', 'bash', apps, null)).toBeNull()
  })
  it('bloquear: con un id de sesión limpio', () => {
    expect(traducir('bloquear', null, apps, '3')).toEqual({ programa: 'loginctl', args: ['lock-session', '3'] })
    expect(traducir('bloquear', null, apps, null)).toBeNull()
    expect(traducir('bloquear', null, apps, '3 --all')).toBeNull()
  })
  it('lo desconocido o con valor de más no se hace', () => {
    expect(traducir('ejecutar', 'ls', apps, '3')).toBeNull()
    expect(traducir('apagar', 'ahora', apps, '3')).toBeNull()
    expect(traducir('toString', null, apps, '3')).toBeNull()
    expect(traducir('__proto__', null, apps, '3')).toBeNull()
    expect(esAccion('constructor')).toBe(false)
  })
  it('apagar, reiniciar y suspender cuentan el resultado antes', () => {
    expect([...ACCIONES_SIN_VUELTA].sort()).toEqual(['apagar', 'reiniciar', 'suspender'])
  })
})

describe('leerVolumen', () => {
  it('lee wpctl', () => {
    expect(leerVolumen('Volume: 0.45\n')).toEqual({ volumen: 45, silenciado: false })
    expect(leerVolumen('Volume: 1.00 [MUTED]')).toEqual({ volumen: 100, silenciado: true })
    expect(leerVolumen('nada')).toBeNull()
    expect(leerVolumen('Volume: 9.99')).toBeNull()
  })
})

describe('mensajeError', () => {
  it('corto y sin rutas personales', () => {
    expect(mensajeError({ code: 'ENOENT' })).toMatch(/Falta un programa/)
    expect(mensajeError(new Error('falló /home/gorka/x\nmás'))).toBe('falló ~/x')
  })
})
