// Repositorio de los movimientos fijos (cada día, semana, mes o año) y de su
// apunte automático. Funciona sin conexión, como todos.

import { CONCEPTO_MAX, formatearEuros, parsearImporte, validarCategoria, validarConcepto, validarNecesidad, validarTipo, type TipoMovimiento } from '../lib/dinero'
import {
  apunteHastaAyer,
  apuntesPendientes,
  idApunteParcial,
  camposAntiguos,
  IMPORTE_MAX_DIARIO,
  idApunteFijo,
  inicioAlReanudar,
  normalizarFijo,
  validarCuando,
  validarFrecuencia,
  type Apunte,
  type Frecuencia,
} from '../lib/fijos'
import { sumarDias, type FechaDia } from '../lib/fechas'
import { ErrorDeValidacion } from '../lib/validacion'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion, type Datos, type Escritor } from './base'

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

/**
 * Pausa o reanuda. Al reanudar no se apunta lo que tocó durante la pausa.
 * Al pausar se pone al día lo pendiente y, si es diario, se apuntan ya los
 * días que estuvo activo esta semana (ver `cerrarSemana`).
 */
export async function pausarFijo(id: string, pausar: boolean, hoy: FechaDia): Promise<Fijo> {
  return transaccion(async (e) => {
    const anterior = await e.obtener('movimientos_fijos', id)
    if (!anterior) throw new ErrorNoEncontrado('Ese fijo ya no existe.')
    if (pausar) {
      const alDia = await cerrarSemana(e, anterior, hoy)
      return e.actualizar('movimientos_fijos', alDia, { activo: false })
    }
    const actual = normalizarFijo(anterior)
    const nuevo = { ...actual, inicio: inicioAlReanudar(anterior, hoy) }
    return e.actualizar('movimientos_fijos', anterior, { activo: true, inicio: nuevo.inicio, ...camposAntiguos(nuevo) })
  })
}

/**
 * Borra el fijo (darlo de baja); los movimientos que ya apuntó se quedan. Antes
 * se apunta lo pendiente y, si es diario, los días activos de esta semana.
 */
export async function borrarFijo(id: string, hoy: FechaDia): Promise<void> {
  return transaccion(async (e) => {
    const fijo = await e.obtener('movimientos_fijos', id)
    if (fijo) await cerrarSemana(e, fijo, hoy)
    await e.borrar('movimientos_fijos', id)
  })
}

/**
 * Antes de que un fijo deje de estar activo: apunta lo que ya tocaba y, si es
 * diario, crea el apunte de los días de esta semana hasta ayer. Ese apunte no
 * cambia `ultimo_apunte`: si se reanuda la misma semana, el domingo se apunta
 * lo de después. Devuelve el fijo como queda.
 */
async function cerrarSemana(e: Escritor, fijo: Fijo, hoy: FechaDia): Promise<Fijo> {
  const { fijo: alDia } = await apuntarPendientes(e, fijo, hoy)
  const parcial = apunteHastaAyer(alDia, hoy)
  if (parcial) {
    const id = idApunteParcial(fijo.id, parcial.periodo, parcial.fecha)
    if (!(await e.obtener('movimientos', id))) e.crear('movimientos', movimientoDe(alDia, parcial, 'diaria'), id)
  }
  return alDia
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
    for (const fijo of await e.todos('movimientos_fijos')) creados += (await apuntarPendientes(e, fijo, hoy)).creados
    return creados
  })
}

/** El movimiento de un apunte de un fijo. */
function movimientoDe(fijo: Fijo, a: Apunte, frecuencia: Frecuencia): Datos<'movimientos'> {
  const gasto = fijo.tipo === 'gasto'
  return {
    tipo: fijo.tipo,
    concepto: conceptoApunte(fijo.concepto, a.veces, frecuencia),
    importe_centimos: fijo.importe_centimos * a.veces,
    fecha: a.fecha,
    categoria: gasto ? fijo.categoria : null,
    necesidad: gasto ? (fijo.necesidad ?? null) : null,
    fijo_id: fijo.id,
  }
}

/** Apunta lo pendiente de un fijo y anota `ultimo_apunte`. */
async function apuntarPendientes(e: Escritor, fijo: Fijo, hoy: FechaDia): Promise<{ creados: number; fijo: Fijo }> {
  const apuntes = apuntesPendientes(fijo, hoy)
  if (apuntes.length === 0) return { creados: 0, fijo }
  const f = normalizarFijo(fijo)
  let creados = 0
  for (const a of apuntes) {
    const id = idApunteFijo(fijo.id, a.periodo, f.frecuencia)
    if (await e.obtener('movimientos', id)) continue
    e.crear('movimientos', movimientoDe(fijo, a, f.frecuencia), id)
    creados++
  }
  const ultimo = apuntes[apuntes.length - 1].fecha
  const actualizado = e.actualizar('movimientos_fijos', fijo, { inicio: f.inicio, ultimo_apunte: ultimo, ...camposAntiguos({ ...f, ultimo_apunte: ultimo }) })
  return { creados, fijo: actualizado }
}
