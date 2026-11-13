// Error de datos introducidos por el usuario. Su mensaje está pensado para
// enseñarse tal cual en la interfaz (en español y sin detalles internos).

export class ErrorDeValidacion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorDeValidacion'
  }
}
