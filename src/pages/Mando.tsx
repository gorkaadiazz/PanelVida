// Mando del PC: tus PC vinculados (encendido o apagado), vincular uno nuevo
// y desvincular. Los botones del mando (apagar, volumen…) van en cada PC.

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useSesion } from '../auth/useSesion'
import { AvisoError } from '../components/AvisoError'
import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { IconoCopiar, IconoPC } from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { useEnLinea } from '../components/useEnLinea'
import { comandoVincular, cuentaAtras, estadoPC } from '../lib/agentes'
import { crearCodigoVinculacion, desvincularPC, escucharPCs, listarPCs, renombrarPC, type PC } from '../repos/agentes'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

/** Vuelve a pintar cada 15 s (para «visto hace…» y la cuenta atrás del código). */
function useAhora(cada = 15_000): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), cada)
    return () => clearInterval(t)
  }, [cada])
  return ahora
}

export function Mando() {
  const { usuario } = useSesion()
  const enLinea = useEnLinea()
  const { error, ejecutar, limpiar } = useAccion()
  const [pcs, setPcs] = useState<PC[] | null>(null)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const ahora = useAhora()

  const cargar = useCallback(() => {
    listarPCs().then(
      (lista) => {
        setPcs(lista)
        setErrorLectura(null)
      },
      (e: unknown) => setErrorLectura(e instanceof Error ? e.message : 'No se han podido leer tus PC.'),
    )
  }, [])

  useEffect(() => {
    if (!enLinea || !usuario) return
    cargar()
    return escucharPCs(usuario.id, cargar)
  }, [enLinea, usuario, cargar])

  return (
    <Pagina titulo="Mando del PC">
      <div className="stack">
        <AvisoError mensaje={error} onCerrar={limpiar} />
        {!enLinea && <AvisoError mensaje="Sin conexión: el Mando del PC necesita internet." />}
        {errorLectura && enLinea && <AvisoError mensaje={errorLectura} />}

        {pcs === null && enLinea && !errorLectura ? (
          <div role="status" aria-busy="true">
            <span className="visually-hidden">Cargando tus PC…</span>
            <span className="skeleton" style={{ '--h': '5rem' } as CSSProperties} />
          </div>
        ) : pcs && pcs.length === 0 ? (
          <Vacio icono={<IconoPC />} titulo="Aún no has vinculado ningún PC">
            Instala el agente en tu PC (te lo explica docs/AGENTE.md) y vincúlalo con el botón de abajo.
          </Vacio>
        ) : (
          pcs?.map((pc) => <TarjetaPC key={pc.id} pc={pc} ahora={ahora} ejecutar={ejecutar} alCambiar={cargar} />)
        )}

        <Vincular ejecutar={ejecutar} />
      </div>
    </Pagina>
  )
}

function TarjetaPC({ pc, ahora, ejecutar, alCambiar }: { pc: PC; ahora: number; ejecutar: Ejecutar; alCambiar: () => void }) {
  const id = useId()
  const estado = estadoPC(pc.ultimo_latido, ahora)
  const [modo, setModo] = useState<'ver' | 'renombrar' | 'desvincular'>('ver')
  const [nombre, setNombre] = useState(pc.nombre)

  return (
    <section className="card stack pc" aria-labelledby={`${id}-nombre`} style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
      <div className="row row--between">
        <h2 id={`${id}-nombre`} className="card__titulo break">
          <IconoPC />
          {pc.nombre}
        </h2>
        <span className={`tag ${estado.encendido ? 'tag--ok' : ''}`}>
          <span className={`pc__punto${estado.encendido ? ' pc__punto--on' : ''}`} aria-hidden="true" />
          {estado.texto}
        </span>
      </div>

      {modo === 'renombrar' ? (
        <form
          className="stack"
          style={{ '--gap': 'var(--sp-2)' } as CSSProperties}
          onSubmit={(e) => {
            e.preventDefault()
            void ejecutar(async () => {
              await renombrarPC(pc.id, nombre)
              setModo('ver')
              alCambiar()
            })
          }}
        >
          <div className="field">
            <label htmlFor={`${id}-nuevo`} className="field__label">
              Nombre del PC
            </label>
            <input id={`${id}-nuevo`} className="input" value={nombre} maxLength={40} autoFocus onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="row">
            <button type="submit" className="btn btn--primary">
              Guardar
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setModo('ver')}>
              Cancelar
            </button>
          </div>
        </form>
      ) : modo === 'desvincular' ? (
        <div className="confirmar" role="group" aria-label="Confirmar desvincular">
          <span className="break">¿Desvincular «{pc.nombre}»? Dejará de funcionar ahora mismo; para volver a usarlo habrá que vincularlo otra vez.</span>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() =>
              void ejecutar(async () => {
                await desvincularPC(pc.id)
                alCambiar()
              })
            }
          >
            Desvincular
          </button>
          <button type="button" className="btn btn--ghost" autoFocus onClick={() => setModo('ver')}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="row pc__acciones">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModo('renombrar')}>
            Cambiar nombre
          </button>
          <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => setModo('desvincular')}>
            Desvincular
          </button>
        </div>
      )}
    </section>
  )
}

function Vincular({ ejecutar }: { ejecutar: Ejecutar }) {
  const enLinea = useEnLinea()
  const id = useId()
  const [codigo, setCodigo] = useState<{ codigo: string; caduca_en: string } | null>(null)
  const [nombre, setNombre] = useState('PC casa')
  const [copiado, setCopiado] = useState(false)
  const ahora = useAhora(1000)
  const titulo = useRef<HTMLHeadingElement>(null)
  const restante = codigo ? cuentaAtras(codigo.caduca_en, ahora) : null
  const comando = codigo ? comandoVincular(codigo.codigo, nombre) : ''

  return (
    <section className="card stack" aria-labelledby={`${id}-titulo`} style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
      <h2 id={`${id}-titulo`} ref={titulo} className="t-section" tabIndex={-1}>
        Vincular un PC
      </h2>
      {codigo && restante ? (
        <>
          <p className="muted">En el PC (con el agente instalado), abre una terminal y pega esto:</p>
          <div className="field">
            <label htmlFor={`${id}-nombre`} className="field__label">
              Nombre del PC
            </label>
            <input id={`${id}-nombre`} className="input" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <pre className="pc__comando" tabIndex={0} aria-label="Comando para vincular">
            {comando}
          </pre>
          <p className="t-small muted" role="timer" aria-live="off">
            El código caduca en <span className="num">{restante}</span> y sirve una sola vez.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() =>
                void ejecutar(async () => {
                  await navigator.clipboard.writeText(comando)
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 2000)
                })
              }
            >
              <IconoCopiar /> {copiado ? 'Copiado' : 'Copiar el comando'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setCodigo(null)}>
              Hecho
            </button>
          </div>
          <span className="visually-hidden" role="status">
            {copiado ? 'Comando copiado' : ''}
          </span>
        </>
      ) : (
        <>
          <p className="muted">
            Te damos un código de un solo uso que caduca en 10 minutos. Con él, el agente del PC obtiene su propia cuenta, que solo puede usar el
            Mando, la red y el Puente: nunca tus hábitos, tu dinero ni tus tareas.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!enLinea}
            onClick={() =>
              void ejecutar(async () => {
                setCodigo(await crearCodigoVinculacion())
                requestAnimationFrame(() => titulo.current?.focus())
              })
            }
          >
            Vincular un PC
          </button>
        </>
      )}
    </section>
  )
}
