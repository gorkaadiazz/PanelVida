import { describe, expect, it } from 'vitest'
import { ErrorDeValidacion, estadoTrasGuardar, estrellas, filtrarPlanes, ordenarPlanes, proximoPlan, validarComentario, validarPlan, validarValoracion } from './planes'

const base = { titulo: 'Cine', tipo: 'actividad', con_quien: '', fecha: '', coste: '', notas: '' }

describe('validar', () => {
  it('limpia y convierte: fecha y coste opcionales, coste en céntimos (0 vale)', () => {
    expect(validarPlan({ ...base, titulo: '  Ir  al cine ', con_quien: ' Ana  y Leo ' })).toEqual({
      titulo: 'Ir al cine', tipo: 'actividad', con_quien: 'Ana y Leo', fecha: null, coste_centimos: null, notas: '',
    })
    expect(validarPlan({ ...base, fecha: '2026-12-01', coste: '12,50' })).toMatchObject({ fecha: '2026-12-01', coste_centimos: 1250 })
    expect(validarPlan({ ...base, coste: '0' }).coste_centimos).toBe(0)
  })
  it.each([
    [{ titulo: ' ' }],
    [{ titulo: 'x'.repeat(121) }],
    [{ tipo: 'fiesta' }],
    [{ tipo: '' }],
    [{ fecha: '31/12/2026' }],
    [{ fecha: '2026-02-30' }],
    [{ coste: 'mucho' }],
    [{ coste: '-5' }],
    [{ con_quien: 'x'.repeat(121) }],
    [{ notas: 'x'.repeat(1001) }],
  ])('rechaza %j', (cambios) => {
    expect(() => validarPlan({ ...base, ...cambios })).toThrow(ErrorDeValidacion)
  })
  it('valoración del 1 al 5 u omitida; comentario con tope', () => {
    expect(validarValoracion('')).toBeNull()
    expect(validarValoracion(null)).toBeNull()
    expect(validarValoracion('5')).toBe(5)
    expect(() => validarValoracion(0)).toThrow(ErrorDeValidacion)
    expect(() => validarValoracion(6)).toThrow(ErrorDeValidacion)
    expect(() => validarValoracion(2.5)).toThrow(ErrorDeValidacion)
    expect(validarComentario('  genial ')).toBe('genial')
    expect(() => validarComentario('x'.repeat(501))).toThrow(ErrorDeValidacion)
  })
})

describe('estado al guardar', () => {
  it('con fecha pasa a planeado; sin fecha vuelve a idea; hecho se queda', () => {
    expect(estadoTrasGuardar('idea', '2026-12-01')).toBe('planeado')
    expect(estadoTrasGuardar('planeado', null)).toBe('idea')
    expect(estadoTrasGuardar('hecho', null)).toBe('hecho')
  })
})

const p = (id: string, estado: string, fecha: string | null, tipo = 'otro', created_at = '2026-11-01T00:00:00Z') => ({ id, titulo: id, tipo, fecha, estado, created_at })

describe('listas', () => {
  const planes = [
    p('idea vieja', 'idea', null, 'comida', '2026-10-01T00:00:00Z'),
    p('idea nueva', 'idea', null, 'viaje', '2026-11-10T00:00:00Z'),
    p('lejano', 'planeado', '2027-01-10', 'viaje'),
    p('cercano', 'planeado', '2026-11-20', 'sitio'),
    p('pasado sin hacer', 'planeado', '2026-11-01', 'sitio'),
    p('hecho antiguo', 'hecho', '2026-09-01'),
    p('hecho reciente', 'hecho', '2026-11-05'),
  ]
  it('ordena: planeados por fecha, ideas nuevas primero, hechos recientes primero', () => {
    expect(ordenarPlanes(planes).map((x) => x.id)).toEqual(['pasado sin hacer', 'cercano', 'lejano', 'idea nueva', 'idea vieja', 'hecho reciente', 'hecho antiguo'])
  })
  it('filtra por estado y por tipo', () => {
    expect(filtrarPlanes(planes, 'idea', 'todos').map((x) => x.id)).toEqual(['idea vieja', 'idea nueva'])
    expect(filtrarPlanes(planes, 'todos', 'viaje').map((x) => x.id)).toEqual(['idea nueva', 'lejano'])
    expect(filtrarPlanes(planes, 'planeado', 'sitio').map((x) => x.id)).toEqual(['cercano', 'pasado sin hacer'])
    expect(filtrarPlanes(planes, 'todos', 'todos')).toHaveLength(7)
  })
  it('próximo plan: el de fecha más cercana de hoy en adelante, sin los hechos ni los pasados', () => {
    expect(proximoPlan(planes, '2026-11-14')?.id).toBe('cercano')
    expect(proximoPlan(planes, '2026-11-20')?.id).toBe('cercano')
    expect(proximoPlan(planes, '2026-11-21')?.id).toBe('lejano')
    expect(proximoPlan(planes, '2027-02-01')).toBeNull()
  })
})

describe('estrellas', () => {
  it('pinta de 0 a 5', () => {
    expect(estrellas(3)).toBe('★★★☆☆')
    expect(estrellas(9)).toBe('★★★★★')
  })
})
