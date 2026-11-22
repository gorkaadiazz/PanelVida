// Dónde dejar el foco cuando desaparece el elemento que lo tenía (una fila
// que se borra, se archiva o pasa a otra lista). Sin esto, el foco cae al
// <body> y quien usa teclado o lector de pantalla pierde su sitio.

/**
 * Elige ANTES de la acción a dónde irá el foco: el botón principal de la
 * fila siguiente (o la anterior) o, si no hay más, el encabezado de la
 * sección. Devuelve una función que lo mueve, para llamarla al terminar.
 */
export function prepararFoco(fila: HTMLElement | null): () => void {
  if (!fila) return () => {}
  const vecina = (fila.nextElementSibling ?? fila.previousElementSibling) as HTMLElement | null
  const destino =
    vecina?.querySelector<HTMLElement>('button:not(:disabled)') ??
    fila.closest('section')?.querySelector<HTMLElement>('h2') ??
    null
  return () => {
    // Si la sección entera ha desaparecido (se borró lo último), al h1 de la pantalla
    if (destino?.isConnected) destino.focus()
    else document.querySelector<HTMLElement>('main h1')?.focus()
  }
}
