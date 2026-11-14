// Repositorio de los movimientos fijos (cada mes) y de su apunte automático.
// Funciona sin conexión, como todos.

import { mesDe, parsearImporte, validarCategoria, validarConcepto, validarTipo, type TipoMovimiento } from '../lib/dinero'
import { desdeAlReanudar, fechaEnMes, idApunteFijo, mesesPendientes, mesInicial, validarDia } from '../lib/fijos'
import type { FechaDia } from '../lib/fechas'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion } from './base'

export type Fijo = FilaLocal<'movimientos_fijos'>

export interface DatosFijo {
  tipo: TipoMovimiento | string
  concepto: string
  /** Tal como lo escribe el usuario ("12,50"). */
  importe: string
  /** Día del mes, tal como se escribe ("5"). */
  dia: string
  /** Solo en gastos; '' = sin categoría. */
  categoria: string
}

function validar(datos: DatosFijo) {
  const tipo = validarTipo(datos.tipo)
  return {
    tipo,
    concepto: validarConcepto(datos.concepto),
    importe_centimos: parsearImporte(datos.importe),
    dia: validarDia(datos.dia),
    categoria: validarCategoria(tipo, datos.categoria),
  }
}

/** Todos los fijos, por día del mes. */
export async function listarFijos(): Promise<Fijo[]> {
  return (await listar('movimientos_fijos')).sort((a, b) => a.dia - b.dia || a.concepto.localeCompare(b.concepto, 'es'))
}

/**
 * Crea un fijo. Empieza este mes si su día aún no ha pasado; si no, el que
 * viene (lo de este mes seguramente ya está apuntado a mano).
 */
export async function crearFijo(datos: DatosFijo, hoy: FechaDia): Promise<Fijo> {
  const limpios = validar(datos)
  return transaccion((e) => e.crear('movimientos_fijos', { ...limpios, desde: mesInicial(limpios.dia, hoy), ultimo_mes: null, activo: true }))
}

/** Cambiar un fijo solo afecta a los meses que aún no se han apuntado. */
export async function editarFijo(id: string, datos: DatosFijo): Promise<Fijo> {
  const limpios = validar(datos)
  return transaccion(async (e) => {
    const anterior = await e.obtener('movimientos_fijos', id)
    if (!anterior) throw new ErrorNoEncontrado('Ese fijo ya no existe.')
    return e.actualizar('movimientos_fijos', anterior, limpios)
  })
}

/** Pausa o reanuda. Al reanudar no se apuntan los meses que estuvo en pausa. */
export async function pausarFijo(id: string, pausar: boolean, hoy: FechaDia): Promise<Fijo> {
  return transaccion(async (e) => {
    const anterior = await e.obtener('movimientos_fijos', id)
    if (!anterior) throw new ErrorNoEncontrado('Ese fijo ya no existe.')
    if (pausar) return e.actualizar('movimientos_fijos', anterior, { activo: false })
    return e.actualizar('movimientos_fijos', anterior, { activo: true, desde: desdeAlReanudar(anterior, hoy) })
  })
}

/** Borra el fijo; los movimientos que ya apuntó se quedan. */
export async function borrarFijo(id: string): Promise<void> {
  return transaccion((e) => e.borrar('movimientos_fijos', id))
}

/**
 * Apunta los movimientos de los fijos a los que ya les ha llegado el día
 * (también los meses atrasados si la app llevaba tiempo sin abrirse).
 * Todo en una transacción: o se apunta el mes y se anota en `ultimo_mes`, o
 * nada. Si el movimiento de ese mes ya existe (lo apuntó otro dispositivo
 * con el mismo id), no se toca. Devuelve cuántos movimientos ha creado.
 */
export async function aplicarFijos(hoy: FechaDia): Promise<number> {
  return transaccion(async (e) => {
    let creados = 0
    for (const fijo of await e.todos('movimientos_fijos')) {
      const meses = mesesPendientes(fijo, hoy)
      if (meses.length === 0) continue
      for (const mes of meses) {
        const id = idApunteFijo(fijo.id, mes)
        if (await e.obtener('movimientos', id)) continue
        e.crear(
          'movimientos',
          {
            tipo: fijo.tipo,
            concepto: fijo.concepto,
            importe_centimos: fijo.importe_centimos,
            fecha: fechaEnMes(mes, fijo.dia),
            categoria: fijo.tipo === 'gasto' ? fijo.categoria : null,
          },
          id,
        )
        creados++
      }
      e.actualizar('movimientos_fijos', fijo, { ultimo_mes: meses[meses.length - 1] })
    }
    return creados
  })
}

/** Ids de los movimientos que ha apuntado algún fijo en un mes (para marcarlos en la lista). */
export function idsDeFijosEnMes(fijos: readonly Fijo[], fecha: FechaDia): Set<string> {
  const mes = mesDe(fecha)
  return new Set(fijos.map((f) => idApunteFijo(f.id, mes)))
}
