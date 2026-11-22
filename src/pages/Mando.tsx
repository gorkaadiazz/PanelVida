// Mando del PC: tus PC vinculados (encendido o apagado), vincular uno nuevo
// y desvincular. Los botones del mando (apagar, volumen…) van en cada PC.

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
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
  const [aviso, setAviso] = useState('')

  /** Al desvincular, la tarjeta desaparece: el foco va al h1 y se anuncia. */
  const alDesvincular = useCallback((nombre: string) => {
    setAviso(`«${nombre}» desvinculado`)
    document.querySelector<HTMLElement>('main h1')?.focus()
  }, [])

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
        <span className="visually-hidden" role="status">
          {aviso}
        </span>
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
            Instala el agente en tu PC de casa y vincúlalo con el botón de abajo.
          </Vacio>
        ) : (
          pcs?.map((pc) => (
            <TarjetaPC key={pc.id} pc={pc} ahora={ahora} ejecutar={ejecutar} alCambiar={cargar} alDesvincular={alDesvincular} />
          ))
        )}

        <Vincular ejecutar={ejecutar} />
      </div>
    </Pagina>
  )
}

function TarjetaPC({
  pc,
  ahora,
  ejecutar,
  alCambiar,
  alDesvincular,
}: {
  pc: PC
  ahora: number
  ejecutar: Ejecutar
  alCambiar: () => void
  alDesvincular: (nombre: string) => void
}) {
  const id = useId()
  const estado = estadoPC(pc.ultimo_latido, ahora)
  const [modo, setModo] = useState<'ver' | 'renombrar' | 'desvincular'>('ver')
  const [nombre, setNombre] = useState(pc.nombre)
  // Al cerrar «Cambiar nombre» o la confirmación, el foco vuelve al botón que la abrió
  const botonNombre = useRef<HTMLButtonElement>(null)
  const botonQuitar = useRef<HTMLButtonElement>(null)
  const volverA = useRef<'nombre' | 'quitar' | null>(null)
  useEffect(() => {
    if (modo !== 'ver' || !volverA.current) return
    const boton = volverA.current === 'nombre' ? botonNombre : botonQuitar
    boton.current?.focus()
    volverA.current = null
  }, [modo])
  const volver = (a: 'nombre' | 'quitar') => {
    volverA.current = a
    setModo('ver')
  }
  const conEscape = (a: 'nombre' | 'quitar') => (e: KeyboardEvent) => {
    if (e.key === 'Escape') volver(a)
  }

  return (
    <section className="card stack pc" aria-labelledby={`${id}-nombre`} style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
      <div className="row row--between pc__cabecera">
        <h2 id={`${id}-nombre`} className="card__titulo break">
          <IconoPC />
          {pc.nombre}
        </h2>
        {/* El estado va en texto; el punto (relleno o hueco) solo lo refuerza */}
        <span className={`tag pc__estado ${estado.encendido ? 'tag--ok' : ''}`}>
          <span className={`pc__punto${estado.encendido ? ' pc__punto--on' : ''}`} aria-hidden="true" />
          {estado.texto}
        </span>
      </div>

      {modo === 'renombrar' ? (
        <form
          className="stack"
          style={{ '--gap': 'var(--sp-2)' } as CSSProperties}
          onKeyDown={conEscape('nombre')}
          onSubmit={(e) => {
            e.preventDefault()
            void ejecutar(async () => {
              await renombrarPC(pc.id, nombre)
              volver('nombre')
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
            <button type="button" className="btn btn--ghost" onClick={() => volver('nombre')}>
              Cancelar
            </button>
          </div>
        </form>
      ) : modo === 'desvincular' ? (
        <div className="confirmar" role="group" aria-labelledby={`${id}-confirmar`} onKeyDown={conEscape('quitar')}>
          <span id={`${id}-confirmar`} className="break">
            ¿Desvincular «{pc.nombre}»? Dejará de funcionar ahora mismo; para volver a usarlo habrá que vincularlo otra vez.
          </span>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() =>
              void ejecutar(async () => {
                await desvincularPC(pc.id)
                alDesvincular(pc.nombre)
                alCambiar()
              })
            }
          >
            Desvincular
          </button>
          <button type="button" className="btn btn--ghost" autoFocus onClick={() => volver('quitar')}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="row pc__acciones">
          <button ref={botonNombre} type="button" className="btn btn--ghost btn--sm" onClick={() => setModo('renombrar')}>
            Cambiar nombre
          </button>
          <button ref={botonQuitar} type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => setModo('desvincular')}>
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
  const seccion = useRef<HTMLElement>(null)
  const botonVincular = useRef<HTMLButtonElement>(null)
  const restante = codigo ? cuentaAtras(codigo.caduca_en, ahora) : null
  const comando = codigo ? comandoVincular(codigo.codigo, nombre) : ''
  // La cuenta atrás no se anuncia cada segundo (role="timer" es aria-live off):
  // solo se avisa una vez al quedar el último minuto y otra al caducar.
  const caducado = codigo !== null && restante === null
  const ultimoMinuto = codigo !== null && restante !== null && Date.parse(codigo.caduca_en) - ahora <= 60_000
  const avisoTiempo = caducado ? 'El código ha caducado. Pide otro.' : ultimoMinuto ? 'Queda menos de un minuto para que caduque el código.' : ''

  // Si caduca con el foco dentro del bloque, el foco no se pierde: va al botón
  useEffect(() => {
    if (!caducado) return
    const activo = document.activeElement
    if (activo === document.body || seccion.current?.contains(activo)) botonVincular.current?.focus({ preventScroll: true })
  }, [caducado])

  return (
    <section ref={seccion} className="card stack" aria-labelledby={`${id}-titulo`} style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
      <h2 id={`${id}-titulo`} ref={titulo} className="t-section" tabIndex={-1}>
        Vincular un PC
      </h2>
      <span className="visually-hidden" role="status">
        {avisoTiempo}
      </span>
      {codigo && restante ? (
        <>
          <div className="field">
            <label htmlFor={`${id}-nombre`} className="field__label">
              Nombre del PC
            </label>
            <input id={`${id}-nombre`} className="input" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <p className="muted">
            En el PC (con el agente instalado), abre una terminal y pega esto:
          </p>
          <pre className="pc__comando">
            <code>{comando}</code>
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
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setCodigo(null)
                requestAnimationFrame(() => botonVincular.current?.focus())
              }}
            >
              Hecho
            </button>
          </div>
          <span className="visually-hidden" role="status">
            {copiado ? 'Comando copiado' : ''}
          </span>
        </>
      ) : (
        <>
          {caducado && <p className="t-small text-warn">El código ha caducado sin usarse. Pide otro.</p>}
          <p className="muted">
            Te damos un código de un solo uso que caduca en 10 minutos. Con él, el agente del PC obtiene su propia cuenta, que solo puede usar el
            Mando, la red y el Puente: nunca tus hábitos, tu dinero ni tus tareas.
          </p>
          <button
            ref={botonVincular}
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
