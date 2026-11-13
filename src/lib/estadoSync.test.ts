import { describe, expect, it } from 'vitest'
import { ESTADO_INICIAL, type EstadoSync } from '../sync/avisos'
import { avisoRechazados, cambiosPorSubir, describirSync } from './estadoSync'

const estado = (cambios: Partial<EstadoSync>): EstadoSync => ({ ...ESTADO_INICIAL, ...cambios })

describe('describirSync', () => {
  it('todo subido', () => {
    expect(describirSync(estado({ fase: 'sincronizado' }), true)).toEqual({ tipo: 'ok', texto: 'Todo guardado' })
  })

  it('el error manda sobre todo lo demás', () => {
    expect(describirSync(estado({ fase: 'error', pendientes: 3 }), false).tipo).toBe('error')
  })

  it('sin conexión, con y sin cambios pendientes', () => {
    expect(describirSync(estado({ fase: 'sincronizado' }), false).texto).toBe('Sin conexión')
    expect(describirSync(estado({ fase: 'sin-conexion', pendientes: 2 }), true).texto).toBe('Sin conexión · 2 cambios por subir')
  })

  it('sincronizando y pendientes', () => {
    expect(describirSync(estado({ fase: 'sincronizando', sincronizando: true }), true).tipo).toBe('activo')
    expect(describirSync(estado({ fase: 'sincronizado', pendientes: 1 }), true)).toEqual({ tipo: 'pendiente', texto: '1 cambio por subir' })
  })

  it('antes de arrancar', () => {
    expect(describirSync(ESTADO_INICIAL, true).texto).toBe('Preparando…')
  })
})

describe('textos', () => {
  it('singular y plural', () => {
    expect(cambiosPorSubir(1)).toBe('1 cambio por subir')
    expect(cambiosPorSubir(5)).toBe('5 cambios por subir')
  })

  it('aviso de rechazados', () => {
    expect(avisoRechazados(0)).toBeNull()
    expect(avisoRechazados(1)).toContain('1 cambio y se ha descartado')
    expect(avisoRechazados(4)).toContain('4 cambios y se han descartado')
  })
})
