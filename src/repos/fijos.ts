// Repositorio de los movimientos fijos (cada día, semana, mes o año) y de su
// apunte automático. Funciona sin conexión, como todos.

import { CONCEPTO_MAX, formatearEuros, parsearImporte, validarCategoria, validarConcepto, validarNecesidad, validarTipo, type TipoMovimiento } from '../lib/dinero'
import {
  apuntesPendientes,
  camposAntiguos,
  IMPORTE_MAX_DIARIO,
  idApunteFijo,
  inicioAlReanudar,
  normalizarFijo,
  validarCuando,
  validarFrecuencia,
  type Frecuencia,
} from '../lib/fijos'
import { sumarDias, type FechaDia } from '../lib/fechas'
import { ErrorDeValidacion } from '../lib/validacion'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion } from './base'

export type Fijo = FilaLocal<'movimientos_fijos'>

export interface DatosFijo {
  tipo: TipoMovimiento | string
  concepto: string
  /** Tal como lo escribe el usuario ("12,50"). */
  importe: string
  frecuencia: Frecuencia | string
  /** Día del mes (mensual y anual) o de la semana 1-7 (semanal), tal como se escribe. */
  dia: string
  /** Mes 1-12 (solo anual). */
  mes: string
  /** Solo en gastos; '' = sin categoría. */
  categoria: string
  /** Solo en gastos; '' = sin marcar. */
  necesidad: string
}

function validar(datos: DatosFijo) {
  const tipo = validarTipo(datos.tipo)
  const frecuencia = validarFrecuencia(datos.frecuencia)
  const importe_centimos = parsearImporte(datos.importe)
  if (frecuencia === 'diaria' && importe_centimos > IMPORTE_MAX_DIARIO) {
    throw new ErrorDeValidacion(`Un fijo diario puede ser como mucho de ${formatearEuros(IMPORTE_MAX_DIARIO)} al día.`)
  }
  return {
    tipo,
    concepto: validarConcepto(datos.concepto),
    importe_centimos,
    frecuencia,
    ...validarCuando(frecuencia, datos.dia, datos.mes),
    categoria: validarCategoria(tipo, datos.categoria),
    necesidad: validarNecesidad(tipo, datos.necesidad),
  }
}

/** Todos los fijos: los que más cuestan al mes, primero (lo ordena la pantalla). */
export async function listarFijos(): Promise<Fijo[]> {
  return listar('movimientos_fijos')
}

/**
 * Crea un fijo. Cuenta desde hoy: si hoy ya ha pasado su día de este periodo
 * (lo de este mes seguramente ya está apuntado a mano), empieza en el siguiente.
 */
export async function crearFijo(datos: DatosFijo, hoy: FechaDia): Promise<Fijo> {
  const limpios = validar(datos)
  const nuevo = { ...limpios, inicio: hoy, ultimo_apunte: null }
  return transaccion((e) => e.crear('movimientos_fijos', { ...nuevo, ...camposAntiguos(nuevo), activo: true }))
}

/**
 * Cambiar un fijo solo afecta a lo que aún no se ha apuntado. Si cambia la
 * frecuencia, cuenta desde hoy (no se recupera lo de antes con la nueva).
 */
export async function editarFijo(id: string, datos: DatosFijo, hoy: FechaDia): Promise<Fijo> {
  const limpios = validar(datos)
  return transaccion(async (e) => {
    const anterior = await e.obtener('movimientos_fijos', id)
    if (!anterior) throw new ErrorNoEncontrado('Ese fijo ya no existe.')
    const actual = normalizarFijo(anterior)
    const cambia = limpios.frecuencia !== actual.frecuencia
    // Con otra frecuencia, el último apunte (de la frecuencia vieja) ya no sirve
    // para saber el siguiente periodo: un mensual que pasa a anual se saltaría
    // el año entero. Se empieza de cero desde hoy (o desde mañana si hoy ya se
    // apuntó, para no cobrar dos veces el mismo día).
    let inicio = actual.inicio
    if (cambia) {
      if (inicio < hoy) inicio = hoy
      if (actual.ultimo_apunte && actual.ultimo_apunte >= inicio) inicio = sumarDias(actual.ultimo_apunte, 1)
    }
    const nuevo = { ...limpios, inicio, ultimo_apunte: cambia ? null : actual.ultimo_apunte }
    return e.actualizar('movimientos_fijos', anterior, { ...nuevo, ...camposAntiguos(nuevo) })
  })
}

/** Pausa o reanuda. Al reanudar no se apunta lo que tocó durante la pausa. */
export async function pausarFijo(id: string, pausar: boolean, hoy: FechaDia): Promise<Fijo> {
  return transaccion(async (e) => {
    const anterior = await e.obtener('movimientos_fijos', id)
    if (!anterior) throw new ErrorNoEncontrado('Ese fijo ya no existe.')
    if (pausar) return e.actualizar('movimientos_fijos', anterior, { activo: false })
    const actual = normalizarFijo(anterior)
    const nuevo = { ...actual, inicio: inicioAlReanudar(anterior, hoy) }
    return e.actualizar('movimientos_fijos', anterior, { activo: true, inicio: nuevo.inicio, ...camposAntiguos(nuevo) })
  })
}

/** Borra el fijo (darlo de baja); los movimientos que ya apuntó se quedan. */
export async function borrarFijo(id: string): Promise<void> {
  return transaccion((e) => e.borrar('movimientos_fijos', id))
}

/** Concepto del apunte semanal de un fijo diario: "Café (7 días)". */
function conceptoApunte(concepto: string, veces: number, frecuencia: Frecuencia): string {
  if (frecuencia !== 'diaria') return concepto
  const sufijo = ` (${veces} ${veces === 1 ? 'día' : 'días'})`
  return concepto.slice(0, CONCEPTO_MAX - sufijo.length) + sufijo
}

/**
 * Apunta los movimientos de los fijos a los que ya les ha llegado el día
 * (también los atrasados si la app llevaba tiempo sin abrirse). Todo en una
 * transacción: o se apunta y se anota en `ultimo_apunte`, o nada. Si el
 * movimiento ya existe (lo apuntó otro dispositivo con el mismo id), no se
 * toca. Devuelve cuántos movimientos ha creado.
 */
export async function aplicarFijos(hoy: FechaDia): Promise<number> {
  return transaccion(async (e) => {
    let creados = 0
    for (const fijo of await e.todos('movimientos_fijos')) {
      const apuntes = apuntesPendientes(fijo, hoy)
      if (apuntes.length === 0) continue
      const f = normalizarFijo(fijo)
      for (const a of apuntes) {
        const id = idApunteFijo(fijo.id, a.periodo, f.frecuencia)
        if (await e.obtener('movimientos', id)) continue
        const gasto = fijo.tipo === 'gasto'
        e.crear(
          'movimientos',
          {
            tipo: fijo.tipo,
            concepto: conceptoApunte(fijo.concepto, a.veces, f.frecuencia),
            importe_centimos: fijo.importe_centimos * a.veces,
            fecha: a.fecha,
            categoria: gasto ? fijo.categoria : null,
            necesidad: gasto ? (fijo.necesidad ?? null) : null,
            fijo_id: fijo.id,
          },
          id,
        )
        creados++
      }
      const ultimo = apuntes[apuntes.length - 1].fecha
      e.actualizar('movimientos_fijos', fijo, { inicio: f.inicio, ultimo_apunte: ultimo, ...camposAntiguos({ ...f, ultimo_apunte: ultimo }) })
    }
    return creados
  })
}
