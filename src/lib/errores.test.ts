import { describe, expect, it } from 'vitest'
import { ErrorNoEncontrado } from '../repos/base'
import { MENSAJE_GENERICO, mensajeDeError } from './errores'
import { ErrorDeValidacion } from './validacion'

describe('mensajeDeError', () => {
  it('enseña tal cual los errores de validación', () => {
    expect(mensajeDeError(new ErrorDeValidacion('Escribe un nombre para el hábito.'))).toBe('Escribe un nombre para el hábito.')
  })

  it('enseña tal cual que algo ya no existe', () => {
    expect(mensajeDeError(new ErrorNoEncontrado('Esa tarea ya no existe.'))).toBe('Esa tarea ya no existe.')
  })

  it('no enseña detalles internos de otros errores', () => {
    expect(mensajeDeError(new Error('QuotaExceededError: store habito_marcas'))).toBe(MENSAJE_GENERICO)
    expect(mensajeDeError(new TypeError('x is undefined'))).toBe(MENSAJE_GENERICO)
  })

  it('aguanta valores que no son errores', () => {
    expect(mensajeDeError('texto')).toBe(MENSAJE_GENERICO)
    expect(mensajeDeError(undefined)).toBe(MENSAJE_GENERICO)
    expect(mensajeDeError(null)).toBe(MENSAJE_GENERICO)
  })
})
