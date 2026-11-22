// Lista de la compra de punta a punta (tester, fase 9 sección 2): repositorio,
// motor, IndexedDB de mentira (una por dispositivo) y el servidor falso con el
// modo hogar (varios usuarios, RLS por miembro y borrados_hogar).

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  apuntarEnCasa,
  apuntarEnMiLista,
  borrarDeCasa,
  borrarDeMiLista,
  editarEnCasa,
  editarEnMiLista,
  listarListaCasa,
  listarMiLista,
  marcarEnCasa,
  marcarEnMiLista,
  quitarCompradosDeCasa,
} from '../repos/compra'
import { estadoSync, reiniciarEstado } from './avisos'
import { abrirBase, usarBase, type BaseLocal } from './bd'
import { contarPendientes, listarPendientes } from './cola'
import { crearMotor, type Motor } from './motor'
import type { Remoto } from './remoto'
import { USUARIO_FALSO, crearServidorFalso, type ServidorFalso } from './servidorFalso'

const YO = USUARIO_FALSO // la vista por defecto del servidor falso
const FAMILIAR = 'familiar-0000'
const HOGAR = 'hogar-0001'
const OTRO_HOGAR = 'hogar-0002'

let abiertas: BaseLocal[] = []
const navegador = { onLine: true }

interface Dispositivo {
  base: BaseLocal
  red: { conectada: boolean }
  motor: Motor
  usar(): void
}

async function dispositivo(remoto: Remoto): Promise<Dispositivo> {
  vi.stubGlobal('indexedDB', new IDBFactory())
  const base = await abrirBase('usuario')
  abiertas.push(base)
  const red = { conectada: true }
  const motor = crearMotor({ base, remoto, enLinea: () => red.conectada })
  const d: Dispositivo = {
    base,
    red,
    motor,
    usar: () => {
      usarBase(Promise.resolve(base))
      navegador.onLine = red.conectada
    },
  }
  d.usar()
  return d
}

async function sincronizar(d: Dispositivo) {
  d.usar()
  return d.motor.sincronizar()
}

/** Avanza el reloj del servidor más que el margen de descarga (60 s). */
function pasarTiempo(servidor: ServidorFalso) {
  for (let i = 0; i < 40; i++) servidor.desdeOtroDispositivo('ideas', { id: 'relleno', texto: `relleno ${i}`, archivada: false })
}

let actual: ServidorFalso | null = null
const servidor = () => actual as ServidorFalso

beforeEach(() => {
  reiniciarEstado()
  navegador.onLine = true
  vi.stubGlobal('navigator', navegador)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  actual = crearServidorFalso(undefined, { hogar: true })
})

afterEach(() => {
  for (const base of abiertas) base.cerrar()
  abiertas = []
  usarBase(null)
  actual = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('servidor falso en modo hogar (para que estos tests no pasen en vacío)', () => {
  it('sin la opción no hay hogar y las peticiones son las de siempre', () => {
    const s = crearServidorFalso()
    expect(s.miHogar).toBeUndefined()
    expect(s.descargarBorradosHogar).toBeUndefined()
  })

  it('cada uno ve solo las filas de su hogar y los borrados van a borrados_hogar', async () => {
    const s = servidor()
    s.hogarDe.set(YO, HOGAR)
    await s.guardar('compra_casa', [{ id: 'x', hogar_id: HOGAR, nombre: 'Pan', comprado: false, notas: '' }])
    await expect(s.como('fuera').descargar('compra_casa', null, 0, 100)).resolves.toEqual([])
    await expect(s.como('fuera').guardar('compra_casa', [{ id: 'y', hogar_id: HOGAR, nombre: 'Pirata' }])).rejects.toMatchObject({ code: '42501' })
    await s.como('fuera').borrar('compra_casa', ['x'])
    expect(s.fila('compra_casa', 'x')).toBeDefined()
    await s.borrar('compra_casa', ['x'])
    expect(s.borradosHogar()).toMatchObject([{ hogar_id: HOGAR, tabla: 'compra_casa', fila_id: 'x' }])
    await expect(s.descargarBorrados('2000-01-01T00:00:00Z', 0, 100)).resolves.toEqual([])
  })
})

describe('Mi lista sin conexión (modo súper sin cobertura)', () => {
  it('se apunta, marca, edita y borra sin red; al volver sube todo y llega al otro dispositivo', async () => {
    const movil = await dispositivo(servidor())
    const pc = await dispositivo(servidor())
    expect(await sincronizar(movil)).toBe(true)

    movil.red.conectada = false
    movil.usar()
    const leche = await apuntarEnMiLista({ nombre: '  Leche ', cantidad: '2 l', seccion: 'lacteos' })
    const pan = await apuntarEnMiLista({ nombre: 'Pan 🥖' })
    const sal = await apuntarEnMiLista({ nombre: 'Sal' })
    await marcarEnMiLista(leche.id, true)
    await editarEnMiLista(pan.id, { nombre: 'Pan de molde 🥖', notas: 'integral' })
    await borrarDeMiLista(sal.id)
    expect(await sincronizar(movil)).toBe(false)
    expect(estadoSync().fase).toBe('sin-conexion')
    expect(servidor().filas('compra_mia')).toEqual([])
    expect(await contarPendientes(movil.base)).toBe(3)

    movil.red.conectada = true
    expect(await sincronizar(movil)).toBe(true)
    expect(await contarPendientes(movil.base)).toBe(0)
    expect(servidor().fila('compra_mia', leche.id)).toMatchObject({ nombre: 'Leche', cantidad: '2 l', seccion: 'lacteos', comprado: true })
    expect(servidor().fila('compra_mia', leche.id)?.comprado_en).toBeTruthy()
    expect(servidor().fila('compra_mia', pan.id)).toMatchObject({ nombre: 'Pan de molde 🥖', notas: 'integral', comprado: false })
    expect(servidor().fila('compra_mia', sal.id)).toBeUndefined()
    // La sal se creó y se borró sin red: no llega al servidor de ninguna forma
    expect(servidor().peticiones.filter((p) => p.startsWith('guardar compra_mia'))).toEqual(['guardar compra_mia x2'])

    expect(await sincronizar(pc)).toBe(true)
    pc.usar()
    expect((await listarMiLista()).map((a) => a.nombre).sort()).toEqual(['Leche', 'Pan de molde 🥖'])
  })

  it('Mi lista no depende del hogar: sube aunque miHogar falle', async () => {
    const movil = await dispositivo(servidor())
    movil.usar()
    const a = await apuntarEnMiLista({ nombre: 'Huevos' })
    servidor().fallo = (p) => (p === 'mi hogar' ? { code: '42P01', message: 'relation "hogar_miembros" does not exist' } : null)
    await sincronizar(movil)
    expect(servidor().fila('compra_mia', a.id)).toMatchObject({ nombre: 'Huevos' })
    expect(await contarPendientes(movil.base)).toBe(0)
  })
})

describe('Lista de casa entre dos miembros', () => {
  async function dosMiembros() {
    const s = servidor()
    s.hogarDe.set(YO, HOGAR)
    s.hogarDe.set(FAMILIAR, HOGAR)
    const yo = await dispositivo(s)
    const familiar = await dispositivo(s.como(FAMILIAR))
    expect(await sincronizar(yo)).toBe(true)
    expect(await sincronizar(familiar)).toBe(true)
    return { yo, familiar }
  }

  it('un miembro edita y marca lo que apuntó otro, y borra otro artículo ajeno: el primero se entera de todo', async () => {
    const { yo, familiar } = await dosMiembros()
    yo.usar()
    const leche = await apuntarEnCasa(HOGAR, { nombre: 'Leche', seccion: 'lacteos' })
    const pan = await apuntarEnCasa(HOGAR, { nombre: 'Pan' })
    expect(await sincronizar(yo)).toBe(true)
    expect(servidor().fila('compra_casa', leche.id)).toMatchObject({ user_id: YO, hogar_id: HOGAR })

    expect(await sincronizar(familiar)).toBe(true)
    familiar.usar()
    expect((await listarListaCasa()).map((a) => a.nombre).sort()).toEqual(['Leche', 'Pan'])
    await editarEnCasa(leche.id, { nombre: 'Leche', cantidad: '6 bricks', seccion: 'lacteos' })
    await marcarEnCasa(leche.id, true, FAMILIAR)
    await borrarDeCasa(pan.id)
    expect(await sincronizar(familiar)).toBe(true)
    expect(servidor().fila('compra_casa', leche.id)).toMatchObject({ cantidad: '6 bricks', comprado: true, marcado_por: FAMILIAR, user_id: YO })
    expect(servidor().fila('compra_casa', pan.id)).toBeUndefined()

    expect(await sincronizar(yo)).toBe(true)
    yo.usar()
    const mia = await listarListaCasa()
    expect(mia).toHaveLength(1)
    expect(mia[0]).toMatchObject({ id: leche.id, cantidad: '6 bricks', comprado: true, marcado_por: FAMILIAR })
    // El borrado llegó por borrados_hogar (no por `borrados`, que solo lee quien lo creó)
    expect(servidor().peticiones).toContain('descargar borrados_hogar')
  })

  it('«Quitar los comprados» de un miembro también le llega al otro', async () => {
    const { yo, familiar } = await dosMiembros()
    yo.usar()
    const a = await apuntarEnCasa(HOGAR, { nombre: 'Arroz' })
    const b = await apuntarEnCasa(HOGAR, { nombre: 'Sal' })
    await marcarEnCasa(a.id, true, YO)
    await sincronizar(yo)
    await sincronizar(familiar)
    familiar.usar()
    expect(await quitarCompradosDeCasa()).toBe(1)
    await sincronizar(familiar)
    await sincronizar(yo)
    yo.usar()
    expect((await listarListaCasa()).map((x) => x.id)).toEqual([b.id])
  })

  it('quién lo marcó y quién lo apuntó no viajan desde la app: los pone el servidor', async () => {
    const { familiar } = await dosMiembros()
    const enviadas: Record<string, unknown>[] = []
    servidor().rechazar = (tabla, fila) => {
      if (tabla === 'compra_casa') enviadas.push(fila)
      return null
    }
    familiar.usar()
    const x = await apuntarEnCasa(HOGAR, { nombre: 'Café' })
    await marcarEnCasa(x.id, true, YO) // aunque la app dijera otra cosa
    await sincronizar(familiar)
    expect(enviadas.length).toBeGreaterThan(0)
    for (const f of enviadas) {
      expect(f).not.toHaveProperty('marcado_por')
      expect(f).not.toHaveProperty('user_id')
      expect(f).not.toHaveProperty('sync_at')
    }
    expect(servidor().fila('compra_casa', x.id)).toMatchObject({ marcado_por: FAMILIAR, user_id: FAMILIAR })
  })

  it('un artículo borrado por otro no revive al editarlo o marcarlo sin conexión', async () => {
    const { yo, familiar } = await dosMiembros()
    yo.usar()
    const huevos = await apuntarEnCasa(HOGAR, { nombre: 'Huevos' })
    const aceite = await apuntarEnCasa(HOGAR, { nombre: 'Aceite' })
    await sincronizar(yo)
    await sincronizar(familiar)

    // Yo, en el súper sin cobertura, edito uno y marco el otro
    yo.red.conectada = false
    yo.usar()
    await editarEnCasa(huevos.id, { nombre: 'Huevos', cantidad: '12' })
    await marcarEnCasa(aceite.id, true, YO)
    expect(await sincronizar(yo)).toBe(false)

    // Mientras, el familiar los borra los dos
    familiar.usar()
    await borrarDeCasa(huevos.id)
    await borrarDeCasa(aceite.id)
    expect(await sincronizar(familiar)).toBe(true)

    yo.red.conectada = true
    expect(await sincronizar(yo)).toBe(true)
    expect(servidor().fila('compra_casa', huevos.id)).toBeUndefined()
    expect(servidor().fila('compra_casa', aceite.id)).toBeUndefined()
    yo.usar()
    expect(await listarListaCasa()).toEqual([])
    expect(await contarPendientes(yo.base)).toBe(0)
    // Y el familiar tampoco los ve volver
    expect(await sincronizar(familiar)).toBe(true)
    familiar.usar()
    expect(await listarListaCasa()).toEqual([])
  })

  it('los dos editan el mismo artículo sin conexión: gana el cambio más reciente en los dos dispositivos', async () => {
    const { yo, familiar } = await dosMiembros()
    yo.usar()
    const x = await apuntarEnCasa(HOGAR, { nombre: 'Tomates' })
    await sincronizar(yo)
    await sincronizar(familiar)
    yo.red.conectada = false
    familiar.red.conectada = false
    yo.usar()
    await editarEnCasa(x.id, { nombre: 'Tomates', cantidad: '1 kg' })
    await new Promise((ok) => setTimeout(ok, 5))
    familiar.usar()
    await editarEnCasa(x.id, { nombre: 'Tomates', cantidad: '2 kg' })
    familiar.red.conectada = true
    yo.red.conectada = true
    await sincronizar(familiar) // el más reciente sube primero
    await sincronizar(yo) // el antiguo llega después y no pisa
    await sincronizar(familiar)
    expect(servidor().fila('compra_casa', x.id)).toMatchObject({ cantidad: '2 kg' })
    yo.usar()
    expect((await listarListaCasa())[0]).toMatchObject({ cantidad: '2 kg' })
    familiar.usar()
    expect((await listarListaCasa())[0]).toMatchObject({ cantidad: '2 kg' })
  })
})

describe('cambios de hogar', () => {
  it('al entrar en un hogar se bajan TODOS sus artículos, también los antiguos', async () => {
    const s = servidor()
    s.hogarDe.set(YO, HOGAR)
    const yo = await dispositivo(s)
    yo.usar()
    const viejos = [await apuntarEnCasa(HOGAR, { nombre: 'Uno' }), await apuntarEnCasa(HOGAR, { nombre: 'Dos' }), await apuntarEnCasa(HOGAR, { nombre: 'Tres' })]
    await sincronizar(yo)

    // El familiar ya usaba la app (Mi lista) y tiene su cursor más adelante que esos artículos
    const familiar = await dispositivo(s.como(FAMILIAR))
    pasarTiempo(s)
    expect(await sincronizar(familiar)).toBe(true)
    familiar.usar()
    expect(await listarListaCasa()).toEqual([])
    const cursor = await familiar.base.leerMeta<string>('ultima_descarga')
    for (const v of viejos) expect(Date.parse(s.fila('compra_casa', v.id)!.sync_at)).toBeLessThan(Date.parse(cursor!) - 60_000)

    // Entra con el código
    s.hogarDe.set(FAMILIAR, HOGAR)
    expect(await sincronizar(familiar)).toBe(true)
    familiar.usar()
    expect((await listarListaCasa()).map((a) => a.nombre).sort()).toEqual(['Dos', 'Tres', 'Uno'])
    expect(await familiar.base.leerMeta('hogar_sincronizado')).toBe(HOGAR)
  })

  it('al ser expulsado se vacía la Lista de casa local y sus cambios pendientes, sin tocar el servidor', async () => {
    const s = servidor()
    s.hogarDe.set(YO, HOGAR)
    s.hogarDe.set(FAMILIAR, HOGAR)
    const yo = await dispositivo(s)
    const familiar = await dispositivo(s.como(FAMILIAR))
    yo.usar()
    const x = await apuntarEnCasa(HOGAR, { nombre: 'Lejía', seccion: 'limpieza' })
    await sincronizar(yo)
    await sincronizar(familiar)

    // El familiar, sin red, sigue tocando la lista
    familiar.red.conectada = false
    familiar.usar()
    await editarEnCasa(x.id, { nombre: 'Lejía', cantidad: 'venganza' })
    const nuevo = await apuntarEnCasa(HOGAR, { nombre: 'Cosa' })
    const mio = await apuntarEnMiLista({ nombre: 'Lo mío' })
    expect(await contarPendientes(familiar.base)).toBe(3)

    // Le expulsan
    s.hogarDe.delete(FAMILIAR)
    familiar.red.conectada = true
    // Lo pendiente de la Lista de casa sube antes de saber que ya no es miembro:
    // el servidor lo rechaza (RLS) y se deshace; luego se vacía la lista
    expect(await sincronizar(familiar)).toBe(true)
    familiar.usar()
    expect(await listarListaCasa()).toEqual([])
    expect((await listarPendientes(familiar.base)).filter((p) => p.tabla === 'compra_casa')).toEqual([])
    expect(await familiar.base.leerMeta('hogar_sincronizado')).toBeNull()
    // Lo suyo (Mi lista) sí ha subido
    expect(s.fila('compra_mia', mio.id)).toBeDefined()
    expect(await contarPendientes(familiar.base)).toBe(0)
    // El servidor no se ha enterado de nada de lo que hizo tras la expulsión
    expect(s.fila('compra_casa', x.id)).toMatchObject({ cantidad: null, nombre: 'Lejía' })
    expect(s.fila('compra_casa', nuevo.id)).toBeUndefined()
    // Y en siguientes vueltas no vuelve nada
    expect(await sincronizar(familiar)).toBe(true)
    familiar.usar()
    expect(await listarListaCasa()).toEqual([])
  })

  it('cambiar de un hogar a otro deja solo la lista del nuevo', async () => {
    const s = servidor()
    s.hogarDe.set(YO, HOGAR)
    s.hogarDe.set('otro', OTRO_HOGAR)
    s.hogarDe.set(FAMILIAR, HOGAR)
    await s.guardar('compra_casa', [{ id: 'h1', hogar_id: HOGAR, nombre: 'Del primero', comprado: false, notas: '' }])
    await s.como('otro').guardar('compra_casa', [{ id: 'h2', hogar_id: OTRO_HOGAR, nombre: 'Del segundo', comprado: false, notas: '' }])
    const familiar = await dispositivo(s.como(FAMILIAR))
    await sincronizar(familiar)
    familiar.usar()
    expect((await listarListaCasa()).map((a) => a.id)).toEqual(['h1'])
    s.hogarDe.set(FAMILIAR, OTRO_HOGAR)
    await sincronizar(familiar)
    familiar.usar()
    expect((await listarListaCasa()).map((a) => a.id)).toEqual(['h2'])
  })

  it('si miHogar falla (falta la migración, 42P01) las demás tablas siguen bajando y la de casa se baja entera después', async () => {
    const s = servidor()
    s.hogarDe.set(YO, HOGAR)
    s.hogarDe.set(FAMILIAR, HOGAR)
    await s.guardar('compra_casa', [{ id: 'c1', hogar_id: HOGAR, nombre: 'Antiguo', comprado: false, notas: '' }])
    s.desdeOtroDispositivo('tareas', { id: 't1', texto: 'Tarea', hecha: false })
    s.desdeOtroDispositivo('compra_mia', { id: 'm1', nombre: 'Privado', comprado: false, notas: '' })
    const familiar = await dispositivo(s.como(FAMILIAR))
    s.fallo = (p) => (p === 'mi hogar' ? { code: '42P01', message: 'relation "public.hogar_miembros" does not exist' } : null)

    expect(await sincronizar(familiar)).toBe(false)
    expect(estadoSync().fase).toBe('error')
    familiar.usar()
    expect(await familiar.base.obtener('tareas', 't1')).toBeDefined()
    expect((await listarMiLista()).map((a) => a.id)).toEqual(['m1'])
    expect(await listarListaCasa()).toEqual([])
    expect(s.peticiones).not.toContain('descargar compra_casa')
    expect(s.peticiones).not.toContain('descargar borrados_hogar')
    expect(await familiar.base.leerMeta<string[]>('tablas_descargadas')).not.toContain('compra_casa')

    // Se aplica la migración; mientras, el cursor ha avanzado
    s.fallo = null
    pasarTiempo(s)
    expect(await sincronizar(familiar)).toBe(true)
    familiar.usar()
    expect((await listarListaCasa()).map((a) => a.id)).toEqual(['c1'])
  })

  it('si falla descargarBorradosHogar no se pierde el borrado: llega en la vuelta siguiente', async () => {
    const s = servidor()
    s.hogarDe.set(YO, HOGAR)
    s.hogarDe.set(FAMILIAR, HOGAR)
    const yo = await dispositivo(s)
    const familiar = await dispositivo(s.como(FAMILIAR))
    yo.usar()
    const x = await apuntarEnCasa(HOGAR, { nombre: 'Yogur' })
    await sincronizar(yo)
    await sincronizar(familiar)
    yo.usar()
    await borrarDeCasa(x.id)
    await sincronizar(yo)
    s.fallo = (p) => (p === 'descargar borrados_hogar' ? { code: 'XX000', message: 'algo raro' } : null)
    expect(await sincronizar(familiar)).toBe(false)
    s.fallo = null
    pasarTiempo(s)
    expect(await sincronizar(familiar)).toBe(true)
    familiar.usar()
    expect(await listarListaCasa()).toEqual([])
  })
})
