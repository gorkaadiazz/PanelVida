// Puente móvil ⇄ PC: manda texto, enlaces y archivos de un dispositivo a
// otro. Lo nuevo llega solo (Supabase Realtime → sincronizar). Lo no fijado
// se borra a los 7 días.

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AvisoError } from '../components/AvisoError'
import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { prepararFoco } from '../components/foco'
import { IconoAdjuntar, IconoBorrar, IconoCopiar, IconoDescargar, IconoExterno, IconoFijar, IconoHecho, IconoPuente } from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { useEnLinea } from '../components/useEnLinea'
import {
  CONTENIDO_MAX,
  DISPOSITIVO_MAX,
  cuandoSeEnvio,
  diasParaCaducar,
  esEnlaceSeguro,
  formatearBytes,
  ordenarPuente,
  textoCaducidad,
} from '../lib/puente'
import { recogerCompartido } from '../repos/compartido'
import { usePuente } from '../repos/hooks'
import {
  borrarElemento,
  cambiarNombreDispositivo,
  enlaceDescarga,
  enviarArchivo,
  enviarTexto,
  fijarElemento,
  nombreDispositivo,
  type ElementoPuente,
} from '../repos/puente'
import { useEstadoSync } from '../sync/hooks'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

export function Puente() {
  const puente = usePuente()
  const { primeraDescargaHecha } = useEstadoSync()
  const { error, ejecutar, limpiar } = useAccion()
  const lista = puente.datos ?? []
  const { fijados, recientes } = ordenarPuente(lista)
  const cargando = puente.cargando || (lista.length === 0 && !primeraDescargaHecha)
  // «ahora» se fija al pintar: basta para las horas y la caducidad
  const [ahora] = useState(() => Date.now())

  return (
    <Pagina titulo="Puente" subtitulo="Del móvil al PC y al revés. Lo que no fijes se borra a los 7 días.">
      <div className="stack">
        {puente.error && <AvisoError mensaje="No se ha podido leer el Puente de este dispositivo. Recarga la página." />}
        <AvisoError mensaje={error} onCerrar={limpiar} />
        <Dispositivo />
        <Enviar ejecutar={ejecutar} />

        {cargando && lista.length === 0 ? (
          <div className="stack" role="status" aria-busy="true" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
            <span className="visually-hidden">Cargando el Puente…</span>
            <span className="skeleton" style={{ '--h': '4rem' } as CSSProperties} />
            <span className="skeleton" style={{ '--h': '4rem' } as CSSProperties} />
          </div>
        ) : lista.length === 0 ? (
          <Vacio icono={<IconoPuente />} titulo="El Puente está vacío">
            Escribe o pega algo arriba, o adjunta un archivo, y aparecerá al momento en tus otros dispositivos. En el móvil también puedes usar
            «Compartir → Mi Panel».
          </Vacio>
        ) : (
          <>
            {fijados.length > 0 && (
              <section aria-labelledby="puente-fijados" className="stack" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
                <h2 id="puente-fijados" className="t-section" tabIndex={-1}>
                  Fijados <span className="num muted">{fijados.length}</span>
                </h2>
                <ul className="list" role="list">
                  {fijados.map((e) => (
                    <FilaPuente key={e.id} elemento={e} ahora={ahora} ejecutar={ejecutar} />
                  ))}
                </ul>
              </section>
            )}
            <section aria-labelledby="puente-recientes" className="stack" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
              <h2 id="puente-recientes" className="t-section" tabIndex={-1}>
                Recientes <span className="num muted">{recientes.length}</span>
              </h2>
              {recientes.length === 0 ? (
                <p className="muted">Nada reciente: solo lo fijado.</p>
              ) : (
                <ul className="list" role="list">
                  {recientes.map((e) => (
                    <FilaPuente key={e.id} elemento={e} ahora={ahora} ejecutar={ejecutar} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </Pagina>
  )
}

/** Nombre de este dispositivo («Móvil», «PC casa»…), editable. */
function Dispositivo() {
  const id = useId()
  const [nombre, setNombre] = useState(nombreDispositivo)
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState(nombre)
  const boton = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState<string | null>(null)

  function guardar(e: FormEvent) {
    e.preventDefault()
    try {
      setNombre(cambiarNombreDispositivo(borrador))
      setEditando(false)
      setError(null)
      requestAnimationFrame(() => boton.current?.focus())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar el nombre.')
    }
  }

  if (editando) {
    return (
      <form className="puente-dispositivo" onSubmit={guardar} aria-label="Nombre de este dispositivo">
        <div className="field">
          <label htmlFor={`${id}-nombre`} className="field__label">
            Nombre de este dispositivo
          </label>
          <input
            id={`${id}-nombre`}
            className="input"
            value={borrador}
            maxLength={DISPOSITIVO_MAX}
            placeholder="Ej.: PC casa"
            autoFocus
            onChange={(e) => setBorrador(e.target.value)}
          />
          {error && <p className="field__error">{error}</p>}
        </div>
        <div className="row">
          <button type="submit" className="btn btn--primary">
            Guardar
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setEditando(false)
              requestAnimationFrame(() => boton.current?.focus())
            }}
          >
            Cancelar
          </button>
        </div>
      </form>
    )
  }

  return (
    <p className="puente-dispositivo row">
      <span className="muted">
        Este dispositivo: <strong className="puente-dispositivo__nombre">{nombre}</strong>
      </span>
      <button
        type="button"
        ref={boton}
        className="btn btn--ghost btn--sm"
        aria-label={`Cambiar el nombre de este dispositivo (${nombre})`}
        onClick={() => {
          setBorrador(nombre)
          setEditando(true)
        }}
      >
        Cambiar
      </button>
    </p>
  )
}

function Enviar({ ejecutar }: { ejecutar: Ejecutar }) {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const enLinea = useEnLinea()
  const selector = useRef<HTMLInputElement>(null)
  const areaTexto = useRef<HTMLTextAreaElement>(null)
  const [params, setParams] = useSearchParams()

  // Lo que llega con «Compartir → Mi Panel» se prepara aquí para mandarlo
  const compartido = params.has('compartido')
  useEffect(() => {
    if (!compartido) return
    let vivo = true
    recogerCompartido()
      .then((c) => {
        if (!vivo || !c) return
        if (c.texto) setTexto(c.texto)
        if (c.archivos.length) setArchivos(c.archivos)
        setAviso('Listo para mandar: revisa y pulsa «Mandar».')
      })
      .catch((e: unknown) => console.error('Compartido', e))
      .finally(() => {
        if (vivo) setParams({}, { replace: true })
      })
    return () => {
      vivo = false
    }
  }, [compartido, setParams])

  async function mandar(e: { preventDefault(): void }) {
    e.preventDefault()
    if (enviando || (!texto.trim() && archivos.length === 0)) return
    setEnviando(true)
    setAviso(null)
    const ok = await ejecutar(async () => {
      if (texto.trim()) {
        await enviarTexto(texto)
        setTexto('')
      }
      // Uno a uno: si falla uno, los anteriores ya están mandados y no se repiten
      const pendientes = [...archivos]
      while (pendientes.length) {
        await enviarArchivo(pendientes[0])
        pendientes.shift()
        setArchivos([...pendientes])
      }
    })
    setEnviando(false)
    if (ok) {
      setAviso('Mandado.')
      areaTexto.current?.focus()
    }
  }

  const hayAlgo = texto.trim().length > 0 || archivos.length > 0

  return (
    <form className="card puente-enviar stack" onSubmit={(e) => void mandar(e)} aria-label="Mandar al Puente" style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
      <div className="field">
        <label htmlFor={`${id}-texto`} className="field__label">
          Texto o enlace
        </label>
        <textarea
          id={`${id}-texto`}
          ref={areaTexto}
          className="input puente-enviar__texto"
          rows={3}
          value={texto}
          maxLength={CONTENIDO_MAX}
          placeholder="Escribe o pega aquí"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/Cmd + Intro manda (Intro solo hace un salto de línea)
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void mandar(e)
          }}
        />
      </div>

      {archivos.length > 0 && (
        <ul className="list puente-adjuntos" role="list" aria-label="Archivos para mandar">
          {archivos.map((a, i) => (
            <li key={`${a.name}-${i}`} className="list__item">
              <IconoAdjuntar />
              <span className="list__main break">
                {a.name} <span className="muted num">· {formatearBytes(a.size)}</span>
              </span>
              <button
                type="button"
                className="icon-btn icon-btn--peligro"
                aria-label={`Quitar ${a.name}`}
                onClick={() => setArchivos((lista) => lista.filter((_, j) => j !== i))}
              >
                <IconoBorrar />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="row row--between">
        <div>
          {/* Oculto del todo (fuera del árbol de accesibilidad): se llega con el botón de al lado */}
          <input
            ref={selector}
            id={`${id}-archivo`}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const nuevos = [...(e.target.files ?? [])]
              if (nuevos.length) setArchivos((lista) => [...lista, ...nuevos].slice(0, 5))
              e.target.value = ''
            }}
          />
          <button type="button" className="btn btn--ghost" onClick={() => selector.current?.click()} disabled={!enLinea}>
            <IconoAdjuntar /> Adjuntar archivo
          </button>
        </div>
        <button type="submit" className="btn btn--primary" disabled={!hayAlgo || enviando} aria-busy={enviando}>
          {enviando ? (archivos.length ? 'Subiendo…' : 'Mandando…') : 'Mandar'}
        </button>
      </div>
      <p className="t-small muted" role="status">
        {aviso ?? (enLinea ? 'Archivos de hasta 25 MB. Ctrl + Intro también manda.' : 'Sin conexión: el texto se manda al volver; los archivos necesitan conexión.')}
      </p>
    </form>
  )
}

/** Fila cuyo botón «Fijar» debe recuperar el foco al volver a montarse. */
let focoTrasFijar: string | null = null

function FilaPuente({ elemento: e, ahora, ejecutar }: { elemento: ElementoPuente; ahora: number; ejecutar: Ejecutar }) {
  const [borrando, setBorrando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const fila = useRef<HTMLLIElement>(null)
  const botonBorrar = useRef<HTMLButtonElement>(null)
  const botonFijar = useRef<HTMLButtonElement>(null)
  const enLinea = useEnLinea()

  // Al fijar o soltar, la fila pasa a la otra lista y se monta de nuevo: el
  // foco la sigue hasta su botón «Fijar» en vez de caer al <body>.
  useEffect(() => {
    if (focoTrasFijar !== e.id) return
    focoTrasFijar = null
    botonFijar.current?.focus()
  }, [e.id])

  async function fijar() {
    const id = e.id
    focoTrasFijar = id
    await ejecutar(() => fijarElemento(id, !e.fijado))
    // Si falla o la fila no llega a moverse, no se queda pendiente para otra visita
    setTimeout(() => {
      if (focoTrasFijar === id) focoTrasFijar = null
    }, 1000)
  }
  const resumen = e.tipo === 'archivo' ? (e.archivo_nombre ?? 'archivo') : e.contenido.slice(0, 60)
  const caducidad = textoCaducidad(diasParaCaducar(e, ahora))
  const pendienteDeSubir = !e.sync_at

  async function copiar() {
    await ejecutar(async () => {
      await navigator.clipboard.writeText(e.contenido)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  async function descargar() {
    await ejecutar(async () => {
      const url = await enlaceDescarga(e)
      // El enlace firmado lleva «descargar como»: el navegador lo guarda sin salir de la app
      const a = document.createElement('a')
      a.href = url
      a.rel = 'noopener'
      document.body.append(a)
      a.click()
      a.remove()
    })
  }

  async function sacar() {
    const mover = prepararFoco(fila.current)
    if (await ejecutar(() => borrarElemento(e.id))) mover()
  }

  if (borrando) {
    return (
      <li className="list__item" ref={fila}>
        <div className="confirmar list__main">
          <span className="break">¿Borrar «{resumen}» del Puente?</span>
          <button type="button" className="btn btn--danger" onClick={() => void sacar()}>
            Borrar
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            autoFocus
            onClick={() => {
              setBorrando(false)
              requestAnimationFrame(() => botonBorrar.current?.focus())
            }}
          >
            Cancelar
          </button>
        </div>
      </li>
    )
  }

  const enlaceValido = e.tipo === 'enlace' && esEnlaceSeguro(e.contenido)

  return (
    <li className="list__item puente-item" ref={fila}>
      <div className="list__main">
        {e.tipo === 'archivo' ? (
          <p className="puente-item__archivo break">
            <IconoAdjuntar />
            <span>
              {e.archivo_nombre}
              {e.archivo_bytes ? <span className="muted num"> · {formatearBytes(e.archivo_bytes)}</span> : null}
            </span>
          </p>
        ) : enlaceValido ? (
          <a className="puente-item__enlace break" href={e.contenido} target="_blank" rel="noopener noreferrer">
            {e.contenido}
            <span className="visually-hidden"> (se abre en otra pestaña)</span>
          </a>
        ) : (
          <p className="puente-item__texto break">{e.contenido}</p>
        )}
        <p className="t-small muted">
          {e.dispositivo || 'Otro dispositivo'} · <span className="num">{cuandoSeEnvio(e.created_at, ahora)}</span>
          {pendienteDeSubir && <span className="tag tag--warn puente-item__tag">Por subir</span>}
          {e.fijado ? (
            <span className="tag tag--info puente-item__tag">Fijado</span>
          ) : (
            caducidad && <span className="puente-item__caduca"> · {caducidad}</span>
          )}
        </p>
      </div>
      <div className="acciones">
        {e.tipo !== 'archivo' && (
          // Al copiar, el icono pasa a un «✓» un par de segundos (y se anuncia abajo)
          <button type="button" className="icon-btn" aria-label={`Copiar: ${resumen}`} onClick={() => void copiar()}>
            {copiado ? <IconoHecho className="text-ok" /> : <IconoCopiar />}
          </button>
        )}
        {enlaceValido && (
          <a className="icon-btn" href={e.contenido} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${resumen} (se abre en otra pestaña)`}>
            <IconoExterno />
          </a>
        )}
        {e.tipo === 'archivo' && (
          <button
            type="button"
            className="icon-btn"
            aria-label={`Descargar ${resumen}`}
            disabled={!enLinea || pendienteDeSubir}
            onClick={() => void descargar()}
          >
            <IconoDescargar />
          </button>
        )}
        {/* Botón conmutador: nombre fijo y el estado lo da aria-pressed (y el icono relleno) */}
        <button
          type="button"
          ref={botonFijar}
          className={`icon-btn${e.fijado ? ' icon-btn--activo' : ''}`}
          aria-pressed={e.fijado}
          aria-label={`Fijar: ${resumen}`}
          onClick={() => void fijar()}
        >
          <IconoFijar />
        </button>
        <button type="button" ref={botonBorrar} className="icon-btn icon-btn--peligro" aria-label={`Borrar: ${resumen}`} onClick={() => setBorrando(true)}>
          <IconoBorrar />
        </button>
      </div>
      <span className="visually-hidden" role="status">
        {copiado ? 'Copiado al portapapeles' : ''}
      </span>
    </li>
  )
}
