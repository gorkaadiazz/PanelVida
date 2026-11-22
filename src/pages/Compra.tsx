// Lista de la compra: «Mi lista» (privada) y «Lista de casa» (compartida con
// el hogar). Funciona sin conexión, para el súper sin cobertura.

import type { CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSesion } from '../auth/useSesion'
import { useTipoCuenta } from '../auth/useTipoCuenta'
import { AvisoError } from '../components/AvisoError'
import { PanelHogar, SinHogar } from '../components/GestionHogar'
import { ListaCompra } from '../components/ListaCompra'
import { Pagina } from '../components/Pagina'
import { useAccion } from '../components/useAccion'
import {
  apuntarEnCasa,
  apuntarEnMiLista,
  borrarDeCasa,
  borrarDeMiLista,
  editarEnCasa,
  editarEnMiLista,
  marcarEnCasa,
  marcarEnMiLista,
  quitarCompradosDeCasa,
  quitarCompradosDeMiLista,
} from '../repos/compra'
import { useFrecuentes, useListaCasa, useMiLista } from '../repos/hooks'
import { nombreDeMiembro } from '../lib/hogar'
import type { Hogar } from '../repos/hogar'
import { useHogar } from '../repos/useHogar'
import { useEstadoSync } from '../sync/hooks'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

export function Compra() {
  const [params] = useSearchParams()
  const enCasa = params.get('ver') === 'casa'
  const { error, ejecutar, limpiar } = useAccion()

  return (
    <Pagina titulo={enCasa ? 'Lista de casa' : 'Lista de la compra'} encabezado="Lista de la compra">
      <div className="stack">
        <nav className="pestanas pestanas--dos" aria-label="Listas">
          <Link to="/compra" className="pestanas__item" aria-current={!enCasa ? 'page' : undefined}>
            Mi lista
          </Link>
          <Link to="/compra?ver=casa" className="pestanas__item" aria-current={enCasa ? 'page' : undefined}>
            Lista de casa
          </Link>
        </nav>
        <AvisoError mensaje={error} onCerrar={limpiar} />
        {enCasa ? <ListaDeCasa ejecutar={ejecutar} /> : <MiLista ejecutar={ejecutar} />}
      </div>
    </Pagina>
  )
}

function MiLista({ ejecutar }: { ejecutar: Ejecutar }) {
  const lista = useMiLista()
  const frecuentes = useFrecuentes()
  const { primeraDescargaHecha } = useEstadoSync()
  const articulos = lista.datos ?? []
  return (
    <>
      {lista.error && <AvisoError mensaje="No se ha podido leer la lista de este dispositivo. Recarga la página." />}
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
        vacio={{
          titulo: 'Tu lista está vacía',
          texto: 'Apunta arriba lo que haga falta. Solo la ves tú. Funciona sin conexión: en el súper sin cobertura se guarda y se sube al volver.',
        }}
      />
    </>
  )
}

function ListaDeCasa({ ejecutar }: { ejecutar: Ejecutar }) {
  const { usuario } = useSesion()
  const tipo = useTipoCuenta(usuario?.id ?? null)
  const { hogar } = useHogar()

  if (hogar === undefined) {
    return (
      <div role="status" aria-busy="true">
        <span className="visually-hidden">Cargando el hogar…</span>
        <span className="skeleton" style={{ '--h': '6rem' } as CSSProperties} />
      </div>
    )
  }
  if (hogar === null) return <SinHogar puedeCrear={tipo === 'normal'} ejecutar={ejecutar} />
  return (
    <div className="stack">
      <PanelHogar hogar={hogar} yo={usuario?.id ?? ''} ejecutar={ejecutar} />
      <ArticulosDeCasa hogar={hogar} yo={usuario?.id ?? ''} ejecutar={ejecutar} />
    </div>
  )
}

function ArticulosDeCasa({ hogar, yo, ejecutar }: { hogar: Hogar; yo: string; ejecutar: Ejecutar }) {
  const lista = useListaCasa()
  const frecuentes = useFrecuentes()
  const { primeraDescargaHecha } = useEstadoSync()
  // Solo las de este hogar (por si quedara algo de uno anterior mientras se sincroniza)
  const articulos = (lista.datos ?? []).filter((a) => a.hogar_id === hogar.id)
  return (
    <>
      {lista.error && <AvisoError mensaje="No se ha podido leer la Lista de casa de este dispositivo. Recarga la página." />}
      <ListaCompra
        id="casa"
        articulos={articulos}
        frecuentes={frecuentes.datos ?? []}
        cargando={lista.cargando || (articulos.length === 0 && !primeraDescargaHecha)}
        ejecutar={ejecutar}
        apuntar={(d) => apuntarEnCasa(hogar.id, d)}
        editar={editarEnCasa}
        marcar={(id, comprado) => marcarEnCasa(id, comprado, yo)}
        borrar={borrarDeCasa}
        quitarComprados={quitarCompradosDeCasa}
        detalle={(a) => {
          const quien = a.comprado ? nombreDeMiembro(a.marcado_por, hogar.miembros, yo) : null
          return quien ? `Lo marcó ${quien}` : null
        }}
        vacio={{
          titulo: 'La Lista de casa está vacía',
          texto: 'Lo que apuntéis aquí lo ve todo el hogar al momento. También funciona sin conexión.',
        }}
      />
    </>
  )
}
