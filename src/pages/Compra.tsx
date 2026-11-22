// Lista de la compra: «Mi lista» (privada) y «Lista de casa» (compartida con
// el hogar). Funciona sin conexión, para el súper sin cobertura.

import { Pagina } from '../components/Pagina'
import { AvisoError } from '../components/AvisoError'
import { ListaCompra } from '../components/ListaCompra'
import { useAccion } from '../components/useAccion'
import { useFrecuentes, useMiLista } from '../repos/hooks'
import { apuntarEnMiLista, borrarDeMiLista, editarEnMiLista, marcarEnMiLista, quitarCompradosDeMiLista } from '../repos/compra'
import { useEstadoSync } from '../sync/hooks'

export function Compra() {
  const lista = useMiLista()
  const frecuentes = useFrecuentes()
  const { primeraDescargaHecha } = useEstadoSync()
  const { error, ejecutar, limpiar } = useAccion()
  const articulos = lista.datos ?? []

  return (
    <Pagina titulo="Lista de la compra">
      <div className="stack">
        {lista.error && <AvisoError mensaje="No se ha podido leer la lista de este dispositivo. Recarga la página." />}
        <AvisoError mensaje={error} onCerrar={limpiar} />
        <ListaCompra
          id="mia"
          articulos={articulos}
          frecuentes={frecuentes.datos ?? []}
          cargando={lista.cargando || (articulos.length === 0 && !primeraDescargaHecha)}
          ejecutar={ejecutar}
          apuntar={apuntarEnMiLista}
          editar={editarEnMiLista}
          marcar={marcarEnMiLista}
          borrar={borrarDeMiLista}
          quitarComprados={quitarCompradosDeMiLista}
          vacio={{ titulo: 'La lista está vacía', texto: 'Apunta arriba lo que haga falta. Funciona sin conexión: en el súper sin cobertura se guarda y se sube al volver.' }}
        />
      </div>
    </Pagina>
  )
}
