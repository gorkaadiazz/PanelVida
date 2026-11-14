import { esVentana, VENTANA_POR_DEFECTO, type Ventana } from '../lib/prevision'

// Meses con los que se calcula el ritmo de ahorro (1, 3 o 6). Es una
// preferencia de este dispositivo, no un dato: se guarda en localStorage
// (puede no estar disponible: modo privado, almacenamiento bloqueado…).
const CLAVE = 'mi-panel:prevision-meses'

export function leerVentana(): Ventana {
  try {
    const v = Number(localStorage.getItem(CLAVE))
    return esVentana(v) ? v : VENTANA_POR_DEFECTO
  } catch {
    return VENTANA_POR_DEFECTO
  }
}

export function guardarVentana(v: Ventana): void {
  try {
    localStorage.setItem(CLAVE, String(v))
  } catch {
    // Sin almacenamiento: vale para esta visita
  }
}
