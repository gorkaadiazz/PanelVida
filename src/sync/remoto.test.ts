import { describe, expect, it } from 'vitest'
import { crearRemotoSupabase } from './remoto'
import { columnasDeDescarga } from './tablas'

/** Cliente de mentira que apunta qué columnas se piden. */
function clienteQueApunta() {
  const pedidas: Record<string, string> = {}
  const consulta = {
    gt: () => consulta,
    order: () => consulta,
    range: async () => ({ data: [], error: null }),
  }
  const cliente = {
    from: (tabla: string) => ({
      select: (columnas: string) => {
        pedidas[tabla] = columnas
        return consulta
      },
    }),
  }
  return { cliente, pedidas }
}

describe('columnas que se descargan', () => {
  it('de las tablas propias, todas', () => {
    expect(columnasDeDescarga('tareas')).toBe('*')
    expect(columnasDeDescarga('habitos')).toBe('*')
  })

  it('de las de la web de exámenes, solo las que hacen falta (sin la foto del módulo ni las notas)', () => {
    const modulos = columnasDeDescarga('modulos').split(',')
    expect(modulos).toEqual(expect.arrayContaining(['id', 'nombre', 'abreviatura', 'color', 'sync_at', 'updated_at']))
    expect(modulos).not.toContain('foto')
    const evaluaciones = columnasDeDescarga('evaluaciones').split(',')
    expect(evaluaciones).toEqual(expect.arrayContaining(['modulo_id', 'titulo', 'tipo', 'fecha', 'estado', 'sync_at']))
    expect(evaluaciones).not.toContain('nota')
  })

  it('del perfil compartido, solo la meta de ahorro y los sellos (nunca nombre, tema ni preferencias)', () => {
    const perfiles = columnasDeDescarga('perfiles').split(',')
    expect(perfiles.sort()).toEqual(['created_at', 'id', 'meta_ahorro_centimos', 'sync_at', 'updated_at', 'user_id'])
    expect(columnasDeDescarga('movimientos')).toBe('*')
    expect(columnasDeDescarga('clientes_web')).toBe('*')
  })

  it('el remoto real pide esas columnas a Supabase', async () => {
    const { cliente, pedidas } = clienteQueApunta()
    const remoto = crearRemotoSupabase(cliente)
    await remoto.descargar('modulos', null, 0, 100)
    await remoto.descargar('tareas', null, 0, 100)
    expect(pedidas.modulos).toBe(columnasDeDescarga('modulos'))
    expect(pedidas.tareas).toBe('*')
  })
})
